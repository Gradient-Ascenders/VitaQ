const { fetchClinics } = require('./clinics.service');
const supabase = require('../../lib/supabaseClient');

// List of query filters that the API allows
const ALLOWED_FILTERS = [
  'search',
  'province',
  'district',
  'area',
  'facility_type',
  'services_offered'
];

/**
 * Validates incoming query parameters for the clinic search endpoint.
 * Prevents unknown filters, repeated values, and very long inputs.
 */
function validateFilters(query) {
  // Find any query keys that are not allowed
  const invalidKeys = Object.keys(query).filter(
    (key) => !ALLOWED_FILTERS.includes(key)
  );

  if (invalidKeys.length > 0) {
    return `Invalid query parameter(s): ${invalidKeys.join(', ')}`;
  }

  // Ensure each query parameter is only a single value
  for (const key of ALLOWED_FILTERS) {
    if (Array.isArray(query[key])) {
      return `Query parameter "${key}" must be a single value`;
    }
  }

  // Prevent very long query strings
  for (const key of ALLOWED_FILTERS) {
    if (typeof query[key] === 'string' && query[key].trim().length > 100) {
      return `Query parameter "${key}" is too long`;
    }
  }

  return null;
}

/**
 * Returns a filtered list of clinics based on query parameters.
 */
async function getClinics(req, res) {
  try {
    // Validate the incoming search/filter parameters
    const validationError = validateFilters(req.query);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Build a filters object, defaulting missing values to empty strings
    const filters = {
      search: req.query.search || '',
      province: req.query.province || '',
      district: req.query.district || '',
      area: req.query.area || '',
      facility_type: req.query.facility_type || '',
      services_offered: req.query.services_offered || ''
    };

    // Ask the service layer for clinics matching these filters
    const clinics = await fetchClinics(filters);

    // Return the matching clinics
    return res.status(200).json({
      success: true,
      count: clinics.length,
      data: clinics
    });
  } catch (error) {
    // Log the error for debugging on the server
    console.error('Error fetching clinics:', error);

    // Return a generic server error response
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch clinics'
    });
  }
}

/**
 * Returns a single clinic by its ID.
 */
async function getClinicById(req, res) {
  try {
    // Read the clinic ID from the route parameter
    const clinicId = req.params.id;

    // Query the clinics table for the matching clinic
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();

    // Handle database errors
    if (error) {
      // PGRST116 usually means no row was found
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Clinic not found'
        });
      }

      // Return other Supabase errors as server/database errors
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Return the clinic details if found
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    // Catch unexpected errors
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getClinics,
  getClinicById
};