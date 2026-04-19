/**
 * Service logic for recurring slot templates.
 * This module validates weekly template definitions and turns them into
 * dated appointment slots for the assigned clinic staff member.
 */
const supabase = require('../../lib/supabaseClient');
const {
  addDaysToDateString,
  getDayOfWeekFromDateString,
  getSouthAfricaDateTimeParts
} = require('../slots/slotAvailability');

const TEMPLATE_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

const ALLOWED_TEMPLATE_STATUSES = Object.values(TEMPLATE_STATUSES);

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Normalise optional text inputs before validation so blank strings are treated consistently.
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// The frontend may send HH:MM or HH:MM:SS, but the database should always receive HH:MM:SS.
function normalizeTimeString(value) {
  const cleanedValue = cleanText(value);

  if (!cleanedValue) {
    return null;
  }

  if (/^\d{2}:\d{2}$/.test(cleanedValue)) {
    return `${cleanedValue}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(cleanedValue)) {
    return cleanedValue;
  }

  return null;
}

// Slot template capacity is used to seed future appointment_slots rows.
function normalizeCapacity(value) {
  const capacity = Number(value);

  if (!Number.isInteger(capacity) || capacity < 1) {
    return null;
  }

  return capacity;
}

// Templates are stored against weekday numbers because generation works from dates, not names.
function normalizeDayOfWeek(value) {
  const dayOfWeek = Number(value);

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return null;
  }

  return dayOfWeek;
}

// Keep template status values aligned with the current text-based database convention.
function normalizeTemplateStatus(value) {
  const normalizedStatus = cleanText(value) || TEMPLATE_STATUSES.ACTIVE;

  if (!ALLOWED_TEMPLATE_STATUSES.includes(normalizedStatus)) {
    return null;
  }

  return normalizedStatus;
}

// Templates cannot overlap within the same clinic/day because generation would create ambiguous slots.
function isTimeRangeValid(startTime, endTime) {
  return typeof startTime === 'string' && typeof endTime === 'string' && startTime < endTime;
}

function isOverlappingTimeRange(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

// Staff scheduling is limited to approved staff requests so the clinic assignment is trusted.
async function fetchApprovedStaffAssignment(staffUserId) {
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

// Reuse this when updates need to confirm ownership before mutating a template.
async function fetchSlotTemplateById(templateId) {
  const { data: template, error } = await supabase
    .from('slot_templates')
    .select(`
      id,
      clinic_id,
      day_of_week,
      start_time,
      end_time,
      capacity,
      status,
      created_at,
      updated_at
    `)
    .eq('id', templateId)
    .single();

  if (error || !template) {
    throw createServiceError('Slot template not found.', 404);
  }

  return template;
}

// Overlap checks are done before insert/update so one clinic cannot create clashing weekly templates.
async function ensureNoTemplateOverlap({
  clinicId,
  dayOfWeek,
  startTime,
  endTime,
  excludeTemplateId = null
}) {
  const { data: existingTemplates, error } = await supabase
    .from('slot_templates')
    .select('id, start_time, end_time')
    .eq('clinic_id', clinicId)
    .eq('day_of_week', dayOfWeek);

  if (error) {
    throw createServiceError('Failed to validate slot template overlap.', 500);
  }

  const overlappingTemplate = (existingTemplates || []).find((template) => {
    if (excludeTemplateId && String(template.id) === String(excludeTemplateId)) {
      return false;
    }

    return isOverlappingTimeRange(startTime, endTime, template.start_time, template.end_time);
  });

  if (overlappingTemplate) {
    throw createServiceError(
      'This slot template overlaps with an existing template for the same day.',
      409
    );
  }
}

// Validate and reshape request payloads into the exact database column names expected downstream.
function normalizeTemplateInput({
  dayOfWeek,
  startTime,
  endTime,
  capacity,
  status
}) {
  const normalizedDayOfWeek = normalizeDayOfWeek(dayOfWeek);
  const normalizedStartTime = normalizeTimeString(startTime);
  const normalizedEndTime = normalizeTimeString(endTime);
  const normalizedCapacity = normalizeCapacity(capacity);
  const normalizedStatus = normalizeTemplateStatus(status);

  if (
    normalizedDayOfWeek === null
    || !normalizedStartTime
    || !normalizedEndTime
    || normalizedCapacity === null
    || !normalizedStatus
  ) {
    throw createServiceError(
      'day_of_week, start_time, end_time, capacity, and status must be valid values.',
      400
    );
  }

  if (!isTimeRangeValid(normalizedStartTime, normalizedEndTime)) {
    throw createServiceError('start_time must be earlier than end_time.', 400);
  }

  return {
    day_of_week: normalizedDayOfWeek,
    start_time: normalizedStartTime,
    end_time: normalizedEndTime,
    capacity: normalizedCapacity,
    status: normalizedStatus
  };
}

// Staff only see templates for their assigned clinic, ordered like a weekly timetable.
async function listSlotTemplatesForStaff({ staffUserId }) {
  if (!staffUserId) {
    throw createServiceError('staff user id is required.', 400);
  }

  const staffAssignment = await fetchApprovedStaffAssignment(staffUserId);

  const { data: templates, error } = await supabase
    .from('slot_templates')
    .select(`
      id,
      clinic_id,
      day_of_week,
      start_time,
      end_time,
      capacity,
      status,
      created_at,
      updated_at
    `)
    .eq('clinic_id', staffAssignment.clinic_id)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch slot templates.', 500);
  }

  return templates || [];
}

async function createSlotTemplateForStaff({
  staffUserId,
  dayOfWeek,
  startTime,
  endTime,
  capacity,
  status
}) {
  if (!staffUserId) {
    throw createServiceError('staff user id is required.', 400);
  }

  const staffAssignment = await fetchApprovedStaffAssignment(staffUserId);
  const normalizedInput = normalizeTemplateInput({
    dayOfWeek,
    startTime,
    endTime,
    capacity,
    status
  });

  await ensureNoTemplateOverlap({
    clinicId: staffAssignment.clinic_id,
    dayOfWeek: normalizedInput.day_of_week,
    startTime: normalizedInput.start_time,
    endTime: normalizedInput.end_time
  });

  const { data: template, error } = await supabase
    .from('slot_templates')
    .insert([
      {
        clinic_id: staffAssignment.clinic_id,
        ...normalizedInput
      }
    ])
    .select(`
      id,
      clinic_id,
      day_of_week,
      start_time,
      end_time,
      capacity,
      status,
      created_at,
      updated_at
    `)
    .single();

  if (error || !template) {
    throw createServiceError('Failed to create slot template.', 500);
  }

  return template;
}

async function updateSlotTemplateForStaff({
  staffUserId,
  templateId,
  dayOfWeek,
  startTime,
  endTime,
  capacity,
  status
}) {
  if (!staffUserId || !templateId) {
    throw createServiceError('staff user id and template id are required.', 400);
  }

  const hasUpdates = [
    dayOfWeek,
    startTime,
    endTime,
    capacity,
    status
  ].some((value) => value !== undefined);

  if (!hasUpdates) {
    throw createServiceError('At least one slot template field must be provided.', 400);
  }

  const staffAssignment = await fetchApprovedStaffAssignment(staffUserId);
  const existingTemplate = await fetchSlotTemplateById(templateId);

  if (String(existingTemplate.clinic_id) !== String(staffAssignment.clinic_id)) {
    throw createServiceError(
      'You can only manage slot templates for your assigned clinic.',
      403
    );
  }

  const normalizedInput = normalizeTemplateInput({
    dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : existingTemplate.day_of_week,
    startTime: startTime !== undefined ? startTime : existingTemplate.start_time,
    endTime: endTime !== undefined ? endTime : existingTemplate.end_time,
    capacity: capacity !== undefined ? capacity : existingTemplate.capacity,
    status: status !== undefined ? status : existingTemplate.status
  });

  await ensureNoTemplateOverlap({
    clinicId: staffAssignment.clinic_id,
    dayOfWeek: normalizedInput.day_of_week,
    startTime: normalizedInput.start_time,
    endTime: normalizedInput.end_time,
    excludeTemplateId: existingTemplate.id
  });

  const { data: updatedTemplate, error } = await supabase
    .from('slot_templates')
    .update(normalizedInput)
    .eq('id', templateId)
    .select(`
      id,
      clinic_id,
      day_of_week,
      start_time,
      end_time,
      capacity,
      status,
      created_at,
      updated_at
    `)
    .single();

  if (error || !updatedTemplate) {
    throw createServiceError('Failed to update slot template.', 500);
  }

  return updatedTemplate;
}

async function generateUpcomingSlotsForStaff({
  staffUserId,
  daysAhead = 14,
  now = new Date()
}) {
  if (!staffUserId) {
    throw createServiceError('staff user id is required.', 400);
  }

  const normalizedDaysAhead = Number(daysAhead);

  if (!Number.isInteger(normalizedDaysAhead) || normalizedDaysAhead < 1 || normalizedDaysAhead > 31) {
    throw createServiceError('days_ahead must be an integer between 1 and 31.', 400);
  }

  const staffAssignment = await fetchApprovedStaffAssignment(staffUserId);
  const { today } = getSouthAfricaDateTimeParts(now);
  const throughDate = addDaysToDateString(today, normalizedDaysAhead - 1);

  const { data: activeTemplates, error: templatesError } = await supabase
    .from('slot_templates')
    .select('id, clinic_id, day_of_week, start_time, end_time, capacity, status')
    .eq('clinic_id', staffAssignment.clinic_id)
    .eq('status', TEMPLATE_STATUSES.ACTIVE)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (templatesError) {
    throw createServiceError('Failed to fetch active slot templates.', 500);
  }

  const templates = activeTemplates || [];

  if (templates.length === 0) {
    return {
      clinic_id: staffAssignment.clinic_id,
      from_date: today,
      through_date: throughDate,
      template_count: 0,
      created: 0,
      skipped_existing: 0
    };
  }

  const { data: existingSlots, error: existingSlotsError } = await supabase
    .from('appointment_slots')
    .select('clinic_id, date, start_time, end_time')
    .eq('clinic_id', staffAssignment.clinic_id)
    .gte('date', today)
    .lte('date', throughDate);

  if (existingSlotsError) {
    throw createServiceError('Failed to fetch existing appointment slots.', 500);
  }

  const existingSlotKeys = new Set(
    (existingSlots || []).map((slot) =>
      `${slot.clinic_id}::${slot.date}::${slot.start_time}::${slot.end_time}`
    )
  );

  const candidateSlotKeys = new Set();
  let skippedExistingCount = 0;
  const slotsToInsert = [];

  for (let offset = 0; offset < normalizedDaysAhead; offset += 1) {
    const slotDate = addDaysToDateString(today, offset);
    const dayOfWeek = getDayOfWeekFromDateString(slotDate);

    templates
      .filter((template) => Number(template.day_of_week) === dayOfWeek)
      .forEach((template) => {
        const slotKey = [
          staffAssignment.clinic_id,
          slotDate,
          template.start_time,
          template.end_time
        ].join('::');

        if (candidateSlotKeys.has(slotKey)) {
          return;
        }

        candidateSlotKeys.add(slotKey);

        if (existingSlotKeys.has(slotKey)) {
          skippedExistingCount += 1;
          return;
        }

        slotsToInsert.push({
          clinic_id: staffAssignment.clinic_id,
          date: slotDate,
          start_time: template.start_time,
          end_time: template.end_time,
          capacity: template.capacity,
          booked_count: 0,
          status: 'available'
        });
      });
  }

  if (slotsToInsert.length === 0) {
    return {
      clinic_id: staffAssignment.clinic_id,
      from_date: today,
      through_date: throughDate,
      template_count: templates.length,
      created: 0,
      skipped_existing: skippedExistingCount
    };
  }

  const { data: insertedSlots, error: insertError } = await supabase
    .from('appointment_slots')
    .insert(slotsToInsert)
    .select('id');

  if (insertError) {
    throw createServiceError('Failed to generate appointment slots.', 500);
  }

  const createdCount = Array.isArray(insertedSlots) ? insertedSlots.length : 0;

  return {
    clinic_id: staffAssignment.clinic_id,
    from_date: today,
      through_date: throughDate,
      template_count: templates.length,
      created: createdCount,
      skipped_existing: skippedExistingCount
    };
}

module.exports = {
  createSlotTemplateForStaff,
  generateUpcomingSlotsForStaff,
  listSlotTemplatesForStaff,
  updateSlotTemplateForStaff
};
