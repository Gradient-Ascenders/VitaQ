const supabase = require('../../lib/supabaseClient');

const {
  estimateAverageConsultationMinutes,
  calculatePredictedWaitMinutes
} = require('./queuePrediction.helper');

const ACTIVE_QUEUE_STATUSES = ['waiting', 'in_consultation'];
const TERMINAL_QUEUE_STATUSES = ['complete', 'cancelled'];

/**
 * Creates a standard service error with an HTTP status code.
 * This matches the existing queue service error style.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Fetches the queue entry that the patient wants a prediction for.
 */
async function fetchQueueEntryById(queueEntryId) {
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
      joined_at,
      consultation_started_at,
      completed_at,
      created_at,
      updated_at
    `)
    .eq('id', queueEntryId)
    .single();

  if (error || !data) {
    throw createServiceError('Queue entry not found.', 404);
  }

  return data;
}

/**
 * Fetches active patients ahead of the current queue entry.
 * Completed and cancelled entries are ignored because they no longer affect waiting time.
 */
async function fetchActiveEntriesAhead(queueEntry) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      queue_number,
      status
    `)
    .eq('clinic_id', queueEntry.clinic_id)
    .eq('queue_date', queueEntry.queue_date)
    .lt('queue_number', queueEntry.queue_number)
    .in('status', ACTIVE_QUEUE_STATUSES)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch active queue entries ahead.', 500);
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Fetches recent completed queue rows for the same clinic.
 * These rows provide historical consultation durations.
 */
async function fetchHistoricalCompletedEntries(clinicId) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      queue_date,
      status,
      joined_at,
      consultation_started_at,
      completed_at,
      created_at
    `)
    .eq('clinic_id', clinicId)
    .eq('status', 'complete')
    .not('consultation_started_at', 'is', null)
    .not('completed_at', 'is', null)
    .gte('queue_date', ninetyDaysAgo.toISOString().slice(0, 10))
    .order('queue_date', { ascending: false })
    .limit(200);

  if (error) {
    throw createServiceError('Failed to fetch historical queue data.', 500);
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Stores the latest prediction back onto the queue entry.
 * If this fails, the endpoint can still return the calculated prediction.
 */
async function updateEstimatedWaitMinutes(queueEntryId, predictedWaitMinutes) {
  const { error } = await supabase
    .from('queue_entries')
    .update({
      estimated_wait_minutes: predictedWaitMinutes,
      updated_at: new Date().toISOString()
    })
    .eq('id', queueEntryId);

  return !error;
}

/**
 * Main service function used by the controller.
 * It calculates an explainable wait-time prediction for a queue entry.
 */
async function getPredictedWaitTimeForQueueEntry({ queueEntryId, patientId }) {
  if (!queueEntryId || !patientId) {
    throw createServiceError('queue entry id and patient id are required.', 400);
  }

  const queueEntry = await fetchQueueEntryById(queueEntryId);

  // Patients may only view predictions for their own queue entries.
  if (String(queueEntry.patient_id) !== String(patientId)) {
    throw createServiceError('You can only view your own queue prediction.', 403);
  }

  // Terminal entries no longer have a waiting time.
  if (TERMINAL_QUEUE_STATUSES.includes(queueEntry.status)) {
    return {
      queue_entry_id: queueEntry.id,
      clinic_id: queueEntry.clinic_id,
      queue_date: queueEntry.queue_date,
      status: queueEntry.status,
      predicted_wait_minutes: 0,
      active_patients_ahead: 0,
      waiting_ahead: 0,
      in_consultation_ahead: 0,
      average_consultation_minutes: 0,
      basis: 'queue_entry_not_active',
      sample_size: 0,
      persisted: false,
      message: 'This queue entry is no longer active.'
    };
  }

  // If the patient is already being seen, they are no longer waiting.
  if (queueEntry.status === 'in_consultation') {
    const persisted = await updateEstimatedWaitMinutes(queueEntry.id, 0);

    return {
      queue_entry_id: queueEntry.id,
      clinic_id: queueEntry.clinic_id,
      queue_date: queueEntry.queue_date,
      status: queueEntry.status,
      predicted_wait_minutes: 0,
      active_patients_ahead: 0,
      waiting_ahead: 0,
      in_consultation_ahead: 0,
      average_consultation_minutes: 0,
      basis: 'patient_already_in_consultation',
      sample_size: 0,
      persisted,
      message: 'The patient is already in consultation.'
    };
  }

  const activeEntriesAhead = await fetchActiveEntriesAhead(queueEntry);
  const historicalEntries = await fetchHistoricalCompletedEntries(queueEntry.clinic_id);

  const {
    averageConsultationMinutes,
    basis,
    sampleSize
  } = estimateAverageConsultationMinutes(historicalEntries, queueEntry);

  const {
    predictedWaitMinutes,
    waitingAhead,
    inConsultationAhead,
    activePatientsAhead
  } = calculatePredictedWaitMinutes({
    activeEntriesAhead,
    averageConsultationMinutes
  });

  const persisted = await updateEstimatedWaitMinutes(
    queueEntry.id,
    predictedWaitMinutes
  );

  return {
    queue_entry_id: queueEntry.id,
    clinic_id: queueEntry.clinic_id,
    queue_date: queueEntry.queue_date,
    status: queueEntry.status,
    predicted_wait_minutes: predictedWaitMinutes,
    active_patients_ahead: activePatientsAhead,
    waiting_ahead: waitingAhead,
    in_consultation_ahead: inConsultationAhead,
    average_consultation_minutes: averageConsultationMinutes,
    basis,
    sample_size: sampleSize,
    persisted,
    message: 'Predicted wait time calculated successfully.'
  };
}

module.exports = {
  getPredictedWaitTimeForQueueEntry
};