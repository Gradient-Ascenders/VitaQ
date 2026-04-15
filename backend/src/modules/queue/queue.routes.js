const express = require('express');
const { joinQueue } = require('./queue.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// POST /api/queue/join
// Allows the logged-in patient to join the queue using an appointment.
router.post('/join', authMiddleware, joinQueue);

module.exports = router;