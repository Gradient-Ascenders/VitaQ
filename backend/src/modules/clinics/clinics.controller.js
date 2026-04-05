// Import the service function that handles database querying
const { fetchClinics } = require('./clinics.service');

// List of query parameters this endpoint supports
const ALLOWED_FILTERS = [
  'search',
  'province',
  'district',
  'area',
  'facility_type',
  'services_offered'
];

// Helper function to validate query parameters
function validateFilters(query) {
  // Reject unexpected query parameters
  const invalidKeys = Object.keys(query).filter(
    (key) => !ALLOWED_FILTERS.includes(key)
  );

  if (invalidKeys.length > 0) {
    return `Invalid query parameter(s): ${invalidKeys.join(', ')}`;
  }

  // Reject repeated query parameters that become arrays
  for (const key of ALLOWED_FILTERS) {
    if (Array.isArray(query[key])) {
      return `Query parameter "${key}" must be a single value`;
    }
  }

  // Optional length check to prevent overly long values
  for (const key of ALLOWED_FILTERS) {
    if (typeof query[key] === 'string' && query[key].trim().length > 100) {
      return `Query parameter "${key}" is too long`;
    }
  }

  return null;
}

// Controller for GET /api/clinics
async function getClinics(req, res) {
  try {
    // Validate incoming query parameters before calling the service
    const validationError = validateFilters(req.query);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

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