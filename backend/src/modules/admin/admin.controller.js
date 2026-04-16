const {
  fetchPendingStaffRequests,
  reviewStaffRequest
} = require('./admin.service');

/**
 * Handles GET /api/admin/staff-requests/pending
 * Returns the list of pending staff registration requests for the admin dashboard.
 */
async function getPendingStaffRequests(req, res) {
  try {
    const requests = await fetchPendingStaffRequests();

    return res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch pending staff requests.'
    });
  }
}

/**
 * Handles PATCH /api/admin/staff-requests/:requestId/approve
 * Approves a pending staff request and updates the requester profile to staff.
 */
async function approveStaffRequest(req, res) {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;

    const result = await reviewStaffRequest({
      requestId,
      adminId,
      status: 'approved'
    });

    return res.status(200).json({
      success: true,
      message: 'Staff registration request approved successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to approve staff registration request.'
    });
  }
}

/**
 * Handles PATCH /api/admin/staff-requests/:requestId/reject
 * Rejects a pending staff request without giving the requester staff access.
 */
async function rejectStaffRequest(req, res) {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;

    const result = await reviewStaffRequest({
      requestId,
      adminId,
      status: 'rejected'
    });

    return res.status(200).json({
      success: true,
      message: 'Staff registration request rejected successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reject staff registration request.'
    });
  }
}

module.exports = {
  getPendingStaffRequests,
  approveStaffRequest,
  rejectStaffRequest
};