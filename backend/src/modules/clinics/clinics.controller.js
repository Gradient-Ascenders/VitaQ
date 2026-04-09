const { fetchClinics } = require('./clinics.service');
const supabase = require('../../lib/supabaseClient');

const ALLOWED_FILTERS = [
  'search',
  'province',
  'district',
  'area',
  'facility_type',
  'services_offered'
];

function validateFilters(query) {
  const invalidKeys = Object.keys(query).filter(
    (key) => !ALLOWED_FILTERS.includes(key)
  );

  if (invalidKeys.length > 0) {
    return `Invalid query parameter(s): ${invalidKeys.join(', ')}`;
  }

  for (const key of ALLOWED_FILTERS) {
    if (Array.isArray(query[key])) {
      return `Query parameter "${key}" must be a single value`;
    }
  }

  for (const key of ALLOWED_FILTERS) {
    if (typeof query[key] === 'string' && query[key].trim().length > 100) {
      return `Query parameter "${key}" is too long`;
    }
  }

  return null;
}

async function getClinics(req, res) {
  try {
    const validationError = validateFilters(req.query);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    const filters = {
      search: req.query.search || '',
      province: req.query.province || '',
      district: req.query.district || '',
      area: req.query.area || '',
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

async function getClinicById(req, res) {
  try {
    const clinicId = req.params.id;

    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();

    if (error) {
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

module.exports = {
  getClinics,
  getClinicById
};