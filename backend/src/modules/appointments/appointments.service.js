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
 * Logs enough booking context to debug queue failures without exposing it to patients.
 */
function logBookingQueueFailure({ queueError, patientId, clinicId, slotId, appointmentId }) {
  console.error('Queue creation after booking failed:', {
    message: queueError?.message,
    statusCode: queueError?.statusCode,
    stage: queueError?.stage,
    supabaseError: queueError?.supabaseError,
    patientId,
    clinicId,
    slotId,
    appointmentId
  });
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
    logBookingQueueFailure({
      queueError,
      patientId,
      clinicId: slot.clinic_id,
      slotId,
      appointmentId: appointment.id
    });

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
      slot_id,
      status,
      created_at,
      updated_at,
      cancelled_at,
      cancellation_reason,
      rescheduled_from_slot_id,
      rescheduled_at,
      notes,
      clinic:clinics!appointments_clinic_id_fkey (
        name,
        province,
        district,
        area,
        municipality,
        region,
        facility_type,
        contact_website
      ),
      slot:appointment_slots!appointments_slot_id_fkey (
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

const APPOINTMENT_CHANGE_SELECT = `
  id,
  patient_id,
  clinic_id,
  slot_id,
  status,
  created_at,
  updated_at,
  cancelled_at,
  cancellation_reason,
  rescheduled_from_slot_id,
  rescheduled_at,
  notes
`;

const SLOT_CHANGE_SELECT = 'id, clinic_id, date, start_time, end_time, capacity, booked_count, status';

const QUEUE_ENTRY_CHANGE_SELECT = `
  id,
  clinic_id,
  patient_id,
  appointment_id,
  queue_number,
  queue_date,
  source,
  status,
  estimated_wait_minutes,
  created_at,
  updated_at
`;

/**
 * Converts optional text input into either a clean string or null.
 * This prevents blank cancellation reasons from being saved as empty strings.
 */
function normalizeOptionalText(value) {
  const normalizedValue = String(value || '').trim();
  return normalizedValue || null;
}

/**
 * Adds an availability value to slot responses for easier frontend display.
 */
function buildSlotResponse(slot) {
  return {
    ...slot,
    availability: Number(slot.capacity || 0) - Number(slot.booked_count || 0)
  };
}

/**
 * Fetches one appointment before cancel/reschedule changes.
 * This is used to validate ownership, status, and current slot details.
 */
async function fetchAppointmentById(appointmentId) {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_CHANGE_SELECT)
    .eq('id', appointmentId)
    .single();

  if (error || !appointment) {
    throw createServiceError('Appointment not found.', 404);
  }

  return appointment;
}

/**
 * Fetches one appointment slot with the fields needed for capacity checks.
 */
async function fetchSlotById(slotId, notFoundMessage = 'Selected slot does not exist.') {
  const { data: slot, error } = await supabase
    .from('appointment_slots')
    .select(SLOT_CHANGE_SELECT)
    .eq('id', slotId)
    .single();

  if (error || !slot) {
    throw createServiceError(notFoundMessage, 404);
  }

  return slot;
}

/**
 * Ensures only the patient who owns the appointment can modify it.
 * Also blocks cancelled/completed appointments from being changed again.
 */
function validateAppointmentCanChange({ appointment, patientId, action }) {
  if (String(appointment.patient_id) !== String(patientId)) {
    throw createServiceError('You can only modify your own appointments.', 403);
  }

  if (appointment.status === 'cancelled') {
    throw createServiceError('Appointment is already cancelled.', 409);
  }

  if (appointment.status === 'completed') {
    throw createServiceError(`Completed appointments cannot be ${action}.`, 409);
  }

  if (appointment.status !== 'booked') {
    throw createServiceError(`Only booked appointments can be ${action}.`, 409);
  }
}

/**
 * Updates a slot's booked_count with an optimistic safety check.
 * The booked_count condition helps prevent overwriting a slot count that changed during the request.
 */
async function updateSlotBookedCount({
  slotId,
  currentBookedCount,
  nextBookedCount,
  errorMessage
}) {
  const { data: updatedSlots, error } = await supabase
    .from('appointment_slots')
    .update({
      booked_count: nextBookedCount
    })
    .eq('id', slotId)
    .eq('booked_count', currentBookedCount)
    .select(SLOT_CHANGE_SELECT);

  if (error) {
    throw createServiceError(errorMessage, 500);
  }

  if (!updatedSlots || updatedSlots.length === 0) {
    throw createServiceError(
      'Slot availability changed while processing the appointment. Please refresh and try again.',
      409
    );
  }

  return updatedSlots[0];
}

/**
 * Best-effort rollback used when a later step fails after slot capacity was changed.
 */
async function rollbackSlotBookedCount(slotId, bookedCount, expectedBookedCount = null) {
  let query = supabase
    .from('appointment_slots')
    .update({
      booked_count: bookedCount
    })
    .eq('id', slotId);

  // Only add the safety check when we know the intermediate count.
  if (expectedBookedCount !== null && expectedBookedCount !== undefined) {
    query = query.eq('booked_count', expectedBookedCount);
  }

  await query;
}

/**
 * Cancels any queue entry linked to the appointment.
 * This prevents a cancelled appointment from staying visible in the live queue.
 */
async function cancelQueueEntryForAppointment(appointmentId) {
  const { data, error } = await supabase
    .from('queue_entries')
    .update({
      status: 'cancelled',
      estimated_wait_minutes: 0,
      updated_at: new Date().toISOString()
    })
    .eq('appointment_id', appointmentId)
    .select(QUEUE_ENTRY_CHANGE_SELECT);

  if (error) {
    throw createServiceError('Failed to cancel linked queue entry.', 500);
  }

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/**
 * Gets the next queue number for a clinic/date.
 * This is used when a rescheduled appointment moves to a new slot date.
 */
async function generateNextQueueNumber(clinicId, queueDate) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select('queue_number')
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: false })
    .limit(1);

  if (error) {
    throw createServiceError('Failed to update linked queue entry.', 500);
  }

  return Number(data?.[0]?.queue_number || 0) + 1;
}

