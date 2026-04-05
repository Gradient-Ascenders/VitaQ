const supabase = require('../../lib/supabaseClient');

async function fetchClinics(filters = {}) {
  const { data, error } = await supabase
    .from('clinics')
    .select(`
      id,
      name,
      province,
      district,
      area,
      facility_type,
      address,
      services_offered,
      latitude,
      longitude
    `)
    .order('name', { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

module.exports = { fetchClinics };