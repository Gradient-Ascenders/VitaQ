const {
  fetchWaitTimeAnalytics,
  fetchNoShowAnalytics
} = require('./analytics.service');

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

/**
 * Handles GET /api/admin/analytics/no-shows
 * Returns no-show summary cards, clinic comparisons, and date trends.
 */
async function getNoShowAnalytics(req, res) {
  try {
    const analytics = await fetchNoShowAnalytics(req.query);

    return res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch no-show analytics.'
    });
  }
}

module.exports = {
  getWaitTimeAnalytics,
  getNoShowAnalytics
};