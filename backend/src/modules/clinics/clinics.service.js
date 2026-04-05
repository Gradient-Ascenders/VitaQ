const supabase = require('../../lib/supabaseClient');

async function fetchClinics(filters = {}) {
  try {
    const search = filters.search?.trim() || '';

    let query = supabase
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

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  } catch (error) {
    throw new Error(`Clinic search failed: ${error.message}`);
  }
}

module.exports = { fetchClinics };