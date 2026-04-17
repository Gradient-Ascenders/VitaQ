const supabase = require('../../lib/supabaseClient');

const WAIT_MINUTES_PER_PATIENT = 15;
const ALLOWED_QUEUE_STATUSES = ['waiting', 'in_consultation', 'complete', 'cancelled'];

// This keeps status movement controlled.
// complete and cancelled are terminal states, so they cannot be reopened.
const ALLOWED_STATUS_TRANSITIONS = {
  waiting: ['in_consultation', 'cancelled'],
  in_consultation: ['complete', 'cancelled'],
  complete: [],
  cancelled: []
};

// Only these statuses should count in the live queue position.
const ACTIVE_QUEUE_STATUSES = ['waiting', 'in_consultation'];

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
 * Formats today's local date as YYYY-MM-DD.
 * This avoids UTC rollover shifting the queue date unexpectedly.
 */
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Returns true when an entry is still part of the active queue.
 * Completed and cancelled entries should not affect live position.
 */
function isActiveQueueStatus(status) {
  return ACTIVE_QUEUE_STATUSES.includes(status);
}

/**
 * Sorts queue entries by queue number only.
 * This matches the Sprint 2 rule that queue position is derived from:
 * clinic_id + queue_date + queue_number + active-status filtering.
 */
function sortQueueEntriesByQueueNumber(entries) {
  return [...entries].sort((leftEntry, rightEntry) => {
    const leftQueueNumber = Number(leftEntry?.queue_number || 0);
    const rightQueueNumber = Number(rightEntry?.queue_number || 0);

    if (leftQueueNumber !== rightQueueNumber) {
      return leftQueueNumber - rightQueueNumber;
    }

    // Fallback for stable ordering if queue numbers ever match unexpectedly.
    return String(leftEntry?.created_at || '').localeCompare(
      String(rightEntry?.created_at || '')
    );
  });
}

/**
 * Returns active entries only, ordered by queue number.
 * These are the only rows that should count when calculating live position.
 */
function getActiveQueueEntries(entries) {
  return sortQueueEntriesByQueueNumber(entries).filter((entry) =>
    isActiveQueueStatus(entry.status)
  );
}

/**
 * Converts the appointment slot start time into a short HH:MM label.
 * Walk-ins show a friendly label instead of a slot time.
 */
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

/**
 * Builds a lightweight queue summary for the patient/staff view.
 * This helps the frontend show totals by queue status.
 */
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

/**
 * Calculates a patient's live position from active same-clinic, same-date entries.
 * The ordering rule is queue_number, not appointment time.
 *
 * Example:
 * queue_number 1 = complete   -> ignored
 * queue_number 2 = waiting    -> counts
 * queue_number 3 = waiting    -> patient position = 2
 */
function calculateLivePosition(entries, patientEntryId) {
  const activeEntries = getActiveQueueEntries(entries);
  const positionIndex = activeEntries.findIndex(
    (entry) => String(entry.id) === String(patientEntryId)
  );

  return positionIndex === -1 ? null : positionIndex + 1;
}

/**
 * Maps raw queue entries into a simpler frontend-friendly structure.
 * Positions are only shown for active queue entries.
 */
function mapQueueEntriesForPatient(entries, patientId) {
  const orderedEntries = sortQueueEntriesByQueueNumber(entries);
  const activeEntries = getActiveQueueEntries(orderedEntries);

  const activePositionsById = activeEntries.reduce((positions, entry, index) => {
    positions[entry.id] = index + 1;
    return positions;
  }, {});

  return orderedEntries.map((entry) => ({
    id: entry.id,
    position: activePositionsById[entry.id] || null,
    queue_number: entry.queue_number,
    status: entry.status,
    appointment_time: formatAppointmentTimeLabel(entry),
    is_current_patient: String(entry.patient_id) === String(patientId)
  }));
}

/**
 * Creates the next queue number for a clinic on a specific day.
 * Example: 1, 2, 3.
 */
