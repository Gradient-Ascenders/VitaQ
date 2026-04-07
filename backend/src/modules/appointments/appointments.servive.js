const { supabase } = require('../../lib/supabaseClient');

/**
 * Creates a standard error object with an attached HTTP status code.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Checks whether a slot has already passed.
 */
function isSlotExpired(slot) {
  const now = new Date();
  const slotEndDateTime = new Date(`${slot.date}T${slot.end_time}`);
  return slotEndDateTime <= now;
}

/**
 * Creates an appointment booking for a patient.
 * It also updates the slot's booked_count after a successful booking.
 */
async function createAppointmentBooking({ patientId, clinicId, slotId }) {
  // Make sure the minimum required booking data was provided
  if (!patientId || !clinicId || !slotId) {
    throw createServiceError(
      'patient_id, clinic_id, and slot_id are required.',
      400
    );
  }

  // Fetch the selected slot from the database
  const { data: slot, error: slotError } = await supabase
    .from('appointment_slots')
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status')
    .eq('id', slotId)
    .single();

  // If the slot does not exist, stop the booking process
  if (slotError || !slot) {
    throw createServiceError('Selected slot does not exist.', 404);
  }

  // Confirm that the selected slot really belongs to the selected clinic
  if (String(slot.clinic_id) !== String(clinicId)) {
    throw createServiceError('Selected slot does not belong to this clinic.', 400);
  }

  // The slot must still be marked as available
  if (slot.status !== 'available') {
    throw createServiceError('Selected slot is not available for booking.', 409);
  }

  // The slot must not already be in the past
  if (isSlotExpired(slot)) {
    throw createServiceError('Selected slot has already expired.', 409);
  }

  // Calculate remaining capacity
  const capacity = Number(slot.capacity || 0);
  const bookedCount = Number(slot.booked_count || 0);

  // Block booking when the slot is already full
  if (bookedCount >= capacity) {
    throw createServiceError('Selected slot is already full.', 409);
  }

  // Check whether this patient has already booked the same slot
  const { data: existingBookings, error: existingBookingError } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('patient_id', patientId)
    .eq('slot_id', slotId)
    .limit(1);

  if (existingBookingError) {
    throw createServiceError('Failed to validate existing bookings.', 500);
  }

  if (existingBookings && existingBookings.length > 0) {
    throw createServiceError('You have already booked this slot.', 409);
  }

  /**
   * Update the slot count before inserting the appointment.
   *
   * The extra equality check on booked_count helps avoid simple race-condition
   * issues where two users try to take the same last space at the same time.
   */
  const { data: updatedSlots, error: slotUpdateError } = await supabase
    .from('appointment_slots')
    .update({
      booked_count: bookedCount + 1
    })
    .eq('id', slotId)
    .eq('booked_count', bookedCount)
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status');

  // If the update failed, return a useful booking error
  if (slotUpdateError) {
    throw createServiceError('Failed to update slot availability.', 500);
  }

  // If no row was updated, another user likely booked it first
  if (!updatedSlots || updatedSlots.length === 0) {
    throw createServiceError(
      'Slot is no longer available. Please refresh and try again.',
      409
    );
  }

  const updatedSlot = updatedSlots[0];

  // Insert the appointment booking record
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert([
      {
        patient_id: patientId,
        clinic_id: slot.clinic_id,
        slot_id: slotId,
        status: 'booked'
      }
    ])
    .select('id, patient_id, clinic_id, slot_id, status, created_at')
    .single();

  /**
   * If appointment creation fails after booked_count was incremented,
   * try to roll the slot count back so the data stays consistent.
   */
  if (appointmentError) {
    await supabase
      .from('appointment_slots')
      .update({
        booked_count: bookedCount
      })
      .eq('id', slotId)
      .eq('booked_count', bookedCount + 1);

    throw createServiceError('Failed to create appointment booking.', 500);
  }

  // Return both the new appointment and the updated slot summary
  return {
    appointment,
    slot: {
      ...updatedSlot,
      availability: updatedSlot.capacity - updatedSlot.booked_count
    }
  };
}

module.exports = {
  createAppointmentBooking
};