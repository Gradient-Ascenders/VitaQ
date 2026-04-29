const express = require('express');
const {
  getAdminClinics,
  getAdminClinicById,
  patchAdminClinic,
  getPendingStaffRequests,
  approveStaffRequest,
  rejectStaffRequest
} = require('./admin.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// GET /api/admin/clinics
// Admin-only route to view all clinics, including inactive rows, for management.
router.get(
  '/clinics',
  authMiddleware,
  authMiddleware.requireAdmin,
  getAdminClinics
);

// GET /api/admin/clinics/:clinicId
// Admin-only route to load one clinic into the management form.
router.get(
  '/clinics/:clinicId',
  authMiddleware,
  authMiddleware.requireAdmin,
  getAdminClinicById
);

// PATCH /api/admin/clinics/:clinicId
// Admin-only route to update editable clinic details.
router.patch(
  '/clinics/:clinicId',
  authMiddleware,
  authMiddleware.requireAdmin,
  patchAdminClinic
);

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
