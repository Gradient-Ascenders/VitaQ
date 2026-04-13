const express = require('express');
const router = express.Router();

const { getClinics, getClinicById } = require('./clinics.controller');

// GET /api/clinics
// Returns all clinics, optionally filtered by query parameters
router.get('/', getClinics);

// GET /api/clinics/:id
// Returns one clinic by its ID
router.get('/:id', getClinicById);

module.exports = router;