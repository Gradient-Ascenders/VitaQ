const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { getWaitTimeAnalytics } = require('./analytics.controller');

const router = express.Router();

// GET /api/admin/analytics/wait-times
// Admin-only endpoint for wait-time analytics dashboard cards and grouped data.
router.get(
  '/wait-times',
  authMiddleware,
  authMiddleware.requireAdmin,
  getWaitTimeAnalytics
);

module.exports = router;