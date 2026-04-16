const supabase = require('../../lib/supabaseClient');
const WAIT_MINUTES_PER_PATIENT = 15;
const ALLOWED_QUEUE_STATUSES = ['waiting', 'in_consultation', 'complete'];

/**
 * Creates a standard service error with an HTTP status code.
 * This lets the controller return the correct response code.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Formats today's date as YYYY-MM-DD.
 * Used as a fallback if the appointment slot date is missing.
 */
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

function formatAppointmentTimeLabel(entry) {
  const startTime = entry?.appointment?.slot?.start_time;

  if (startTime) {
    return startTime.slice(0, 5);
  }

  if (entry?.source === 'walk_in') {
    return 'Walk-in';
  }

  return 'N/A';
}

function buildQueueSummary(entries) {
  return entries.reduce(
    (summary, entry) => {
      summary.total += 1;

      if (entry.status === 'waiting') {
        summary.waiting += 1;
      }

      if (entry.status === 'in_consultation') {
        summary.in_consultation += 1;
      }

      if (entry.status === 'complete') {
        summary.complete += 1;
      }

      return summary;
    },
    {
      total: 0,
      waiting: 0,
      in_consultation: 0,
      complete: 0
    }
  );
}

function calculateLivePosition(entries, patientEntryId) {
  const waitingEntries = entries.filter((entry) => entry.status === 'waiting');
  const positionIndex = waitingEntries.findIndex((entry) => entry.id === patientEntryId);

  return positionIndex === -1 ? null : positionIndex + 1;
}

function mapQueueEntriesForPatient(entries, patientId) {
  return entries.map((entry, index) => ({
    id: entry.id,
    position: index + 1,
    queue_number: entry.queue_number,
    status: entry.status,
    appointment_time: formatAppointmentTimeLabel(entry),
    is_current_patient: String(entry.patient_id) === String(patientId)
  }));
}

/**
 * Creates the next queue number for a clinic on a specific day.
 * Example: A001, A002, A003.
 */
async function generateQueueNumber(clinicId, queueDate) {
  const { count, error } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate);

  if (error) {
    throw createServiceError('Failed to generate queue number.', 500);
  }

  // queue_number is an integer in Supabase, so return 1, 2, 3, etc.
  return (count || 0) + 1;
}

/**
 * Calculates the patient's queue position before inserting them.
 * Only active waiting patients are counted.
 */
async function calculateQueuePosition(clinicId, queueDate) {
  const { count, error } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .eq('status', 'waiting');

  if (error) {
    throw createServiceError('Failed to calculate queue position.', 500);
  }

  return (count || 0) + 1;
}

/**
 * Allows a logged-in patient to join the queue using a booked appointment.
 */
