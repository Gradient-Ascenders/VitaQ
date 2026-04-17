const express = require('express');
const {
  joinQueue,
  addStaffWalkIn,
  getMyQueueStatus,
  getStaffQueue,
  updateStaffQueueStatus
} = require('./queue.controller');

const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/queue/my-status
// Returns the logged-in patient's queue status for a clinic visit date.
router.get('/my-status', authMiddleware, getMyQueueStatus);

// POST /api/queue/join
// Allows the logged-in patient to join the queue using an appointment.
router.post('/join', authMiddleware, joinQueue);

// POST /api/queue/staff/walk-in
// Allows approved staff to add a walk-in patient to their assigned clinic queue.
router.post(
  '/staff/walk-in',
  authMiddleware,
  authMiddleware.requireStaff,
  addStaffWalkIn
);

// GET /api/queue/staff?date=...
// Allows staff to retrieve the queue for their assigned clinic and date.
router.get(
  '/staff',
  authMiddleware,
  authMiddleware.requireStaff,
  getStaffQueue
);

// PATCH /api/queue/staff/:entryId/status
// Allows staff to update a queue entry status.
router.patch(
  '/staff/:entryId/status',
  authMiddleware,
  authMiddleware.requireStaff,
  updateStaffQueueStatus
);

module.exports = router;