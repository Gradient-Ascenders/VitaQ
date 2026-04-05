const express = require('express');
const router = express.Router();

const { getClinics } = require('./clinics.controller');

router.get('/', getClinics);

module.exports = router;