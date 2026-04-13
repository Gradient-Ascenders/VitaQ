const supabase = require('../../lib/supabaseClient');

/**
 * Fetches all bookable slots for a given clinic.
 * Only returns future slots that are still available and not full.
 */
async function getAvailableSlotsByClinicId(clinicId) {
  // Stop early if no clinic ID was provided
  if (!clinicId) {
    throw new Error('Clinic ID is required.');
  }

  // Get the current date and time so past slots can be removed
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().split(' ')[0];

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
  const filteredSlots = (data || []).filter((slot) => {
    // Calculate remaining spaces in the slot
    const remainingCapacity = (slot.capacity || 0) - (slot.booked_count || 0);

    // A slot is full if there are no spaces left
    const isFull = remainingCapacity <= 0;

    // Exclude slots where the date is already in the past
    const isPastDate = slot.date < today;

    // Exclude slots from today if the end time has already passed
    const isPastTimeToday = slot.date === today && slot.end_time <= currentTime;

    // Keep only slots that are future and still have space
    return !isFull && !isPastDate && !isPastTimeToday;
  });

  // Return the filtered slots with an extra availability field
  return filteredSlots.map((slot) => ({
    ...slot,
    availability: slot.capacity - slot.booked_count
  }));
}

module.exports = {
  getAvailableSlotsByClinicId
};