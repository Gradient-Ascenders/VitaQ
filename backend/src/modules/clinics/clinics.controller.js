// Import the service function that handles database querying
const { fetchClinics } = require('./clinics.service');

// Controller for GET /api/clinics
async function getClinics(req, res) {
  try {
    // Extract supported query parameters from the request
    // Default to empty strings so the service can handle them safely
    const filters = {
      search: req.query.search || '',
      province: req.query.province || '',
      district: req.query.district || '',
      area: req.query.area || '',
      facility_type: req.query.facility_type || '',
      services_offered: req.query.services_offered || ''
    };

    // Call the service to fetch filtered clinic data
    const clinics = await fetchClinics(filters);

    // Return a successful JSON response
    return res.status(200).json({
      success: true,
      count: clinics.length,
      data: clinics
    });
  } catch (error) {
    // Log the error for debugging in the backend terminal
    console.error('Error fetching clinics:', error);

    // Return a generic server error response
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch clinics'
    });
  }
}

// Export the controller function
module.exports = { getClinics };