const express = require('express');
const authMiddleware = require('../../middleware/auth');
const {
  exportCsvReport,
  exportPdfReport
} = require('./reports.controller');

const router = express.Router();

// GET /api/admin/reports/export/csv
// Admin-only endpoint for downloading CSV analytics reports.
router.get(
  '/export/csv',
  authMiddleware,
  authMiddleware.requireAdmin,
  exportCsvReport
);

// GET /api/admin/reports/export/pdf
// Admin-only endpoint for downloading simple PDF analytics reports.
router.get(
  '/export/pdf',
  authMiddleware,
  authMiddleware.requireAdmin,
  exportPdfReport
);

module.exports = router;