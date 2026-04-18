const supabase = require('../../lib/supabaseClient');

const WAIT_MINUTES_PER_PATIENT = 15;

// Near-turn is a simple Sprint 2 in-app rule.
// A patient is considered near their turn when they are close in position
// or their estimated wait is short enough to warn them to be ready.
const NEAR_TURN_POSITION_THRESHOLD = 3;
const NEAR_TURN_WAIT_MINUTES_THRESHOLD = 15;
const ALLOWED_QUEUE_STATUSES = ['waiting', 'in_consultation', 'complete', 'cancelled'];

// This keeps status movement controlled.
// complete and cancelled are terminal states, so they cannot be reopened.
const ALLOWED_STATUS_TRANSITIONS = {
  waiting: ['in_consultation', 'cancelled'],
  in_consultation: ['complete', 'cancelled'],
  complete: [],
  cancelled: []
};

// Only these statuses should count in the live queue position.
const ACTIVE_QUEUE_STATUSES = ['waiting', 'in_consultation'];

/**
 * Creates a standard service error with an HTTP status code.
 * This lets the controller return the correct response code.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Formats today's local date as YYYY-MM-DD.
 * This avoids UTC rollover shifting the queue date unexpectedly.
 */
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Returns true when an entry is still part of the active queue.
 * Completed and cancelled entries should not affect live position.
 */
function isActiveQueueStatus(status) {
  return ACTIVE_QUEUE_STATUSES.includes(status);
}

/**
 * Sorts queue entries by queue number only.
 * This matches the Sprint 2 rule that queue position is derived from:
 * clinic_id + queue_date + queue_number + active-status filtering.
 */
function sortQueueEntriesByQueueNumber(entries) {
  return [...entries].sort((leftEntry, rightEntry) => {
    const leftQueueNumber = Number(leftEntry?.queue_number || 0);
    const rightQueueNumber = Number(rightEntry?.queue_number || 0);

    if (leftQueueNumber !== rightQueueNumber) {
      return leftQueueNumber - rightQueueNumber;
    }

    // Fallback for stable ordering if queue numbers ever match unexpectedly.
    return String(leftEntry?.created_at || '').localeCompare(
      String(rightEntry?.created_at || '')
    );
  });
}

/**
 * Returns active entries only, ordered by queue number.
 * These are the only rows that should count when calculating live position.
 */
function getActiveQueueEntries(entries) {
  return sortQueueEntriesByQueueNumber(entries).filter((entry) =>
    isActiveQueueStatus(entry.status)
  );
}

/**
 * Converts the appointment slot start time into a short HH:MM label.
 * Walk-ins show a friendly label instead of a slot time.
 */
function formatAppointmentTimeLabel(entry) {
  const startTime = entry?.appointment?.slot?.start_time;

  if (startTime) {
    return startTime.slice(0, 5);
  }

  if (entry?.source === 'walk_in' && entry?.time_label) {
    return entry.time_label;
  }

  if (entry?.source === 'walk_in') {
    return 'Walk-in';
  }

  return 'N/A';
}

/**
 * Builds a lightweight queue summary for the patient/staff view.
 * This helps the frontend show totals by queue status.
 */
function buildQueueSummary(entries) {
  return entries.reduce(
    (summary, entry) => {
      summary.total += 1;

      if (entry.status === 'waiting') {
        summary.waiting += 1;
      }

      if (entry.status === 'in_consultation') {
        summary.in_consultation += 1;
      }

      if (entry.status === 'complete') {
        summary.complete += 1;
      }

      return summary;
    },
    {
      total: 0,
      waiting: 0,
      in_consultation: 0,
      complete: 0
    }
  );
}

function normalizeWalkInPatientLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getWalkInPatientLabel(entry) {
  return entry?.patient_label || '';
}

/**
 * Chooses the patient queue entry that should drive the patient queue page.
 * Prefer the exact appointment when the page is opened from a booked visit.
 * Otherwise prefer an active same-day entry over older terminal entries.
 */
