const express = require('express');
const router = express.Router();
const { fetchClinicSlots } = require('./slot.controller');

// GET /api/clinics/:clinicId/slots
// Returns all available appointment slots for a clinic
router.get('/:clinicId/slots', fetchClinicSlots);

module.exports = router;