/**
 * Moves the appointment's existing queue entry to the new clinic/date after rescheduling.
 * This keeps the automatic queue entry created during booking aligned with the new slot.
 */
async function moveQueueEntryForRescheduledAppointment({ appointmentId, newSlot }) {
  const queueNumber = await generateNextQueueNumber(newSlot.clinic_id, newSlot.date);

  const { data, error } = await supabase
    .from('queue_entries')
    .update({
      clinic_id: newSlot.clinic_id,
      queue_date: newSlot.date,
      queue_number: queueNumber,
      status: 'waiting',
      estimated_wait_minutes: 0,
      updated_at: new Date().toISOString()
    })
    .eq('appointment_id', appointmentId)
    .select(QUEUE_ENTRY_CHANGE_SELECT);

  if (error) {
    throw createServiceError('Failed to update linked queue entry.', 500);
  }

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/**
 * Cancels a booked appointment owned by the logged-in patient.
 * It also decreases the old slot's booked_count and cancels the linked queue entry.
 */
async function cancelAppointment({ patientId, appointmentId, cancellationReason }) {
  if (!patientId || !appointmentId) {
    throw createServiceError('patient_id and appointment_id are required.', 400);
  }

  const appointment = await fetchAppointmentById(appointmentId);
  validateAppointmentCanChange({ appointment, patientId, action: 'cancelled' });

  const slot = await fetchSlotById(
    appointment.slot_id,
    'Appointment slot could not be found.'
  );

  const currentBookedCount = Number(slot.booked_count || 0);
  const nextBookedCount = Math.max(currentBookedCount - 1, 0);

  const updatedSlot = await updateSlotBookedCount({
    slotId: slot.id,
    currentBookedCount,
    nextBookedCount,
    errorMessage: 'Failed to update slot availability after cancellation.'
  });

  const cancelledAt = new Date().toISOString();

  const { data: cancelledAppointment, error: appointmentError } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancellation_reason: normalizeOptionalText(cancellationReason),
      updated_at: cancelledAt
    })
    .eq('id', appointmentId)
    .select(APPOINTMENT_CHANGE_SELECT)
    .single();

  if (appointmentError || !cancelledAppointment) {
    await rollbackSlotBookedCount(slot.id, currentBookedCount, nextBookedCount);
    throw createServiceError('Failed to cancel appointment.', 500);
  }

  const queueEntry = await cancelQueueEntryForAppointment(appointmentId);

  return {
    appointment: cancelledAppointment,
    slot: buildSlotResponse(updatedSlot),
    queue: queueEntry
  };
}