function selectPatientQueueEntry(entries, patientId, appointmentId) {
  const patientEntries = sortQueueEntriesByQueueNumber(entries).filter(
    (entry) => String(entry.patient_id) === String(patientId)
  );

  if (patientEntries.length === 0) {
    return null;
  }

  if (appointmentId) {
    const appointmentMatch = patientEntries.find(
      (entry) => String(entry.appointment_id) === String(appointmentId)
    );

    if (appointmentMatch) {
      return appointmentMatch;
    }
  }

  const activeEntries = patientEntries.filter((entry) => isActiveQueueStatus(entry.status));

  if (activeEntries.length > 0) {
    return activeEntries[0];
  }

  return patientEntries[patientEntries.length - 1];
}

/**
 * Calculates a patient's live position from active same-clinic, same-date entries.
 * The ordering rule is queue_number, not appointment time.
 *
 * Example:
 * queue_number 1 = complete   -> ignored
 * queue_number 2 = waiting    -> counts
 * queue_number 3 = waiting    -> patient position = 2
 */
function calculateLivePosition(entries, patientEntryId) {
  const activeEntries = getActiveQueueEntries(entries);
  const positionIndex = activeEntries.findIndex(
    (entry) => String(entry.id) === String(patientEntryId)
  );

  return positionIndex === -1 ? null : positionIndex + 1;
}

/**
 * Maps raw queue entries into a simpler frontend-friendly structure.
 * Positions are only shown for active queue entries.
 */
function mapQueueEntriesForPatient(entries, patientId) {
  const orderedEntries = sortQueueEntriesByQueueNumber(entries);
  const activeEntries = getActiveQueueEntries(orderedEntries);

  const activePositionsById = activeEntries.reduce((positions, entry, index) => {
    positions[entry.id] = index + 1;
    return positions;
  }, {});

  return orderedEntries.map((entry) => ({
    id: entry.id,
    position: activePositionsById[entry.id] || null,
    patient_label: entry.patient_label || null,
    queue_number: entry.queue_number,
    status: entry.status,
    appointment_time: formatAppointmentTimeLabel(entry),
    is_current_patient: String(entry.patient_id) === String(patientId)
  }));
}

/**
 * Derives the simple Sprint 2 near-turn notification state.
 * We do not store this in the database because the layout spec says
 * near-turn should be derived from live queue data.
 *
 * Rules:
 * - only waiting patients can be "near turn"
 * - near turn becomes true when:
 *   - live position is 3 or less, or
 *   - estimated wait is 15 minutes or less
 */
function buildNearTurnStatus({ status, position, estimatedWaitMinutes }) {
  // Once the patient is no longer waiting, the near-turn banner should not show.
  if (status !== 'waiting') {
    return {
      near_turn: false,
      near_turn_message: null
    };
  }

  const hasNearPosition =
    typeof position === 'number' && position > 0 && position <= NEAR_TURN_POSITION_THRESHOLD;

  const hasNearWait =
    typeof estimatedWaitMinutes === 'number' &&
    estimatedWaitMinutes >= 0 &&
    estimatedWaitMinutes <= NEAR_TURN_WAIT_MINUTES_THRESHOLD;

  const isNearTurn = hasNearPosition || hasNearWait;

  if (!isNearTurn) {
    return {
      near_turn: false,
      near_turn_message: null
    };
  }

  if (position === 1) {
    return {
      near_turn: true,
      near_turn_message: 'It is almost your turn. Please be ready now.'
    };
  }

  return {
    near_turn: true,
    near_turn_message: 'Your turn is coming up soon. Please stay nearby.'
  };
}

/**
 * Creates the next queue number for a clinic on a specific day.
 * Example: 1, 2, 3.
 */
async function generateQueueNumber(clinicId, queueDate) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select('queue_number')
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: false })
    .limit(1);

  if (error) {
    throw createServiceError('Failed to generate queue number.', 500);
  }

  const highestQueueNumber = Number(data?.[0]?.queue_number || 0);

  return highestQueueNumber + 1;
}

/**
 * Fetches all queue entries for a clinic and date.
 * The returned array is ordered by queue_number for live position calculation.
 */
async function fetchQueueEntriesForClinicDate(clinicId, queueDate) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at,
      appointment:appointments (
        id,
        slot:appointment_slots (
          start_time,
          end_time
        )
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch queue status.', 500);
  }

  return sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);
}

