const express = require('express');
const { bookAppointment, getMyAppointments } = require('./appointments.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/appointments
// Returns all appointments for the logged-in patient
router.get('/', authMiddleware, getMyAppointments);

// POST /api/appointments
// Creates a new appointment for the logged-in patient
router.post('/', authMiddleware, bookAppointment);

module.exports = router;