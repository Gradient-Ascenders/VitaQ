const express = require('express');
const { bookAppointment } = require('./appointments.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

/**
 * POST /api/appointments
 *
 * Creates a new appointment booking for an authenticated patient.
 */
router.post('/', authMiddleware, bookAppointment);

module.exports = router;