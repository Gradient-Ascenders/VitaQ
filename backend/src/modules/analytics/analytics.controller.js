const { fetchWaitTimeAnalytics } = require('./analytics.service');

/**
 * Handles GET /api/admin/analytics/wait-times
 * Returns wait-time summary cards and grouped dashboard data for admins.
 */
async function getWaitTimeAnalytics(req, res) {
  try {
    const analytics = await fetchWaitTimeAnalytics(req.query);

    return res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch wait-time analytics.'
    });
  }
}

module.exports = {
  getWaitTimeAnalytics
};