function buildQueueEntryResponse(entry, estimatedWaitMinutes) {
  return {
    id: entry.id,
    clinic_id: entry.clinic_id,
    patient_id: entry.patient_id,
    patient_label: entry.patient_label || null,
    visit_type: entry.visit_type || null,
    time_label: entry.time_label || null,
    created_by_staff_user_id: entry.created_by_staff_user_id || null,
    appointment_id: entry.appointment_id,
    queue_number: entry.queue_number,
    queue_date: entry.queue_date,
    source: entry.source,
    status: entry.status,
    estimated_wait_minutes: entry.status === 'waiting' ? estimatedWaitMinutes : 0,
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
}

/**
 * Fetches the approved staff request for a user.
 * We use this to find which clinic the staff member belongs to.
 */
async function fetchApprovedStaffRequest(staffUserId) {
  const { data: staffRequest, error } = await supabase
    .from('staff_requests')
    .select('id, user_id, clinic_id, status')
    .eq('user_id', staffUserId)
    .eq('status', 'approved')
    .single();

  if (error || !staffRequest) {
    throw createServiceError('Approved staff access is required.', 403);
  }

  return staffRequest;
}

/**
 * Checks for an existing active walk-in queue entry for the same patient name, clinic, and day.
 * This prevents staff from accidentally creating duplicate active walk-in entries.
 */
async function fetchExistingActiveQueueEntry({ clinicId, patientName, queueDate }) {
  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .eq('source', 'walk_in')
    .in('status', ACTIVE_QUEUE_STATUSES)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to check existing walk-in queue entry.', 500);
  }

  const normalizedPatientName = normalizeWalkInPatientLabel(patientName);

  return (
    (Array.isArray(data) ? data : []).find(
      (entry) => normalizeWalkInPatientLabel(getWalkInPatientLabel(entry)) === normalizedPatientName
    ) || null
  );
}

/**
 * Allows approved staff to add a walk-in patient to their assigned clinic queue.
 * No appointment booking is required for this flow.
 */