async function joinQueueFromAppointment({ patientId, appointmentId }) {
  if (!patientId || !appointmentId) {
    throw createServiceError('patient_id and appointment_id are required.', 400);
  }

  // Fetch the appointment and its slot so we can validate ownership and date.
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      clinic_id,
      status,
      slot:appointment_slots (
        date,
        start_time,
        end_time
      ),
      clinic:clinics (
        name,
        address,
        province,
        district,
        area,
        facility_type
      )
    `)
    .eq('id', appointmentId)
    .single();

  if (appointmentError || !appointment) {
    throw createServiceError('Appointment not found.', 404);
  }

  // Patients must only join the queue for their own appointment.
  if (String(appointment.patient_id) !== String(patientId)) {
    throw createServiceError('You cannot join the queue for another patient.', 403);
  }

  // Only booked appointments should be allowed to join the queue.
  if (appointment.status !== 'booked') {
    throw createServiceError('Only booked appointments can join the queue.', 409);
  }

  // Stop duplicate queue entries for the same appointment.
  const { data: existingEntries, error: existingError } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('appointment_id', appointmentId)
    .limit(1);

  if (existingError) {
    throw createServiceError('Failed to check existing queue entry.', 500);
  }

  if (existingEntries && existingEntries.length > 0) {
    throw createServiceError('This appointment has already joined the queue.', 409);
  }

  const queueDate = appointment.slot?.date || getTodayDateString();
  const queueNumber = await generateQueueNumber(appointment.clinic_id, queueDate);
  const position = await calculateQueuePosition(appointment.clinic_id, queueDate);

  // Simple estimate: each waiting patient ahead adds about 15 minutes.
  const estimatedWaitMinutes = (position - 1) * 15;

  // Create the queue entry using the Sprint 2 queue structure.
  const { data: queueEntry, error: queueError } = await supabase
    .from('queue_entries')
    .insert([
      {
        clinic_id: appointment.clinic_id,
        patient_id: patientId,
        appointment_id: appointmentId,
        queue_number: queueNumber,
        queue_date: queueDate,
        source: 'appointment',
        status: 'waiting',
        estimated_wait_minutes: estimatedWaitMinutes
      }
    ])
    .select(`
      id,
      clinic_id,
      patient_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at
    `)
    .single();

  if (queueError) {
    throw createServiceError('Failed to join the queue.', 500);
  }

  return {
    queue_entry: queueEntry,
    position,
    appointment,
    clinic: appointment.clinic,
    slot: appointment.slot
  };
}

/**
 * Returns the logged-in patient's queue status for a clinic visit date.
 */
async function fetchPatientQueueStatus({ patientId, clinicId, queueDate }) {
  if (!patientId || !clinicId || !queueDate) {
    throw createServiceError('patient_id, clinic_id, and date are required.', 400);
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at,
      appointment:appointments (
        id,
        slot:appointment_slots (
          start_time,
          end_time
        )
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch queue status.', 500);
  }

  const queueEntries = Array.isArray(data) ? data : [];
  const patientEntry = queueEntries.find((entry) => String(entry.patient_id) === String(patientId)) || null;
  const queueSummary = buildQueueSummary(queueEntries);
  const mappedQueueEntries = mapQueueEntriesForPatient(queueEntries, patientId);

  if (!patientEntry) {
    return {
      is_in_queue: false,
      position: null,
      queue_entry: null,
      queue_summary: queueSummary,
      queue_entries: mappedQueueEntries
    };
  }

  const position = calculateLivePosition(queueEntries, patientEntry.id);
  const estimatedWaitMinutes = position === null ? 0 : (position - 1) * WAIT_MINUTES_PER_PATIENT;

  return {
    is_in_queue: true,
    position,
    queue_entry: {
      id: patientEntry.id,
      clinic_id: patientEntry.clinic_id,
      appointment_id: patientEntry.appointment_id,
      queue_number: patientEntry.queue_number,
      queue_date: patientEntry.queue_date,
      source: patientEntry.source,
      status: patientEntry.status,
      estimated_wait_minutes: patientEntry.status === 'waiting' ? estimatedWaitMinutes : 0,
      created_at: patientEntry.created_at,
      updated_at: patientEntry.updated_at,
      appointment_time: patientEntry.appointment?.slot?.start_time || null,
      appointment_end_time: patientEntry.appointment?.slot?.end_time || null
    },
    queue_summary: queueSummary,
    queue_entries: mappedQueueEntries
  };
}

function mapQueueEntriesForStaff(entries) {
  return entries.map((entry) => {
    const livePosition = entry.status === 'waiting'
      ? calculateLivePosition(entries, entry.id)
      : null;

    return {
      id: entry.id,
      clinic_id: entry.clinic_id,
      patient_id: entry.patient_id,
      appointment_id: entry.appointment_id,
      queue_number: entry.queue_number,
      queue_date: entry.queue_date,
      source: entry.source,
      status: entry.status,
      estimated_wait_minutes: entry.status === 'waiting' && livePosition !== null
        ? (livePosition - 1) * WAIT_MINUTES_PER_PATIENT
        : 0,
      live_position: livePosition,
      appointment_time: entry.appointment?.slot?.start_time || null,
      appointment_end_time: entry.appointment?.slot?.end_time || null,
      created_at: entry.created_at,
      updated_at: entry.updated_at
    };
  });
}

/**
 * Returns the clinic queue for staff users.
 * This is used by the staff queue management page.
 */
async function fetchStaffQueue({ clinicId, queueDate }) {
  if (!clinicId || !queueDate) {
    throw createServiceError('clinic_id and date are required.', 400);
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at,
      appointment:appointments (
        id,
        slot:appointment_slots (
          start_time,
          end_time
        )
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch staff queue.', 500);
  }

  const queueEntries = Array.isArray(data) ? data : [];

  return {
    clinic_id: clinicId,
    queue_date: queueDate,
    queue_summary: buildQueueSummary(queueEntries),
    queue_entries: mapQueueEntriesForStaff(queueEntries)
  };
}

/**
 * Updates a queue entry status.
 * Staff can use this to move patients through the queue.
 */
async function updateQueueEntryStatus({ entryId, status }) {
  if (!entryId || !status) {
    throw createServiceError('queue entry id and status are required.', 400);
  }

  if (!ALLOWED_QUEUE_STATUSES.includes(status)) {
    throw createServiceError('Invalid queue status.', 400);
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .update({
      status
    })
    .eq('id', entryId)
    .select(`
      id,
      clinic_id,
      patient_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    throw createServiceError('Failed to update queue status.', 500);
  }

  return data;
}

module.exports = {
  joinQueueFromAppointment,
  fetchPatientQueueStatus,
  fetchStaffQueue,
  updateQueueEntryStatus
};
