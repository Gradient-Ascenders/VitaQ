const supabase = require('../../lib/supabaseClient');
const { isBookableSlot } = require('./slotAvailability');

/**
 * Fetches all bookable slots for a given clinic.
 * Only returns future slots that are still available and not full.
 */
async function getAvailableSlotsByClinicId(clinicId, now = new Date()) {
  // Stop early if no clinic ID was provided
  if (!clinicId) {
    throw new Error('Clinic ID is required.');
  }

  // Query Supabase for slots linked to this clinic
  const { data, error } = await supabase
    .from('appointment_slots')
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status')
    .eq('clinic_id', clinicId)
    .eq('status', 'available')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  // Throw an error if the database query failed
  if (error) {
    throw new Error(error.message);
  }

  // Filter out slots that are full or already expired
  const filteredSlots = (data || []).filter((slot) => isBookableSlot(slot, now));

  // Return the filtered slots with an extra availability field
  return filteredSlots.map((slot) => ({
    ...slot,
    availability: slot.capacity - slot.booked_count
  }));
}

module.exports = {
  getAvailableSlotsByClinicId
};
