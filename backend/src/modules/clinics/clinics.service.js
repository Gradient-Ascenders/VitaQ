// Import the shared Supabase client
const supabase = require('../../lib/supabaseClient');

function isFutureAvailableSlot(slot, now = new Date()) {
  const today = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().split(' ')[0];
  const remainingCapacity = (slot.capacity || 0) - (slot.booked_count || 0);

  if (remainingCapacity <= 0) {
    return false;
  }

  if (slot.date < today) {
    return false;
  }

  if (slot.date === today && slot.end_time <= currentTime) {
    return false;
  }

  return true;
}

function sortClinicsByAvailability(clinics) {
  return [...clinics].sort((leftClinic, rightClinic) => {
    const leftAvailableSlots = Math.max(Number(leftClinic?.available_slots_count) || 0, 0);
    const rightAvailableSlots = Math.max(Number(rightClinic?.available_slots_count) || 0, 0);

    if (leftAvailableSlots !== rightAvailableSlots) {
      return rightAvailableSlots - leftAvailableSlots;
    }

    return String(leftClinic?.name || '').localeCompare(String(rightClinic?.name || ''));
  });
}

async function fetchAvailableSlotCounts(clinicIds) {
  if (!Array.isArray(clinicIds) || clinicIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('appointment_slots')
    .select('clinic_id, date, end_time, capacity, booked_count')
    .in('clinic_id', clinicIds)
    .eq('status', 'available');

  if (error) {
    throw new Error(error.message);
  }

  const now = new Date();

  return (data || []).reduce((counts, slot) => {
    if (!isFutureAvailableSlot(slot, now)) {
      return counts;
    }

    counts[slot.clinic_id] = (counts[slot.clinic_id] || 0) + 1;
    return counts;
  }, {});
}

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

    const clinics = data || [];
    const availableSlotCounts = await fetchAvailableSlotCounts(
      clinics.map((clinic) => clinic.id).filter(Boolean)
    );

    // Normalize the returned clinic objects so the frontend gets a consistent shape
    const normalizedClinics = clinics.map((clinic) => ({
      id: clinic.id,
      name: clinic.name || '',
      province: clinic.province || '',
      district: clinic.district || '',
      area: clinic.area || '',
      facility_type: clinic.facility_type || '',
      address: clinic.address || '',
      services_offered: clinic.services_offered || '',
      latitude: clinic.latitude ?? null,
      longitude: clinic.longitude ?? null,
      available_slots_count: availableSlotCounts[clinic.id] || 0
    }));

    return sortClinicsByAvailability(normalizedClinics);
  } catch (error) {
    // Re-throw a cleaner error message for the controller to catch
    throw new Error(`Clinic search failed: ${error.message}`);
  }
}

// Export the service function
module.exports = { fetchClinics };