async function createWalkInQueueEntry({
  patientName,
  clinicId,
  queueDate,
  visitType,
  timeLabel,
  staffUserId
}) {
  const resolvedPatientName = String(patientName || '').trim();
  const resolvedVisitType = String(visitType || '').trim();
  const resolvedTimeLabel = String(timeLabel || '').trim();

  if (!resolvedPatientName || !staffUserId) {
    throw createServiceError('patient_name and staff user id are required.', 400);
  }

  const staffRequest = await fetchApprovedStaffRequest(staffUserId);
  const assignedClinicId = staffRequest.clinic_id;
  const resolvedQueueDate = queueDate || getTodayDateString();

  // Allow the frontend to send clinic_id if it already has it,
  // but never let staff create walk-ins for another clinic.
  if (clinicId && String(clinicId) !== String(assignedClinicId)) {
    throw createServiceError('You can only add walk-in patients for your assigned clinic.', 403);
  }

  // Walk-ins do not require an authenticated patient account, so we store
  // the entered name separately and generate a synthetic queue identifier.

  const existingEntry = await fetchExistingActiveQueueEntry({
    clinicId: assignedClinicId,
    patientName: resolvedPatientName,
    queueDate: resolvedQueueDate
  });

  if (existingEntry) {
    const queueEntries = await fetchQueueEntriesForClinicDate(assignedClinicId, resolvedQueueDate);
    const position = calculateLivePosition(queueEntries, existingEntry.id);
    const estimatedWaitMinutes = position === null
      ? 0
      : (position - 1) * WAIT_MINUTES_PER_PATIENT;

    return {
      queue_entry: buildQueueEntryResponse(existingEntry, estimatedWaitMinutes),
      position
    };
  }

  const queueNumber = await generateQueueNumber(assignedClinicId, resolvedQueueDate);
  const queueEntries = await fetchQueueEntriesForClinicDate(assignedClinicId, resolvedQueueDate);

  // Build a temporary entry so we can calculate the live position before insert.
  const provisionalEntry = {
    id: '__pending_walk_in_queue_entry__',
    clinic_id: assignedClinicId,
    patient_id: null,
    patient_label: resolvedPatientName,
    visit_type: resolvedVisitType || null,
    time_label: resolvedTimeLabel || null,
    created_by_staff_user_id: staffUserId,
    appointment_id: null,
    queue_number: queueNumber,
    queue_date: resolvedQueueDate,
    source: 'walk_in',
    status: 'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const position = calculateLivePosition(
    [...queueEntries, provisionalEntry],
    provisionalEntry.id
  );

  const estimatedWaitMinutes = position === null
    ? 0
    : (position - 1) * WAIT_MINUTES_PER_PATIENT;

  const { data: queueEntry, error: queueError } = await supabase
    .from('queue_entries')
    .insert([
      {
        clinic_id: assignedClinicId,
        patient_id: null,
        patient_label: resolvedPatientName,
        visit_type: resolvedVisitType || null,
        time_label: resolvedTimeLabel || null,
        created_by_staff_user_id: staffUserId,
        appointment_id: null,
        queue_number: queueNumber,
        queue_date: resolvedQueueDate,
        source: 'walk_in',
        status: 'waiting',
        estimated_wait_minutes: estimatedWaitMinutes
      }
    ])
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at
    `)
    .single();

  if (queueError || !queueEntry) {
    throw createServiceError('Failed to add walk-in patient to the queue.', 500);
  }

  return {
    queue_entry: buildQueueEntryResponse(queueEntry, estimatedWaitMinutes),
    position
  };
}

/**
 * Allows a logged-in patient to join the queue using a booked appointment.
 */
async function joinQueueFromAppointment({ patientId, appointmentId }) {
  if (!patientId || !appointmentId) {
    throw createServiceError('patient_id and appointment_id are required.', 400);
  }

  // Fetch the appointment and its slot so we can validate ownership and date.
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select(`
      id,
      patient_id,
      clinic_id,
      status,
      slot:appointment_slots (
        date,
        start_time,
        end_time
      ),
      clinic:clinics (
        name,
        address,
        province,
        district,
        area,
        facility_type
      )
    `)
    .eq('id', appointmentId)
    .single();

  if (appointmentError || !appointment) {
    throw createServiceError('Appointment not found.', 404);
  }

  // Patients must only join the queue for their own appointment.
  if (String(appointment.patient_id) !== String(patientId)) {
    throw createServiceError('You cannot join the queue for another patient.', 403);
  }

  // Only booked appointments should be allowed to join the queue.
  if (appointment.status !== 'booked') {
    throw createServiceError('Only booked appointments can join the queue.', 409);
  }

  // Stop duplicate queue entries for the same appointment.
  const { data: existingEntries, error: existingError } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at
    `)
    .eq('appointment_id', appointmentId)
    .limit(1);

  if (existingError) {
    throw createServiceError('Failed to check existing queue entry.', 500);
  }

  if (existingEntries && existingEntries.length > 0) {
    const existingEntry = existingEntries[0];

    if (String(existingEntry.patient_id) !== String(patientId)) {
      throw createServiceError('You cannot join the queue for another patient.', 403);
    }

    const queueEntries = await fetchQueueEntriesForClinicDate(
      appointment.clinic_id,
      existingEntry.queue_date
    );

    const position = existingEntry.status === 'waiting'
      ? calculateLivePosition(queueEntries, existingEntry.id)
      : null;

    const estimatedWaitMinutes = position === null
      ? 0
      : (position - 1) * WAIT_MINUTES_PER_PATIENT;

    return {
      queue_entry: buildQueueEntryResponse(existingEntry, estimatedWaitMinutes),
      position,
      appointment,
      clinic: appointment.clinic,
      slot: appointment.slot
    };
  }

  const queueDate = appointment.slot?.date || getTodayDateString();
  const queueNumber = await generateQueueNumber(appointment.clinic_id, queueDate);
  const queueEntries = await fetchQueueEntriesForClinicDate(appointment.clinic_id, queueDate);

  // Build a temporary version of the new entry so we can calculate its live position
  // before inserting it into the database.
  const provisionalEntry = {
    id: '__pending_queue_entry__',
    clinic_id: appointment.clinic_id,
    patient_id: patientId,
    appointment_id: appointmentId,
    queue_number: queueNumber,
    queue_date: queueDate,
    source: 'appointment',
    status: 'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    appointment: {
      slot: {
        start_time: appointment.slot?.start_time || null,
        end_time: appointment.slot?.end_time || null
      }
    }
  };

  const position = calculateLivePosition(
    [...queueEntries, provisionalEntry],
    provisionalEntry.id
  );

  // Simple estimate: each active patient ahead adds about 15 minutes.
  const estimatedWaitMinutes = (position - 1) * WAIT_MINUTES_PER_PATIENT;

  // Create the queue entry using the Sprint 2 queue structure.
  const { data: queueEntry, error: queueError } = await supabase
    .from('queue_entries')
    .insert([
      {
        clinic_id: appointment.clinic_id,
        patient_id: patientId,
        appointment_id: appointmentId,
        queue_number: queueNumber,
        queue_date: queueDate,
        source: 'appointment',
        status: 'waiting',
        estimated_wait_minutes: estimatedWaitMinutes
      }
    ])
    .select(`
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
    `)
    .single();

  if (queueError) {
    throw createServiceError('Failed to join the queue.', 500);
  }

  // Return enough information for the controller/frontend to show
  // the queue result together with appointment and clinic details.
  return {
    queue_entry: buildQueueEntryResponse(queueEntry, estimatedWaitMinutes),
    position,
    appointment,
    clinic: appointment.clinic,
    slot: appointment.slot
  };
}

