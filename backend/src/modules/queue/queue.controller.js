const { joinQueueFromAppointment } = require('./queue.service');

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

module.exports = {
  joinQueue
};