const {
  createStaffRequest,
  getLatestStaffRequestForUser
} = require('./staff.service');

/**
 * Handles POST /api/staff/requests.
 *
 * A logged-in user submits their staff registration details.
 * The service creates a pending staff_requests row, but does not
 * give the user staff access yet. Admin approval happens later.
 */
async function submitStaffRequest(req, res) {
  try {
    // authMiddleware attaches the logged-in Supabase user to req.user.
    const userId = req.user.id;

    // The frontend should send these fields using the database-style names.
    const {
      full_name: fullName,
      clinic_id: clinicId,
      staff_id: staffId
    } = req.body;

    const staffRequest = await createStaffRequest({
      userId,
      fullName,
      clinicId,
      staffId
    });

    return res.status(201).json({
      success: true,
      message: 'Staff registration request submitted and is pending admin approval.',
      data: staffRequest
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to submit staff registration request.'
    });
  }
}

/**
 * Handles GET /api/staff/request-status.
 *
 * A logged-in user can use this to check whether they have a pending,
 * approved, rejected, or missing staff registration request.
 */
async function getStaffRequestStatus(req, res) {
  try {
    const userId = req.user.id;
    const staffRequest = await getLatestStaffRequestForUser(userId);

    if (!staffRequest) {
      return res.status(200).json({
        success: true,
        data: {
          hasStaffRequest: false,
          status: 'none',
          request: null
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hasStaffRequest: true,
        status: staffRequest.status,
        request: staffRequest
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to load staff request status.'
    });
  }
}

module.exports = {
  submitStaffRequest,
  getStaffRequestStatus
};