async function generateQueueNumber(clinicId, queueDate) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select('queue_number')
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: false })
    .limit(1);

  if (error) {
    throw createServiceError('Failed to generate queue number.', 500);
  }

  const highestQueueNumber = Number(data?.[0]?.queue_number || 0);

  return highestQueueNumber + 1;
}

/**
 * Fetches all queue entries for a clinic and date.
 * The returned array is ordered by queue_number for live position calculation.
 */
async function fetchQueueEntriesForClinicDate(clinicId, queueDate) {
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

  return sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);
}

function buildQueueEntryResponse(entry, estimatedWaitMinutes) {
  return {
    id: entry.id,
    clinic_id: entry.clinic_id,
    patient_id: entry.patient_id,
    appointment_id: entry.appointment_id,
    queue_number: entry.queue_number,
    queue_date: entry.queue_date,
    source: entry.source,
    status: entry.status,
    estimated_wait_minutes: entry.status === 'waiting' ? estimatedWaitMinutes : 0,
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
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
    .eq('appointment_id', appointmentId)
    .limit(1);

  if (existingError) {
    throw createServiceError('Failed to check existing queue entry.', 500);
  }

  if (existingEntries && existingEntries.length > 0) {
    const existingEntry = existingEntries[0];

    if (String(existingEntry.patient_id) !== String(patientId)) {
      throw createServiceError('You cannot join the queue for another patient.', 403);
    }

    const queueEntries = await fetchQueueEntriesForClinicDate(
      appointment.clinic_id,
      existingEntry.queue_date
    );

    const position = existingEntry.status === 'waiting'
      ? calculateLivePosition(queueEntries, existingEntry.id)
      : null;

    const estimatedWaitMinutes = position === null
      ? 0
      : (position - 1) * WAIT_MINUTES_PER_PATIENT;

    return {
      queue_entry: buildQueueEntryResponse(existingEntry, estimatedWaitMinutes),
      position,
      appointment,
      clinic: appointment.clinic,
      slot: appointment.slot
    };
  }

  const queueDate = appointment.slot?.date || getTodayDateString();
  const queueNumber = await generateQueueNumber(appointment.clinic_id, queueDate);
  const queueEntries = await fetchQueueEntriesForClinicDate(appointment.clinic_id, queueDate);

  // Build a temporary version of the new entry so we can calculate its live position
  // before inserting it into the database.
  const provisionalEntry = {
    id: '__pending_queue_entry__',
    clinic_id: appointment.clinic_id,
    patient_id: patientId,
    appointment_id: appointmentId,
    queue_number: queueNumber,
    queue_date: queueDate,
    source: 'appointment',
    status: 'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    appointment: {
      slot: {
        start_time: appointment.slot?.start_time || null,
        end_time: appointment.slot?.end_time || null
      }
    }
  };

  const position = calculateLivePosition(
    [...queueEntries, provisionalEntry],
    provisionalEntry.id
  );

  // Simple estimate: each active patient ahead adds about 15 minutes.
  const estimatedWaitMinutes = (position - 1) * WAIT_MINUTES_PER_PATIENT;

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

  // Return enough information for the controller/frontend to show
  // the queue result together with appointment and clinic details.
  return {
    queue_entry: buildQueueEntryResponse(queueEntry, estimatedWaitMinutes),
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

  const queueEntries = sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);
  const patientEntry =
    queueEntries.find((entry) => String(entry.patient_id) === String(patientId)) || null;
  const queueSummary = buildQueueSummary(queueEntries);
  const mappedQueueEntries = mapQueueEntriesForPatient(queueEntries, patientId);

  // If the patient is not currently in this queue, still return the queue list
  // and summary so the page can render a useful empty state.
  if (!patientEntry) {
    return {
      is_in_queue: false,
      position: null,
      queue_entry: null,
      queue_summary: queueSummary,
      queue_entries: mappedQueueEntries
    };
  }

  const position = patientEntry.status === 'waiting'
    ? calculateLivePosition(queueEntries, patientEntry.id)
    : null;

  const estimatedWaitMinutes = position === null
    ? 0
    : (position - 1) * WAIT_MINUTES_PER_PATIENT;

  return {
    is_in_queue: true,
    position,
    queue_entry: {
      ...buildQueueEntryResponse(patientEntry, estimatedWaitMinutes),
      appointment_time: patientEntry.appointment?.slot?.start_time || null,
      appointment_end_time: patientEntry.appointment?.slot?.end_time || null
    },
    queue_summary: queueSummary,
    queue_entries: mappedQueueEntries
  };
}

