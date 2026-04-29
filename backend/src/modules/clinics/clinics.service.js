// Import the shared Supabase client used by all backend modules.
const supabase = require('../../lib/supabaseClient');

// Reuse the slot availability helper so clinic cards only count slots that can still be booked.
const { isBookableSlot } = require('../slots/slotAvailability');

// The imported SA dataset currently has 893 records.
// This limit is raised from 50 so the frontend can display the full imported clinic dataset.
const MAX_CLINIC_RESULTS = 1000;

// Keep the clinic select list in one place so search and update responses use the same Sprint 3 fields.
const CLINIC_SELECT_FIELDS = `
  id,
  name,
  province,
  district,
  area,
  municipality,
  region,
  facility_type,
  address,
  services_offered,
  latitude,
  longitude,
  contact_number,
  contact_email,
  contact_website,
  source_dataset,
  source_record_id,
  source_last_updated,
  is_active,
  created_at,
  updated_at
`;

// Admins may update these user-facing clinic detail fields only.
// Source/audit fields stay protected so the imported public dataset remains traceable.
const ALLOWED_CLINIC_UPDATE_FIELDS = new Set([
  'name',
  'province',
  'district',
  'area',
  'municipality',
  'region',
  'facility_type',
  'address',
  'services_offered',
  'latitude',
  'longitude',
  'contact_number',
  'contact_email',
  'contact_website',
  'is_active'
]);

// These fields are required by the current Sprint 3 clinic table constraints.
const REQUIRED_TEXT_FIELDS = new Set([
  'name',
  'province',
  'district',
  'facility_type'
]);

const OPTIONAL_TEXT_FIELDS = new Set([
  'area',
  'municipality',
  'region',
  'address',
  'services_offered',
  'contact_number',
  'contact_email',
  'contact_website'
]);

/**
 * Creates a standard service error with an HTTP status code.
 * Controllers use statusCode to return the correct API response.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Sorts clinics so clinics with available appointment slots appear first.
 * If two clinics have the same number of available slots, they are sorted alphabetically.
 */
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

/**
 * Cleans incoming filter values from the controller.
 * This keeps the query-building code safer and avoids repeated trim checks.
 */
