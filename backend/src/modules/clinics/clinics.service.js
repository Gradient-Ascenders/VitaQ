// Import the shared Supabase client
const supabase = require('../../lib/supabaseClient');

// Service function responsible for building and running the clinic query
async function fetchClinics(filters = {}) {
  try {
    // Clean incoming filter values by trimming whitespace
    // Default to empty strings so filters are optional
    const search = filters.search?.trim() || '';
    const province = filters.province?.trim() || '';
    const district = filters.district?.trim() || '';
    const area = filters.area?.trim() || '';
    const facility_type = filters.facility_type?.trim() || '';
    const services_offered = filters.services_offered?.trim() || '';

    // Start building the query against the clinics table
    // Select only the fields needed for Sprint 1 clinic search and display
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
      // Order alphabetically by clinic name for cleaner frontend display
      .order('name', { ascending: true })
      // Limit results so the endpoint does not return too much data at once
      .limit(50);

    // Apply case-insensitive partial search on clinic name
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Apply case-insensitive province filter
    if (province) {
      query = query.ilike('province', province);
    }

    // Apply case-insensitive district filter
    if (district) {
      query = query.ilike('district', district);
    }

    // Apply case-insensitive area filter
    if (area) {
      query = query.ilike('area', area);
    }

    // Apply case-insensitive facility type filter
    if (facility_type) {
      query = query.ilike('facility_type', facility_type);
    }

    // Apply partial match filter for services offered
    // This helps match shorter search terms inside a longer services string
    if (services_offered) {
      query = query.ilike('services_offered', `%${services_offered}%`);
    }

    // Run the query
    const { data, error } = await query;

    // Throw an error if Supabase reports a problem
    if (error) {
      throw new Error(error.message);
    }

    // Normalize the returned clinic objects so the frontend gets a consistent shape
    return (data || []).map((clinic) => ({
      id: clinic.id,
      name: clinic.name || '',
      province: clinic.province || '',
      district: clinic.district || '',
      area: clinic.area || '',
      facility_type: clinic.facility_type || '',
      address: clinic.address || '',
      services_offered: clinic.services_offered || '',
      latitude: clinic.latitude ?? null,
      longitude: clinic.longitude ?? null
    }));
  } catch (error) {
    // Re-throw a cleaner error message for the controller to catch
    throw new Error(`Clinic search failed: ${error.message}`);
  }
}

// Export the service function
module.exports = { fetchClinics };