/**
 * Maps queue entries for the staff queue page.
 * Entries remain ordered by queue_number, and waiting entries get a live position.
 */
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
      estimated_wait_minutes:
        entry.status === 'waiting' && livePosition !== null
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

  const queueEntries = sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);

  return {
    clinic_id: clinicId,
    queue_date: queueDate,
    queue_summary: buildQueueSummary(queueEntries),
    queue_entries: mapQueueEntriesForStaff(queueEntries)
  };
}

/**
 * Checks whether a status value is part of the queue workflow.
 */
function isAllowedQueueStatus(status) {
  return ALLOWED_QUEUE_STATUSES.includes(status);
}

/**
 * Checks whether staff may move a queue entry from its current status to the new status.
 * This prevents completed/cancelled queue entries from being reopened.
 */
function isAllowedStatusTransition(currentStatus, nextStatus) {
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedNextStatuses.includes(nextStatus);
}

/**
 * Fetches the approved staff request for a user.
 * We use this to find which clinic the staff member belongs to.
 */
async function fetchApprovedStaffRequest(staffUserId) {
  const { data: staffRequest, error } = await supabase
    .from('staff_requests')
    .select('id, user_id, clinic_id, status')
    .eq('user_id', staffUserId)
    .eq('status', 'approved')
    .single();

  if (error || !staffRequest) {
    throw createServiceError('Approved staff access is required.', 403);
  }

  return staffRequest;
}

/**
 * Fetches one queue entry before updating it.
 * We need the existing clinic_id and status before deciding whether the update is allowed.
 */
async function fetchQueueEntryById(entryId) {
  const { data: queueEntry, error } = await supabase
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
      updated_at
    `)
    .eq('id', entryId)
    .single();

  if (error || !queueEntry) {
    throw createServiceError('Queue entry not found.', 404);
  }

  return queueEntry;
}

/**
 * Updates a queue entry status.
 * Staff can use this to move patients through the queue.
 */
async function updateQueueEntryStatus({ entryId, status, staffUserId }) {
  if (!entryId || !status || !staffUserId) {
    throw createServiceError('queue entry id, status, and staff user id are required.', 400);
  }

  // Make sure the requested status is one of the statuses supported by the system.
  if (!isAllowedQueueStatus(status)) {
    throw createServiceError('Invalid queue status.', 400);
  }

  // Fetch the queue entry first so we can check its clinic and current status.
  const existingEntry = await fetchQueueEntryById(entryId);

  // Fetch the approved staff request so we know which clinic this staff member belongs to.
  const staffRequest = await fetchApprovedStaffRequest(staffUserId);

  // Staff should only update queue entries for their own clinic.
  if (String(staffRequest.clinic_id) !== String(existingEntry.clinic_id)) {
    throw createServiceError('You can only update queue entries for your assigned clinic.', 403);
  }

  // No need to update if the status is already the same.
  if (existingEntry.status === status) {
    return existingEntry;
  }

  // Prevent invalid workflow jumps such as complete -> waiting.
  if (!isAllowedStatusTransition(existingEntry.status, status)) {
    throw createServiceError(
      `Cannot change queue status from ${existingEntry.status} to ${status}.`,
      409
    );
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