const {
  buildCsvReport,
  buildPdfReport
} = require('./reports.service');

/**
 * Handles GET /api/admin/reports/export/csv
 * Builds a CSV report from the selected analytics export dataset.
 */
async function exportCsvReport(req, res) {
  try {
    const report = await buildCsvReport(req.query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`
    );

    return res.status(200).send(report.content);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to export CSV report.'
    });
  }
}

/**
 * Handles GET /api/admin/reports/export/pdf
 * Builds a simple downloadable PDF report from the selected export dataset.
 */
async function exportPdfReport(req, res) {
  try {
    const report = await buildPdfReport(req.query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`
    );

    return res.status(200).send(report.content);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to export PDF report.'
    });
  }
}

module.exports = {
  exportCsvReport,
  exportPdfReport
};