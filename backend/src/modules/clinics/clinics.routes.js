const express = require('express');
const router = express.Router();

const { getClinics, getClinicById } = require('./clinics.controller');

router.get('/', getClinics);
router.get('/:id', getClinicById);

module.exports = router;