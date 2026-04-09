const express = require('express');
const router = express.Router();
const { fetchClinicSlots } = require('./slot.controller');

router.get('/:clinicId/slots', fetchClinicSlots);

module.exports = router;