/**
 * Returns the logged-in patient's queue status for a clinic visit date.
 */
async function fetchPatientQueueStatus({ patientId, clinicId, queueDate, appointmentId }) {
  if (!patientId || !clinicId || !queueDate) {
    throw createServiceError('patient_id, clinic_id, and date are required.', 400);
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at,
      appointment:appointments (
        id,
        slot:appointment_slots (
          start_time,
          end_time
        )
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch queue status.', 500);
  }

  const queueEntries = sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);
  const patientEntry = selectPatientQueueEntry(queueEntries, patientId, appointmentId);
  const queueSummary = buildQueueSummary(queueEntries);
  const mappedQueueEntries = mapQueueEntriesForPatient(queueEntries, patientId);

  // If the patient is not in the queue, return a clean empty state.
  if (!patientEntry) {
    return {
      is_in_queue: false,
      position: null,
      near_turn: false,
      near_turn_message: null,
      queue_entry: null,
      queue_summary: queueSummary,
      queue_entries: mappedQueueEntries
    };
  }

  const position = patientEntry.status === 'waiting'
    ? calculateLivePosition(queueEntries, patientEntry.id)
    : null;

  const estimatedWaitMinutes = position === null
    ? 0
    : (position - 1) * WAIT_MINUTES_PER_PATIENT;

  // Derive the near-turn banner state from the live queue data.
  const nearTurnStatus = buildNearTurnStatus({
    status: patientEntry.status,
    position,
    estimatedWaitMinutes
  });

  return {
    is_in_queue: true,
    position,
    near_turn: nearTurnStatus.near_turn,
    near_turn_message: nearTurnStatus.near_turn_message,
    queue_entry: {
      ...buildQueueEntryResponse(patientEntry, estimatedWaitMinutes),
      appointment_time: patientEntry.appointment?.slot?.start_time || null,
      appointment_end_time: patientEntry.appointment?.slot?.end_time || null
    },
    queue_summary: queueSummary,
    queue_entries: mappedQueueEntries
  };
}

/**
 * Maps queue entries for the staff queue page.
 * Entries remain ordered by queue_number, and waiting entries get a live position.
 */
function mapQueueEntriesForStaff(entries) {
  return entries.map((entry) => {
    const livePosition = entry.status === 'waiting'
      ? calculateLivePosition(entries, entry.id)
      : null;

    return {
      id: entry.id,
      clinic_id: entry.clinic_id,
      patient_id: entry.patient_id,
      patient_label: entry.patient_label || null,
      visit_type: entry.visit_type || null,
      time_label: entry.time_label || null,
      created_by_staff_user_id: entry.created_by_staff_user_id || null,
      appointment_id: entry.appointment_id,
      queue_number: entry.queue_number,
      queue_date: entry.queue_date,
      source: entry.source,
      status: entry.status,
      estimated_wait_minutes:
        entry.status === 'waiting' && livePosition !== null
          ? (livePosition - 1) * WAIT_MINUTES_PER_PATIENT
          : 0,
      live_position: livePosition,
      appointment_time: entry.source === 'walk_in'
        ? entry.time_label || null
        : entry.appointment?.slot?.start_time || null,
      appointment_end_time: entry.appointment?.slot?.end_time || null,
      created_at: entry.created_at,
      updated_at: entry.updated_at
    };
  });
}

