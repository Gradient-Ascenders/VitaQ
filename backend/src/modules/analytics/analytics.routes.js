const express = require('express');
const authMiddleware = require('../../middleware/auth');
const {
  getWaitTimeAnalytics,
  getNoShowAnalytics
} = require('./analytics.controller');

const router = express.Router();

// GET /api/admin/analytics/wait-times
// Admin-only endpoint for wait-time analytics dashboard cards and grouped data.
router.get(
  '/wait-times',
  authMiddleware,
  authMiddleware.requireAdmin,
  getWaitTimeAnalytics
);

// GET /api/admin/analytics/no-shows
// Admin-only endpoint for no-show rate cards, clinic comparisons, and date trends.
router.get(
  '/no-shows',
  authMiddleware,
  authMiddleware.requireAdmin,
  getNoShowAnalytics
);

module.exports = router;