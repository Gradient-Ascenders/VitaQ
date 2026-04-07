const express = require('express');
const { bookAppointment } = require('./appointments.controller');

const router = express.Router();

/**
 * POST /api/appointments
 *
 * Creates a new appointment booking for a patient.
 */
router.post('/', bookAppointment);

module.exports = router;