const supabase = require('../../lib/supabaseClient');

async function fetchClinics(filters = {}) {
  try {
    const search = filters.search?.trim() || '';
    const province = filters.province?.trim() || '';
    const district = filters.district?.trim() || '';
    const area = filters.area?.trim() || '';
    const facility_type = filters.facility_type?.trim() || '';
    const services_offered = filters.services_offered?.trim() || '';

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

    if (province) {
      query = query.ilike('province', province);
    }

    if (district) {
      query = query.ilike('district', district);
    }

    if (area) {
      query = query.ilike('area', area);
    }

    if (facility_type) {
      query = query.ilike('facility_type', facility_type);
    }

    if (services_offered) {
      query = query.ilike('services_offered', `%${services_offered}%`);
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