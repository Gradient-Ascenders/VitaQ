const express = require('express');
const { bookAppointment, getMyAppointments } = require('./appointments.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, getMyAppointments);
router.post('/', authMiddleware, bookAppointment);

module.exports = router;