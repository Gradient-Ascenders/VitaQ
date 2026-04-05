// Import Express router
const express = require('express');
const router = express.Router();

// Import the clinics controller
const { getClinics } = require('./clinics.controller');

// Route: GET /api/clinics
// Purpose: return clinics with optional search and filter parameters
router.get('/', getClinics);

// Export the router for use in app.js
module.exports = router;