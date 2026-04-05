const { fetchClinics } = require('./clinics.service');

async function getClinics(req, res) {
  try {
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

module.exports = { getClinics };