const supabase = require('../../lib/supabaseClient');

async function getAvailableSlotsByClinicId(clinicId) {
  if (!clinicId) {
    throw new Error('Clinic ID is required.');
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().split(' ')[0];

  const { data, error } = await supabase
    .from('appointment_slots')
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status')
    .eq('clinic_id', clinicId)
    .eq('status', 'available')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const filteredSlots = (data || []).filter((slot) => {
    const remainingCapacity = (slot.capacity || 0) - (slot.booked_count || 0);
    const isFull = remainingCapacity <= 0;
    const isPastDate = slot.date < today;
    const isPastTimeToday = slot.date === today && slot.end_time <= currentTime;

    return !isFull && !isPastDate && !isPastTimeToday;
  });

  return filteredSlots.map((slot) => ({
    ...slot,
    availability: slot.capacity - slot.booked_count
  }));
}

module.exports = {
  getAvailableSlotsByClinicId
};