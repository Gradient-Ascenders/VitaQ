const express = require('express');
const { submitStaffRequest } = require('./staff.controller');
const {
  createSlotTemplate,
  generateUpcomingSlots,
  getSlotTemplates,
  updateSlotTemplate
} = require('./slotTemplates.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// POST /api/staff/requests
// Creates a pending staff registration request for the logged-in user.
router.post('/requests', authMiddleware, submitStaffRequest);

// GET /api/staff/slot-templates
// Returns recurring slot templates for the logged-in staff member's clinic.
router.get(
  '/slot-templates',
  authMiddleware,
  authMiddleware.requireStaff,
  getSlotTemplates
);

// POST /api/staff/slot-templates
// Creates a recurring slot template for the staff member's clinic.
router.post(
  '/slot-templates',
  authMiddleware,
  authMiddleware.requireStaff,
  createSlotTemplate
);

// PATCH /api/staff/slot-templates/:templateId
// Updates an existing slot template for the staff member's clinic.
router.patch(
  '/slot-templates/:templateId',
  authMiddleware,
  authMiddleware.requireStaff,
  updateSlotTemplate
);

// POST /api/staff/slot-templates/generate
// Generates appointment slots from the clinic's active recurring templates.
router.post(
  '/slot-templates/generate',
  authMiddleware,
  authMiddleware.requireStaff,
  generateUpcomingSlots
);

module.exports = router;
