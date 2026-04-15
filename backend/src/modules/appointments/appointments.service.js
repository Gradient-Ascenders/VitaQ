const supabase = require('../../lib/supabaseClient');
const { joinQueueFromAppointment } = require('../queue/queue.service');

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
 * It also updates the slot's booked_count and automatically creates a queue entry.
 */
async function createAppointmentBooking({ patientId, clinicId, slotId }) {
  if (!patientId || !clinicId || !slotId) {
    throw createServiceError(
      'patient_id, clinic_id, and slot_id are required.',
      400
    );
  }

  const { data: slot, error: slotError } = await supabase
    .from('appointment_slots')
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status')
    .eq('id', slotId)
    .single();

  if (slotError || !slot) {
    throw createServiceError('Selected slot does not exist.', 404);
  }

  if (String(slot.clinic_id) !== String(clinicId)) {
    throw createServiceError('Selected slot does not belong to this clinic.', 400);
  }

  if (slot.status !== 'available') {
    throw createServiceError('Selected slot is not available for booking.', 409);
  }

  if (isSlotExpired(slot)) {
    throw createServiceError('Selected slot has already expired.', 409);
  }

  const capacity = Number(slot.capacity || 0);
  const bookedCount = Number(slot.booked_count || 0);

  if (bookedCount >= capacity) {
    throw createServiceError('Selected slot is already full.', 409);
  }

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

  const { data: updatedSlots, error: slotUpdateError } = await supabase
    .from('appointment_slots')
    .update({
      booked_count: bookedCount + 1
    })
    .eq('id', slotId)
    .eq('booked_count', bookedCount)
    .select('id, clinic_id, date, start_time, end_time, capacity, booked_count, status');

  if (slotUpdateError) {
    throw createServiceError('Failed to update slot availability.', 500);
  }

  if (!updatedSlots || updatedSlots.length === 0) {
    throw createServiceError(
      'Slot is no longer available. Please refresh and try again.',
      409
    );
  }

  const updatedSlot = updatedSlots[0];

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

  let queueResult;

  try {
    // Automatically create the queue entry after the appointment is booked.
    // Team decision: booking an appointment also joins the patient queue.
    queueResult = await joinQueueFromAppointment({
      patientId,
      appointmentId: appointment.id
    });
  } catch (queueError) {
    console.error('Queue creation after booking failed:', queueError);

    // Remove the appointment if the queue entry could not be created.
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointment.id);

    // Roll back the slot count so availability stays correct.
    await supabase
      .from('appointment_slots')
      .update({
        booked_count: bookedCount
      })
      .eq('id', slotId)
      .eq('booked_count', bookedCount + 1);

    throw createServiceError(
      'Appointment could not be completed because the queue entry failed.',
      500
    );
  }

  return {
    appointment,
    slot: {
      ...updatedSlot,
      availability: updatedSlot.capacity - updatedSlot.booked_count
    },
    queue: queueResult.queue_entry,
    position: queueResult.position
  };
}

async function fetchAppointmentsByPatientId(patientId) {
  if (!patientId) {
    throw createServiceError('patient_id is required.', 400);
  }

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      clinic_id,
      status,
      created_at,
      clinic:clinics (
        name,
        address,
        province,
        district,
        area,
        facility_type
      ),
      slot:appointment_slots (
        date,
        start_time,
        end_time
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw createServiceError('Failed to fetch patient appointments.', 500);
  }

  return data || [];
}

module.exports = {
  createAppointmentBooking,
  fetchAppointmentsByPatientId
};