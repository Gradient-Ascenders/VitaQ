const express = require('express');
const { joinQueue, getMyQueueStatus } = require('./queue.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/queue/my-status
// Returns the logged-in patient's queue status for a clinic visit date.
router.get('/my-status', authMiddleware, getMyQueueStatus);

// POST /api/queue/join
// Allows the logged-in patient to join the queue using an appointment.
router.post('/join', authMiddleware, joinQueue);

module.exports = router;
