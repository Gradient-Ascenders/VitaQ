const { fetchClinics, updateClinicDetails } = require('./clinics.service');
const supabase = require('../../lib/supabaseClient');

// Query parameters that the clinic endpoint is allowed to accept.
// Keeping this list explicit prevents random or misspelled filters from reaching the service layer.
const ALLOWED_FILTERS = [
  'search',
  'province',
  'district',
  'area',
  'municipality',
  'region',
  'facility_type',
  'services_offered'
];

/**
 * Validates query parameters sent to GET /api/clinics.
 * This protects the endpoint from unsupported filters, repeated query values, and very long inputs.
 */
function validateFilters(query) {
  const invalidKeys = Object.keys(query).filter(
    (key) => !ALLOWED_FILTERS.includes(key)
  );

  if (invalidKeys.length > 0) {
    return `Invalid query parameter(s): ${invalidKeys.join(', ')}`;
  }

  // Express can turn repeated query params into arrays, for example ?province=A&province=B.
  // The service expects one value per filter, so arrays are rejected.
  for (const key of ALLOWED_FILTERS) {
    if (Array.isArray(query[key])) {
      return `Query parameter "${key}" must be a single value`;
    }
  }

  // Long query values are unnecessary for clinic filtering and can make queries messy.
  for (const key of ALLOWED_FILTERS) {
    if (typeof query[key] === 'string' && query[key].trim().length > 100) {
      return `Query parameter "${key}" is too long`;
    }
  }

  return null;
}

/**
 * Handles GET /api/clinics.
 * It validates query params, passes clean filters to the service, and returns a consistent API response.
 */
async function getClinics(req, res) {
  try {
    const validationError = validateFilters(req.query);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Missing filters default to empty strings so all filters remain optional.
    const filters = {
      search: req.query.search || '',
      province: req.query.province || '',
      district: req.query.district || '',
      area: req.query.area || '',
      municipality: req.query.municipality || '',
      region: req.query.region || '',
      facility_type: req.query.facility_type || '',
      services_offered: req.query.services_offered || ''
    };

    const clinics = await fetchClinics(filters);

    return res.status(200).json({
      success: true,
      count: clinics.length,
      data: clinics
    });
  } catch (error) {
    console.error('Error fetching clinics:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch clinics'
    });
  }
}

/**
 * Handles GET /api/clinics/:id.
 * This is used by the clinic details page when the frontend needs one specific clinic.
 */
async function getClinicById(req, res) {
  try {
    const clinicId = req.params.id;

    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();

    if (error) {
      // Supabase/PostgREST uses PGRST116 when .single() finds no matching row.
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Clinic not found'
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Handles PATCH /api/clinics/:id.
 * The route protects this controller with authMiddleware.requireAdmin, so only admins can update clinics.
 */
async function updateClinic(req, res) {
  try {
    const updatedClinic = await updateClinicDetails(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Clinic details updated successfully.',
      data: updatedClinic
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update clinic details.'
    });
  }
}

module.exports = {
  getClinics,
  getClinicById,
  updateClinic
};