/**
 * Reschedules a booked appointment owned by the logged-in patient.
 * It releases the old slot, reserves the new slot, updates the appointment row,
 * and moves the linked queue entry to the new slot date.
 */
async function rescheduleAppointment({ patientId, appointmentId, newSlotId }) {
  if (!patientId || !appointmentId || !newSlotId) {
    throw createServiceError('patient_id, appointment_id, and new_slot_id are required.', 400);
  }

  const appointment = await fetchAppointmentById(appointmentId);
  validateAppointmentCanChange({ appointment, patientId, action: 'rescheduled' });

  if (String(appointment.slot_id) === String(newSlotId)) {
    throw createServiceError('New slot must be different from the current slot.', 400);
  }

  const oldSlot = await fetchSlotById(
    appointment.slot_id,
    'Current appointment slot could not be found.'
  );

  const newSlot = await fetchSlotById(newSlotId);

  if (newSlot.status !== 'available') {
    throw createServiceError('Selected new slot is not available for booking.', 409);
  }

  if (isSlotExpired(newSlot)) {
    throw createServiceError('Selected new slot has already expired.', 409);
  }

  const newSlotCapacity = Number(newSlot.capacity || 0);
  const newSlotBookedCount = Number(newSlot.booked_count || 0);

  if (newSlotBookedCount >= newSlotCapacity) {
    throw createServiceError('Selected new slot is already full.', 409);
  }

  const { data: existingBookings, error: existingBookingError } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('patient_id', patientId)
    .eq('slot_id', newSlotId)
    .limit(1);

  if (existingBookingError) {
    throw createServiceError('Failed to validate existing bookings.', 500);
  }

  if (
    existingBookings &&
    existingBookings.some((booking) => String(booking.id) !== String(appointmentId))
  ) {
    throw createServiceError('You already have an appointment for the selected new slot.', 409);
  }

  const oldSlotBookedCount = Number(oldSlot.booked_count || 0);
  const oldSlotNextBookedCount = Math.max(oldSlotBookedCount - 1, 0);

  const updatedOldSlot = await updateSlotBookedCount({
    slotId: oldSlot.id,
    currentBookedCount: oldSlotBookedCount,
    nextBookedCount: oldSlotNextBookedCount,
    errorMessage: 'Failed to release the previous appointment slot.'
  });

  let updatedNewSlot;

  try {
    updatedNewSlot = await updateSlotBookedCount({
      slotId: newSlot.id,
      currentBookedCount: newSlotBookedCount,
      nextBookedCount: newSlotBookedCount + 1,
      errorMessage: 'Failed to reserve the new appointment slot.'
    });
  } catch (error) {
    await rollbackSlotBookedCount(oldSlot.id, oldSlotBookedCount, oldSlotNextBookedCount);
    throw error;
  }

  const rescheduledAt = new Date().toISOString();

  const { data: rescheduledAppointment, error: appointmentError } = await supabase
    .from('appointments')
    .update({
      clinic_id: newSlot.clinic_id,
      slot_id: newSlot.id,
      status: 'booked',
      rescheduled_from_slot_id: oldSlot.id,
      rescheduled_at: rescheduledAt,
      updated_at: rescheduledAt
    })
    .eq('id', appointmentId)
    .select(APPOINTMENT_CHANGE_SELECT)
    .single();

  if (appointmentError || !rescheduledAppointment) {
    await rollbackSlotBookedCount(oldSlot.id, oldSlotBookedCount, oldSlotNextBookedCount);
    await rollbackSlotBookedCount(newSlot.id, newSlotBookedCount, newSlotBookedCount + 1);
    throw createServiceError('Failed to reschedule appointment.', 500);
  }

  const queueEntry = await moveQueueEntryForRescheduledAppointment({
    appointmentId,
    newSlot
  });

  return {
    appointment: rescheduledAppointment,
    old_slot: buildSlotResponse(updatedOldSlot),
    new_slot: buildSlotResponse(updatedNewSlot),
    queue: queueEntry
  };
}

module.exports = {
  createAppointmentBooking,
  fetchAppointmentsByPatientId,
  cancelAppointment,
  rescheduleAppointment,
  logBookingQueueFailure
};
