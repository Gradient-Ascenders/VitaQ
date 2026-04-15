const supabase = require('../../lib/supabaseClient');

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

  const nextNumber = (count || 0) + 1;
  return `A${String(nextNumber).padStart(3, '0')}`;
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

module.exports = {
  joinQueueFromAppointment
};