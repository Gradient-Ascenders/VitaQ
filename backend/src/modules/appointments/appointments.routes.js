const express = require('express');
const {
  bookAppointment,
  getMyAppointments,
  cancelMyAppointment,
  rescheduleMyAppointment
} = require('./appointments.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/appointments
// Returns all appointments for the logged-in patient
router.get('/', authMiddleware, getMyAppointments);

// POST /api/appointments
// Creates a new appointment for the logged-in patient
router.post('/', authMiddleware, bookAppointment);

// PATCH /api/appointments/:appointmentId/cancel
// Cancels an appointment owned by the logged-in patient
router.patch('/:appointmentId/cancel', authMiddleware, cancelMyAppointment);

// PATCH /api/appointments/:appointmentId/reschedule
// Moves an appointment owned by the logged-in patient to a new available slot
router.patch('/:appointmentId/reschedule', authMiddleware, rescheduleMyAppointment);

module.exports = router;