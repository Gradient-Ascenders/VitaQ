const express = require('express');
const { runAppointmentReminderJob } = require('./notifications.controller');

const router = express.Router();

/**
 * Protects internal scheduled job endpoints.
 *
 * This is separate from normal Supabase auth because the caller is not a user;
 * it is an internal scheduler such as Azure Timer Trigger.
 */
function requireInternalJobToken(req, res, next) {
  const expectedToken = process.env.INTERNAL_JOB_TOKEN;
  const providedToken = req.headers['x-job-token'];

  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({
      success: false,
      message: 'Invalid job token.'
    });
  }

  next();
}

// POST /api/internal/jobs/appointment-reminders
router.post('/appointment-reminders', requireInternalJobToken, runAppointmentReminderJob);

module.exports = router;
module.exports.requireInternalJobToken = requireInternalJobToken;