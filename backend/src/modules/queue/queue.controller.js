const {
  joinQueueFromAppointment,
  fetchPatientQueueStatus
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
 * Handles GET /api/queue/my-status.
 * Returns the logged-in patient's queue status for a clinic and date.
 */
async function getMyQueueStatus(req, res) {
  try {
    const patientId = req.user.id;
    const { clinic_id: clinicId, date: queueDate } = req.query;

    const result = await fetchPatientQueueStatus({
      patientId,
      clinicId,
      queueDate
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

module.exports = {
  joinQueue,
  getMyQueueStatus
};
