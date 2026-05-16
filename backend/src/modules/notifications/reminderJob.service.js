const supabase = require('../../lib/supabaseClient');
const { sendAppointmentReminder } = require('./notifications.service');

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const SOUTH_AFRICA_UTC_OFFSET_HOURS = 2;

const APPOINTMENT_REMINDER_SELECT = `
  id,
  patient_id,
  clinic_id,
  slot_id,
  status,
  created_at,
  updated_at,
  clinic:clinics!appointments_clinic_id_fkey (
    id,
    name
  ),
  slot:appointment_slots!appointments_slot_id_fkey (
    id,
    date,
    start_time,
    end_time
  )
`;

/**
 * Creates a service error with a status code.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Normalises Supabase nested relationship output.
 * Supabase usually returns one object, but this keeps the code safe if an array appears.
 */
function firstRelatedRecord(record) {
  return Array.isArray(record) ? record[0] : record;
}

/**
 * Converts appointment_slots.date and appointment_slots.start_time into a UTC Date.
 *
 * South Africa/Johannesburg is UTC+2 and does not use daylight saving time.
 * Example: 10:00 Johannesburg local time becomes 08:00 UTC.
 */
function buildJohannesburgSlotDateTime(dateString, timeString) {
  if (!dateString || !timeString) {
    return null;
  }

  const [year, month, day] = String(dateString).split('-').map(Number);
  const [hour, minute, second = 0] = String(timeString).split(':').map(Number);

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - SOUTH_AFRICA_UTC_OFFSET_HOURS,
      minute,
      second
    )
  );
}

/**
 * Returns true if the appointment starts from now up to 30 minutes from now.
 */
function isAppointmentInsideReminderWindow(appointment, now = new Date()) {
  const slot = firstRelatedRecord(appointment.slot);
  const appointmentStartAt = buildJohannesburgSlotDateTime(
    slot?.date,
    slot?.start_time
  );

  if (!appointmentStartAt) {
    return false;
  }

  const timeUntilAppointmentMs = appointmentStartAt.getTime() - now.getTime();

  return timeUntilAppointmentMs >= 0 && timeUntilAppointmentMs <= THIRTY_MINUTES_MS;
}

/**
 * Loads booked appointments and filters them in JavaScript.
 * The current slot relationship ensures rescheduled appointments use their latest slot_id.
 */
async function fetchEligibleReminderAppointments(now = new Date()) {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_REMINDER_SELECT)
    .eq('status', 'booked');

  if (error) {
    throw createServiceError('Failed to fetch appointment reminders.', 500);
  }

  return (Array.isArray(data) ? data : [])
    .map((appointment) => {
      const slot = firstRelatedRecord(appointment.slot);
      const clinic = firstRelatedRecord(appointment.clinic);
      const appointmentStartAt = buildJohannesburgSlotDateTime(
        slot?.date,
        slot?.start_time
      );

      return {
        ...appointment,
        slot,
        clinic,
        appointment_start_at: appointmentStartAt
          ? appointmentStartAt.toISOString()
          : null
      };
    })
    .filter((appointment) => isAppointmentInsideReminderWindow(appointment, now));
}

/**
 * Runs the appointment reminder job once.
 *
 * It:
 * - finds booked appointments starting in less than 30 minutes
 * - skips cancelled/completed appointments because only booked rows are queried
 * - sends reminders through the notification service
 * - relies on email_notifications unique indexes to prevent duplicates
 */
async function processAppointmentReminderJob({ now = new Date() } = {}) {
  const eligibleAppointments = await fetchEligibleReminderAppointments(now);

  const summary = {
    eligible: eligibleAppointments.length,
    created: 0,
    sent: 0,
    failed: 0
  };

  for (const appointment of eligibleAppointments) {
    try {
      const result = await sendAppointmentReminder(appointment);

      if (result.skipped) {
        continue;
      }

      if (result.created !== false) {
        summary.created += 1;
      }

      if (result.sent) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
      }
    } catch (error) {
      summary.failed += 1;
    }
  }

  return summary;
}

module.exports = {
  buildJohannesburgSlotDateTime,
  isAppointmentInsideReminderWindow,
  fetchEligibleReminderAppointments,
  processAppointmentReminderJob
};
