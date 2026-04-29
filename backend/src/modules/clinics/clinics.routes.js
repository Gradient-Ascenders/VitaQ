const express = require('express');
const router = express.Router();

const {
  getClinics,
  getClinicById,
  updateClinic
} = require('./clinics.controller');
const authMiddleware = require('../../middleware/auth');

// GET /api/clinics
// Returns all active clinics, optionally filtered by query parameters.
router.get('/', getClinics);

// PATCH /api/clinics/:id
// Admin-only route for Sprint 3 clinic detail management.
router.patch(
  '/:id',
  authMiddleware,
  authMiddleware.requireAdmin,
  updateClinic
);

// GET /api/clinics/:id
// Returns one clinic by its ID.
router.get('/:id', getClinicById);

module.exports = router;
