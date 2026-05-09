const { processAppointmentReminderJob } = require('./reminderJob.service');

/**
 * Handles POST /api/internal/jobs/appointment-reminders.
 * This endpoint is intended for Azure Timer Trigger or another trusted scheduler.
 */
async function runAppointmentReminderJob(req, res) {
  try {
    const summary = await processAppointmentReminderJob();

    return res.status(200).json({
      success: true,
      message: 'Appointment reminder job completed.',
      data: summary
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Appointment reminder job failed.'
    });
  }
}

module.exports = {
  runAppointmentReminderJob
};