function cleanFilter(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Builds a Supabase OR search filter.
 * This allows one search term to match clinic name, address, area, district, region, or municipality.
 */
function buildClinicSearchFilter(search) {
  // Commas have special meaning in Supabase .or() filters, so replace them with spaces.
  const safeSearch = search.replace(/,/g, ' ');

  return [
    `name.ilike.%${safeSearch}%`,
    `address.ilike.%${safeSearch}%`,
    `area.ilike.%${safeSearch}%`,
    `district.ilike.%${safeSearch}%`,
    `region.ilike.%${safeSearch}%`,
    `municipality.ilike.%${safeSearch}%`
  ].join(',');
}

/**
 * Fetches available appointment slot counts for the clinics being displayed.
 * Clinic IDs are split into smaller batches so the full SA dataset does not create
 * one oversized Supabase .in() query.
 */
async function fetchAvailableSlotCounts(clinicIds) {
  if (!Array.isArray(clinicIds) || clinicIds.length === 0) {
    return {};
  }

  const batchSize = 100;
  const now = new Date();
  const counts = {};

  for (let i = 0; i < clinicIds.length; i += batchSize) {
    const clinicIdBatch = clinicIds.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('appointment_slots')
      .select('clinic_id, date, end_time, capacity, booked_count')
      .in('clinic_id', clinicIdBatch)
      .eq('status', 'available');

    if (error) {
      throw new Error(error.message);
    }

    // Count only slots that are still bookable, not full, and not already in the past.
    for (const slot of data || []) {
      if (!isBookableSlot(slot, now)) {
        continue;
      }

      counts[slot.clinic_id] = (counts[slot.clinic_id] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Normalizes a clinic row from Supabase into the clean shape expected by the frontend.
 * Empty optional text fields become empty strings, while coordinates and timestamps stay null when missing.
 */
function normalizeClinic(clinic, availableSlotCounts = {}) {
  return {
    id: clinic.id,
    name: clinic.name || '',
    province: clinic.province || '',
    district: clinic.district || '',
    area: clinic.area || '',
    municipality: clinic.municipality || '',
    region: clinic.region || '',
    facility_type: clinic.facility_type || '',
    address: clinic.address || '',
    services_offered: clinic.services_offered || '',
    latitude: clinic.latitude ?? null,
    longitude: clinic.longitude ?? null,
    contact_number: clinic.contact_number || '',
    contact_email: clinic.contact_email || '',
    contact_website: clinic.contact_website || '',
    source_dataset: clinic.source_dataset || '',
    source_record_id: clinic.source_record_id || '',
    source_last_updated: clinic.source_last_updated || null,
    is_active: clinic.is_active ?? true,
    created_at: clinic.created_at || null,
    updated_at: clinic.updated_at || null,
    available_slots_count: availableSlotCounts[clinic.id] || 0
  };
}

/**
 * Cleans a text value before saving clinic updates.
 * Required text fields cannot be blank, while optional blank fields become null in the database.
 */
function cleanTextUpdateValue(fieldName, value) {
  const isRequired = REQUIRED_TEXT_FIELDS.has(fieldName);

  if (value === null) {
    if (isRequired) {
      throw createServiceError(`${fieldName} cannot be empty.`, 400);
    }

    return null;
  }

  if (typeof value !== 'string') {
    throw createServiceError(`${fieldName} must be a text value.`, 400);
  }

  const cleanedValue = value.trim();

  if (isRequired && cleanedValue.length === 0) {
    throw createServiceError(`${fieldName} cannot be empty.`, 400);
  }

  return cleanedValue.length === 0 ? null : cleanedValue;
}

/**
 * Validates latitude and longitude updates.
 * Coordinates can be cleared with null/empty string, but valid values must stay inside world bounds.
 */
function cleanCoordinateUpdateValue(fieldName, value) {
  if (value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw createServiceError(`${fieldName} must be a valid number.`, 400);
  }

  if (fieldName === 'latitude' && (numericValue < -90 || numericValue > 90)) {
    throw createServiceError('latitude must be between -90 and 90.', 400);
  }

  if (fieldName === 'longitude' && (numericValue < -180 || numericValue > 180)) {
    throw createServiceError('longitude must be between -180 and 180.', 400);
  }

  return numericValue;
}

/**
 * Validates boolean clinic update fields.
 * String values are accepted because frontend forms sometimes submit "true"/"false".
 */
function cleanBooleanUpdateValue(fieldName, value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const cleanedValue = value.trim().toLowerCase();

    if (cleanedValue === 'true') {
      return true;
    }

    if (cleanedValue === 'false') {
      return false;
    }
  }

  throw createServiceError(`${fieldName} must be true or false.`, 400);
}

/**
 * Validates and sanitizes the clinic update payload.
 * Only approved fields are allowed so admins cannot accidentally overwrite dataset/audit columns.
 */
function buildClinicUpdatePayload(clinicChanges) {
  if (!clinicChanges || typeof clinicChanges !== 'object' || Array.isArray(clinicChanges)) {
    throw createServiceError('Clinic update details are required.', 400);
  }

  const receivedFields = Object.keys(clinicChanges);

  if (receivedFields.length === 0) {
    throw createServiceError('At least one clinic detail must be provided.', 400);
  }

  const invalidFields = receivedFields.filter(
    (fieldName) => !ALLOWED_CLINIC_UPDATE_FIELDS.has(fieldName)
  );

  if (invalidFields.length > 0) {
    throw createServiceError(
      `Invalid clinic update field(s): ${invalidFields.join(', ')}`,
      400
    );
  }

  const cleanedPayload = {};

  for (const [fieldName, value] of Object.entries(clinicChanges)) {
    if (value === undefined) {
      continue;
    }

    if (REQUIRED_TEXT_FIELDS.has(fieldName) || OPTIONAL_TEXT_FIELDS.has(fieldName)) {
      cleanedPayload[fieldName] = cleanTextUpdateValue(fieldName, value);
      continue;
    }

    if (fieldName === 'latitude' || fieldName === 'longitude') {
      cleanedPayload[fieldName] = cleanCoordinateUpdateValue(fieldName, value);
      continue;
    }

    if (fieldName === 'is_active') {
      cleanedPayload[fieldName] = cleanBooleanUpdateValue(fieldName, value);
    }
  }

  if (Object.keys(cleanedPayload).length === 0) {
    throw createServiceError('At least one valid clinic detail must be provided.', 400);
  }

  return cleanedPayload;
}

/**
 * Main clinic search service.
 * It builds the Supabase query based on optional filters and returns normalized clinic objects.
 */
async function fetchClinics(filters = {}) {
  try {
    const search = cleanFilter(filters.search);
    const province = cleanFilter(filters.province);
    const district = cleanFilter(filters.district);
    const area = cleanFilter(filters.area);
    const municipality = cleanFilter(filters.municipality);
    const region = cleanFilter(filters.region);
    const facility_type = cleanFilter(filters.facility_type);
    const services_offered = cleanFilter(filters.services_offered);

    let query = supabase
      .from('clinics')
      .select(CLINIC_SELECT_FIELDS)
      // Only active clinics should appear in normal search results.
      .eq('is_active', true)
      // Keep results predictable before the availability-based sorting happens.
      .order('name', { ascending: true })
      // Increased from 50 so all imported SA clinic records can be returned.
      .limit(MAX_CLINIC_RESULTS);

    if (search) {
      query = query.or(buildClinicSearchFilter(search));
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

    if (municipality) {
      query = query.ilike('municipality', municipality);
    }

    if (region) {
      query = query.ilike('region', region);
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

    const clinics = data || [];

    const availableSlotCounts = await fetchAvailableSlotCounts(
      clinics.map((clinic) => clinic.id).filter(Boolean)
    );

    const normalizedClinics = clinics.map((clinic) =>
      normalizeClinic(clinic, availableSlotCounts)
    );

    return sortClinicsByAvailability(normalizedClinics);
  } catch (error) {
    throw new Error(`Clinic search failed: ${error.message}`);
  }
}

/**
 * Updates one clinic's admin-managed details.
 * Auth is enforced in the route layer; this service handles validation and database writing.
 */
async function updateClinicDetails(clinicId, clinicChanges = {}) {
  if (!clinicId) {
    throw createServiceError('Clinic ID is required.', 400);
  }

  const cleanedUpdates = buildClinicUpdatePayload(clinicChanges);
  const updateTime = new Date().toISOString();

  const { data, error } = await supabase
    .from('clinics')
    .update({
      ...cleanedUpdates,
      updated_at: updateTime
    })
    .eq('id', clinicId)
    .select(CLINIC_SELECT_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('Clinic not found.', 404);
    }

    throw createServiceError('Failed to update clinic details.', 500);
  }

  if (!data) {
    throw createServiceError('Clinic not found.', 404);
  }

  return normalizeClinic(data, {});
}

module.exports = {
  fetchClinics,
  updateClinicDetails
};
