const {
  joinQueueFromAppointment,
  createWalkInQueueEntry,
  fetchPatientQueueStatus,
  fetchStaffQueue,
  updateQueueEntryStatus
} = require('./queue.service');

/**
 * Handles POST /api/queue/join.
 * The patient must be logged in and must provide an appointment_id.
 */
async function joinQueue(req, res) {
  try {
    // Auth middleware adds the logged-in Supabase user to req.user.
    const patientId = req.user.id;

    // Convert snake_case body field into a clearer camelCase variable.
    const { appointment_id: appointmentId } = req.body;

    // Ask the service to validate and create the queue entry.
    const result = await joinQueueFromAppointment({
      patientId,
      appointmentId
    });

    return res.status(201).json({
      success: true,
      message: 'Joined queue successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to join queue.'
    });
  }
}

/**
 * Handles POST /api/queue/staff/walk-in.
 * Allows approved staff to add a walk-in patient to their clinic queue
 * without needing a linked appointment booking.
 */
async function addStaffWalkIn(req, res) {
  try {
    const staffUserId = req.user.id;

    // clinic_id is accepted for compatibility with the frontend,
    // but the service still enforces the staff member's assigned clinic.
    const {
      patient_id: patientId,
      clinic_id: clinicId,
      queue_date: queueDate
    } = req.body;

    const result = await createWalkInQueueEntry({
      patientId,
      clinicId,
      queueDate,
      staffUserId
    });

    return res.status(201).json({
      success: true,
      message: 'Walk-in patient added to queue successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add walk-in patient.'
    });
  }
}

/**
 * Handles GET /api/queue/my-status.
 * Returns the logged-in patient's queue status for a clinic and date.
 */
async function getMyQueueStatus(req, res) {
  try {
    const patientId = req.user.id;
    const {
      clinic_id: clinicId,
      date: queueDate,
      appointment_id: appointmentId
    } = req.query;

    const result = await fetchPatientQueueStatus({
      patientId,
      clinicId,
      queueDate,
      appointmentId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch queue status.'
    });
  }
}

/**
 * Handles GET /api/queue/staff.
 * Returns the clinic queue for a staff member using their assigned clinic and queue date.
 */
async function getStaffQueue(req, res) {
  try {
    // The clinic is resolved from the logged-in approved staff user.
    const { date: queueDate } = req.query;

    const result = await fetchStaffQueue({
      staffUserId: req.user.id,
      queueDate
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch staff queue.'
    });
  }
}

/**
 * Handles PATCH /api/queue/staff/:entryId/status.
 * Allows staff to move a patient through the queue.
 */
async function updateStaffQueueStatus(req, res) {
  try {
    // The queue entry id comes from the route parameter.
    const { entryId } = req.params;

    // The new status comes from the request body.
    const { status } = req.body;

    const result = await updateQueueEntryStatus({
      entryId,
      status,
      staffUserId: req.user.id
    });

    return res.status(200).json({
      success: true,
      message: 'Queue status updated successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update queue status.'
    });
  }
}

module.exports = {
  joinQueue,
  addStaffWalkIn,
  getMyQueueStatus,
  getStaffQueue,
  updateStaffQueueStatus
};
