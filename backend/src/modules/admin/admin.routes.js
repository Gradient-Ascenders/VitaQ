const express = require('express');
const {
  getPendingStaffRequests,
  approveStaffRequest,
  rejectStaffRequest
} = require('./admin.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/admin/staff-requests/pending
// Admin-only route to view pending staff registration requests.
router.get(
  '/staff-requests/pending',
  authMiddleware,
  authMiddleware.requireAdmin,
  getPendingStaffRequests
);

// PATCH /api/admin/staff-requests/:requestId/approve
// Admin-only route to approve a pending staff request.
router.patch(
  '/staff-requests/:requestId/approve',
  authMiddleware,
  authMiddleware.requireAdmin,
  approveStaffRequest
);

// PATCH /api/admin/staff-requests/:requestId/reject
// Admin-only route to reject a pending staff request.
router.patch(
  '/staff-requests/:requestId/reject',
  authMiddleware,
  authMiddleware.requireAdmin,
  rejectStaffRequest
);

module.exports = router;