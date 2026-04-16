const express = require('express');
const { submitStaffRequest } = require('./staff.controller');
const authMiddleware = require('../../middleware/auth');

const router = express.Router();

// POST /api/staff/requests
// Creates a pending staff registration request for the logged-in user.
router.post('/requests', authMiddleware, submitStaffRequest);

module.exports = router;