/**
 * Returns the clinic queue for staff users.
 * This is used by the staff queue management page.
 */
async function fetchStaffQueue({ staffUserId, queueDate }) {
  if (!staffUserId || !queueDate) {
    throw createServiceError('staff user id and date are required.', 400);
  }

  const staffRequest = await fetchApprovedStaffRequest(staffUserId);
  const clinicId = staffRequest.clinic_id;

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('id', clinicId)
    .single();

  if (clinicError || !clinic) {
    throw createServiceError('Failed to fetch assigned clinic.', 500);
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .select(`
      id,
      clinic_id,
      patient_id,
      patient_label,
      visit_type,
      time_label,
      created_by_staff_user_id,
      appointment_id,
      queue_number,
      queue_date,
      source,
      status,
      estimated_wait_minutes,
      created_at,
      updated_at,
      appointment:appointments (
        id,
        slot:appointment_slots (
          start_time,
          end_time
        )
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('queue_date', queueDate)
    .order('queue_number', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch staff queue.', 500);
  }

  const queueEntries = sortQueueEntriesByQueueNumber(Array.isArray(data) ? data : []);

  return {
    clinic,
    clinic_id: clinicId,
    queue_date: queueDate,
    queue_summary: buildQueueSummary(queueEntries),
    queue_entries: mapQueueEntriesForStaff(queueEntries)
  };
}

/**
 * Checks whether a status value is part of the queue workflow.
 */
function isAllowedQueueStatus(status) {
  return ALLOWED_QUEUE_STATUSES.includes(status);
}

/**
 * Checks whether staff may move a queue entry from its current status to the new status.
 * This prevents completed/cancelled queue entries from being reopened.
 */
function isAllowedStatusTransition(currentStatus, nextStatus) {
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedNextStatuses.includes(nextStatus);
}

/**
 * Fetches one queue entry before updating it.
 * We need the existing clinic_id and status before deciding whether the update is allowed.
 */
async function fetchQueueEntryById(entryId) {
  const { data: queueEntry, error } = await supabase
    .from('queue_entries')
    .select(`
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
    `)
    .eq('id', entryId)
    .single();

  if (error || !queueEntry) {
    throw createServiceError('Queue entry not found.', 404);
  }

  return queueEntry;
}

/**
 * Updates a queue entry status.
 * Staff can use this to move patients through the queue.
 */
async function updateQueueEntryStatus({ entryId, status, staffUserId }) {
  if (!entryId || !status || !staffUserId) {
    throw createServiceError('queue entry id, status, and staff user id are required.', 400);
  }

  // Make sure the requested status is one of the statuses supported by the system.
  if (!isAllowedQueueStatus(status)) {
    throw createServiceError('Invalid queue status.', 400);
  }

  // Fetch the queue entry first so we can check its clinic and current status.
  const existingEntry = await fetchQueueEntryById(entryId);

  // Fetch the approved staff request so we know which clinic this staff member belongs to.
  const staffRequest = await fetchApprovedStaffRequest(staffUserId);

  // Staff should only update queue entries for their own clinic.
  if (String(staffRequest.clinic_id) !== String(existingEntry.clinic_id)) {
    throw createServiceError('You can only update queue entries for your assigned clinic.', 403);
  }

  // No need to update if the status is already the same.
  if (existingEntry.status === status) {
    return existingEntry;
  }

  // Prevent invalid workflow jumps such as complete -> waiting.
  if (!isAllowedStatusTransition(existingEntry.status, status)) {
    throw createServiceError(
      `Cannot change queue status from ${existingEntry.status} to ${status}.`,
      409
    );
  }

  const { data, error } = await supabase
    .from('queue_entries')
    .update({
      status
    })
    .eq('id', entryId)
    .select(`
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
    `)
    .single();

  if (error || !data) {
    throw createServiceError('Failed to update queue status.', 500);
  }

  return data;
}

module.exports = {
  joinQueueFromAppointment,
  createWalkInQueueEntry,
  fetchPatientQueueStatus,
  fetchStaffQueue,
  updateQueueEntryStatus
};
