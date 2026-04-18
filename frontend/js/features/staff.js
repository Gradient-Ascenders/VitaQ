const STAFF_QUEUE_STATUSES = {
  WAITING: 'waiting',
  IN_CONSULTATION: 'in_consultation',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled'
};

const ARRIVAL_TYPES = {
  APPOINTMENT: 'appointment',
  WALK_IN: 'walk_in'
};

const SLOT_TEMPLATE_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

const SLOT_TEMPLATE_GENERATION_DAYS = 14;

const DAYS_OF_WEEK = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
};

// Keep the frontend status options aligned with the backend workflow.
// Same-status is allowed in the UI so clicking save without a change does not break anything.
const ALLOWED_STATUS_OPTIONS = {
  waiting: ['waiting', 'in_consultation', 'cancelled'],
  in_consultation: ['in_consultation', 'complete', 'cancelled'],
  complete: ['complete'],
  cancelled: ['cancelled']
};

// Shared page state for the live staff dashboard.
const staffState = {
  clinic: null,
  queueDate: '',
  queueEntries: [],
  queueSummary: {
    total: 0,
    waiting: 0,
    in_consultation: 0,
    complete: 0,
    cancelled: 0
  },
  slotTemplates: [],
  slotTemplateFeedback: null,
  slotTemplateActionId: null,
  slotTemplateGenerationInProgress: false,
  editingSlotTemplateId: null,
  feedback: null,
  actionInProgressId: null
};

// Build today's local date in YYYY-MM-DD format.
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Safely update text content when the element exists.
function setTextContent(elementId, value) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.textContent = value;
}

// Escape untrusted text before injecting it into HTML strings.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatusLabel(status) {
  switch (status) {
    case STAFF_QUEUE_STATUSES.IN_CONSULTATION:
      return 'In consultation';
    case STAFF_QUEUE_STATUSES.COMPLETE:
      return 'Complete';
    case STAFF_QUEUE_STATUSES.CANCELLED:
      return 'Cancelled';
    case STAFF_QUEUE_STATUSES.WAITING:
    default:
      return 'Waiting';
  }
}

function getStatusBadgeClasses(status) {
  switch (status) {
    case STAFF_QUEUE_STATUSES.IN_CONSULTATION:
      return 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]';
    case STAFF_QUEUE_STATUSES.COMPLETE:
      return 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case STAFF_QUEUE_STATUSES.CANCELLED:
      return 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    case STAFF_QUEUE_STATUSES.WAITING:
    default:
      return 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]';
  }
}

function formatArrivalTypeLabel(arrivalType) {
  return arrivalType === ARRIVAL_TYPES.WALK_IN ? 'Walk-in' : 'Appointment';
}

function getArrivalTypeClasses(arrivalType) {
  if (arrivalType === ARRIVAL_TYPES.WALK_IN) {
    return 'border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dfcbff]';
  }

  return 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';
}

// Format queue numbers consistently for the staff table.
function formatQueueNumber(queueNumber) {
  const numericQueueNumber = Number(queueNumber);

  if (Number.isNaN(numericQueueNumber)) {
    return String(queueNumber || 'N/A');
  }

  return `Q${String(numericQueueNumber).padStart(3, '0')}`;
}

// Format appointment time values returned by the backend.
function formatTime(timeString) {
  return timeString?.slice(0, 5) || '';
}

// Format appointment or walk-in time values returned by the backend.
function formatAppointmentTime(startTime, endTime, source, timeLabel) {
  if (source === ARRIVAL_TYPES.WALK_IN && timeLabel) {
    return timeLabel;
  }

  if (startTime && endTime) {
    return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  }

  if (startTime) {
    return startTime.slice(0, 5);
  }

  if (source === ARRIVAL_TYPES.WALK_IN) {
    return 'Walk-in';
  }

  return 'N/A';
}

function formatQueueDate(dateString) {
  if (!dateString) {
    return 'today';
  }

  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Find the next patient who is still waiting.
function getNextWaitingEntry() {
  return staffState.queueEntries.find((entry) => entry.status === STAFF_QUEUE_STATUSES.WAITING) || null;
}

// Count walk-ins from the current queue entries.
function getWalkInCount(entries) {
  return entries.filter((entry) => entry.source === ARRIVAL_TYPES.WALK_IN).length;
}

// Show or hide the main dashboard feedback card.
function renderFeedback() {
  const feedback = document.getElementById('staffActionFeedback');

  if (!feedback) {
    return;
  }

  if (!staffState.feedback) {
    feedback.className = 'mt-8 hidden';
    feedback.textContent = '';
    return;
  }

  const typeClasses = {
    loading: 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]',
    success: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
    error: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
  };

  feedback.className = `mt-8 rounded-2xl border px-4 py-3 text-sm font-medium ${typeClasses[staffState.feedback.type] || typeClasses.loading}`;
  feedback.textContent = staffState.feedback.message;
}

// Show or hide the walk-in feedback box.
function renderWalkInFormFeedback(type, message) {
  const feedback = document.getElementById('walkInFormFeedback');

  if (!feedback) {
    return;
  }

  if (!type || !message) {
    feedback.className = 'mt-6 hidden';
    feedback.textContent = '';
    return;
  }

  const typeClasses = {
    success: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
    error: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
  };

  feedback.className = `mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${typeClasses[type] || typeClasses.error}`;
  feedback.textContent = message;
}

function renderSlotTemplateFeedback() {
  const feedback = document.getElementById('slotTemplateFeedback');

  if (!feedback) {
    return;
  }

  if (!staffState.slotTemplateFeedback) {
    feedback.className = 'mt-6 hidden';
    feedback.textContent = '';
    return;
  }

  const typeClasses = {
    loading: 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]',
    success: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
    error: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
  };

  feedback.className = `mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${typeClasses[staffState.slotTemplateFeedback.type] || typeClasses.loading}`;
  feedback.textContent = staffState.slotTemplateFeedback.message;
}

// Render the clinic snapshot card on the right.
function renderClinicSnapshot() {
  const nextWaitingEntry = getNextWaitingEntry();
  const clinicName = staffState.clinic?.name || 'Assigned clinic';

  setTextContent('staffClinicName', clinicName);
  setTextContent('walkInTodayCount', String(getWalkInCount(staffState.queueEntries)));

  if (!nextWaitingEntry) {
    setTextContent('nextWaitingPatient', 'No one waiting');
    setTextContent(
      'nextWaitingSummary',
      'All current patients have either been completed, cancelled, or are already in consultation.'
    );
    return;
  }

  setTextContent(
    'nextWaitingPatient',
    `${buildPatientLabel(nextWaitingEntry)} (${formatQueueNumber(nextWaitingEntry.queue_number)})`
  );
  setTextContent(
    'nextWaitingSummary',
    `${formatArrivalTypeLabel(nextWaitingEntry.source)} patient at ${formatAppointmentTime(
      nextWaitingEntry.appointment_time,
      nextWaitingEntry.appointment_end_time,
      nextWaitingEntry.source,
      nextWaitingEntry.time_label
    )}${nextWaitingEntry.visit_type ? ` for ${nextWaitingEntry.visit_type}` : ''} is next in the waiting queue.`
  );
}

// Render the summary metric cards above the table.
function renderSummaryCards() {
  const counts = staffState.queueSummary;
  const walkInCount = getWalkInCount(staffState.queueEntries);
  const total = Number(counts?.total || 0);

  setTextContent('queueTotalCount', String(total));
  setTextContent('queueWaitingCount', String(counts?.waiting || 0));
  setTextContent('queueInConsultationCount', String(counts?.in_consultation || 0));
  setTextContent('queueCompletedCount', String(counts?.complete || 0));
  setTextContent('queueWalkInCount', String(walkInCount));
  setTextContent(
    'queueManagementSummary',
    total === 0
      ? `No patients are currently in the queue for ${formatQueueDate(staffState.queueDate)}`
      : `${total} patient${total === 1 ? '' : 's'} currently visible for ${formatQueueDate(staffState.queueDate)}`
  );
}

// Toggle the empty-state section depending on whether queue entries exist.
function renderEmptyState() {
  const emptyState = document.getElementById('staffQueueEmptyState');
  const table = document.getElementById('staffQueueTable');
  const isEmpty = staffState.queueEntries.length === 0;

  if (!emptyState || !table) {
    return;
  }

  emptyState.classList.toggle('hidden', !isEmpty);
  table.classList.toggle('hidden', isEmpty);
}

// Limit the frontend status choices to sensible workflow options.
function buildStatusOptions(currentStatus) {
  const allowedStatuses = ALLOWED_STATUS_OPTIONS[currentStatus] || [currentStatus];

  return allowedStatuses
    .map(
      (status) =>
        `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${formatStatusLabel(status)}</option>`
    )
    .join('');
}

// Build a staff-friendly patient label from API data.
// Walk-ins should prefer the stored patient_label when available.
function buildPatientLabel(entry) {
  if (entry.patient_label) {
    return entry.patient_label;
  }

  if (entry.source === ARRIVAL_TYPES.WALK_IN) {
    return 'Walk-in patient';
  }

  if (entry.patient_id) {
    return `Patient ${String(entry.patient_id).slice(-6)}`;
  }

  return 'Patient';
}

function buildPatientSecondaryLabel(entry) {
  if (entry.source === ARRIVAL_TYPES.WALK_IN) {
    return entry.visit_type || 'Walk-in record';
  }

  if (entry.patient_id) {
    return `Patient ${String(entry.patient_id).slice(-6)}`;
  }

  return 'Patient record';
}

// Render the main staff queue table from live backend data.
function renderQueueTable() {
  const tableBody = document.getElementById('staffQueueTableBody');

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  staffState.queueEntries.forEach((entry) => {
    const isBusy = staffState.actionInProgressId === entry.id;
    const patientLabel = escapeHtml(buildPatientLabel(entry));
    const patientSecondaryLabel = escapeHtml(buildPatientSecondaryLabel(entry));
    const row = document.createElement('article');

    row.className = 'grid gap-5 px-5 py-5 lg:grid-cols-[0.9fr_1.25fr_0.95fr_0.95fr_0.95fr_1.35fr] lg:items-center';
    row.innerHTML = `
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Queue no.</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${formatQueueNumber(entry.queue_number)}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Patient</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${patientLabel}</p>
        <p class="text-xs text-[#8b93b8]">${patientSecondaryLabel}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Arrival type</p>
        <p class="inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getArrivalTypeClasses(entry.source)}">
          ${formatArrivalTypeLabel(entry.source)}
        </p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Time</p>
        <p class="text-sm text-[#c0caf5]">${formatAppointmentTime(entry.appointment_time, entry.appointment_end_time, entry.source, entry.time_label)}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Status</p>
        <p class="inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getStatusBadgeClasses(entry.status)}">
          ${formatStatusLabel(entry.status)}
        </p>
      </section>

      <section class="space-y-3">
        <label class="grid gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b93b8] lg:text-right">Update status</span>
          <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <select
              data-role="status-select"
              data-entry-id="${entry.id}"
              class="rounded-2xl border border-[#414868] bg-[#24283b]/90 px-4 py-2.5 text-sm text-[#e0e5ff] outline-none transition focus:border-[#7aa2f7]"
              ${isBusy ? 'disabled' : ''}
            >
              ${buildStatusOptions(entry.status)}
            </select>
            <button
              type="button"
              data-action="update-status"
              data-entry-id="${entry.id}"
              class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-4 py-2.5 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              ${isBusy ? 'disabled' : ''}
            >
              ${isBusy ? 'Saving...' : 'Save'}
            </button>
          </div>
        </label>
      </section>
    `;

    tableBody.appendChild(row);
  });
}

function formatDayOfWeekLabel(dayOfWeek) {
  return DAYS_OF_WEEK[Number(dayOfWeek)] || 'Unknown day';
}

function formatTemplateTimeWindow(startTime, endTime) {
  const formattedStartTime = formatTime(startTime);
  const formattedEndTime = formatTime(endTime);

  if (!formattedStartTime || !formattedEndTime) {
    return 'Time unavailable';
  }

  return `${formattedStartTime} - ${formattedEndTime}`;
}

function getSlotTemplateStatusClasses(status) {
  if (status === SLOT_TEMPLATE_STATUSES.INACTIVE) {
    return 'border-[#414868] bg-[#1f2335]/85 text-[#8b93b8]';
  }

  return 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
}

function formatSlotTemplateStatusLabel(status) {
  return status === SLOT_TEMPLATE_STATUSES.INACTIVE ? 'Inactive' : 'Active';
}

function getSlotTemplateById(templateId) {
  return staffState.slotTemplates.find((template) => String(template.id) === String(templateId)) || null;
}

function renderSlotTemplateSummary() {
  const totalTemplates = staffState.slotTemplates.length;
  const activeTemplates = staffState.slotTemplates.filter(
    (template) => template.status === SLOT_TEMPLATE_STATUSES.ACTIVE
  ).length;
  const clinicName = staffState.clinic?.name || 'your clinic';

  setTextContent('slotTemplateActiveCount', String(activeTemplates));
  setTextContent('slotTemplateTotalCount', String(totalTemplates));
  setTextContent('slotTemplateHorizon', `${SLOT_TEMPLATE_GENERATION_DAYS} days`);
  setTextContent(
    'slotTemplateSummary',
    totalTemplates === 0
      ? `No recurring slot templates configured for ${clinicName}.`
      : `${totalTemplates} template${totalTemplates === 1 ? '' : 's'} configured for ${clinicName}.`
  );
  setTextContent(
    'slotTemplateListCaption',
    totalTemplates === 0
      ? 'Create your first template to automate slots.'
      : `${activeTemplates} active template${activeTemplates === 1 ? '' : 's'} ready for generation.`
  );

  const generateButton = document.getElementById('generateSlotsButton');

  if (generateButton) {
    generateButton.disabled = staffState.slotTemplateGenerationInProgress;
    generateButton.textContent = staffState.slotTemplateGenerationInProgress
      ? 'Generating...'
      : `Generate next ${SLOT_TEMPLATE_GENERATION_DAYS} days`;
  }
}

function resetSlotTemplateForm() {
  const form = document.getElementById('slotTemplateForm');
  const formTitle = document.getElementById('slotTemplateFormTitle');
  const submitButton = document.getElementById('slotTemplateSubmitButton');
  const cancelButton = document.getElementById('slotTemplateCancelEditButton');
  const dayField = document.getElementById('slotTemplateDayOfWeek');
  const startField = document.getElementById('slotTemplateStartTime');
  const endField = document.getElementById('slotTemplateEndTime');
  const capacityField = document.getElementById('slotTemplateCapacity');
  const statusField = document.getElementById('slotTemplateStatus');

  staffState.editingSlotTemplateId = null;

  if (form) {
    form.reset();
  }

  if (dayField) {
    dayField.value = '1';
  }

  if (capacityField) {
    capacityField.value = '5';
  }

  if (statusField) {
    statusField.value = SLOT_TEMPLATE_STATUSES.ACTIVE;
  }

  if (formTitle) {
    formTitle.textContent = 'Add recurring slot template';
  }

  if (submitButton) {
    submitButton.textContent = 'Save template';
  }

  if (cancelButton) {
    cancelButton.classList.add('hidden');
  }

  if (startField) {
    startField.value = '';
  }

  if (endField) {
    endField.value = '';
  }
}

function populateSlotTemplateForm(template) {
  const formTitle = document.getElementById('slotTemplateFormTitle');
  const submitButton = document.getElementById('slotTemplateSubmitButton');
  const cancelButton = document.getElementById('slotTemplateCancelEditButton');
  const dayField = document.getElementById('slotTemplateDayOfWeek');
  const startField = document.getElementById('slotTemplateStartTime');
  const endField = document.getElementById('slotTemplateEndTime');
  const capacityField = document.getElementById('slotTemplateCapacity');
  const statusField = document.getElementById('slotTemplateStatus');

  staffState.editingSlotTemplateId = template.id;

  if (dayField) {
    dayField.value = String(template.day_of_week);
  }

  if (startField) {
    startField.value = formatTime(template.start_time);
  }

  if (endField) {
    endField.value = formatTime(template.end_time);
  }

  if (capacityField) {
    capacityField.value = String(template.capacity);
  }

  if (statusField) {
    statusField.value = template.status;
  }

  if (formTitle) {
    formTitle.textContent = 'Edit recurring slot template';
  }

  if (submitButton) {
    submitButton.textContent = 'Update template';
  }

  if (cancelButton) {
    cancelButton.classList.remove('hidden');
  }
}

function renderSlotTemplateList() {
  const list = document.getElementById('slotTemplateList');
  const emptyState = document.getElementById('slotTemplateEmptyState');

  if (!list || !emptyState) {
    return;
  }

  list.innerHTML = '';

  if (staffState.slotTemplates.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  staffState.slotTemplates.forEach((template) => {
    const isBusy = staffState.slotTemplateActionId === template.id;
    const isEditing = staffState.editingSlotTemplateId === template.id;
    const nextStatus = template.status === SLOT_TEMPLATE_STATUSES.ACTIVE
      ? SLOT_TEMPLATE_STATUSES.INACTIVE
      : SLOT_TEMPLATE_STATUSES.ACTIVE;
    const statusActionLabel = nextStatus === SLOT_TEMPLATE_STATUSES.ACTIVE ? 'Activate' : 'Pause';
    const templateCard = document.createElement('article');

    templateCard.className = 'rounded-[1.5rem] border border-[#414868] bg-[#1f2335]/85 px-5 py-5 shadow-md shadow-black/10';
    templateCard.innerHTML = `
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="grid gap-4 md:grid-cols-3 lg:flex-1">
          <section>
            <p class="text-xs uppercase tracking-[0.18em] text-[#8b93b8]">Day</p>
            <p class="mt-2 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatDayOfWeekLabel(template.day_of_week))}</p>
          </section>

          <section>
            <p class="text-xs uppercase tracking-[0.18em] text-[#8b93b8]">Time</p>
            <p class="mt-2 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatTemplateTimeWindow(template.start_time, template.end_time))}</p>
          </section>

          <section>
            <p class="text-xs uppercase tracking-[0.18em] text-[#8b93b8]">Capacity</p>
            <p class="mt-2 text-base font-semibold text-[#e0e5ff]">${escapeHtml(String(template.capacity))} patients</p>
          </section>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span class="inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${getSlotTemplateStatusClasses(template.status)}">
            ${escapeHtml(formatSlotTemplateStatusLabel(template.status))}
          </span>

          <button
            type="button"
            data-action="edit-slot-template"
            data-template-id="${template.id}"
            class="inline-flex items-center justify-center rounded-2xl border border-[#414868] bg-[#24283b]/90 px-4 py-2.5 text-sm font-medium text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#2a2f45] disabled:cursor-not-allowed disabled:opacity-60"
            ${isBusy ? 'disabled' : ''}
          >
            ${isEditing ? 'Editing' : 'Edit'}
          </button>

          <button
            type="button"
            data-action="toggle-slot-template"
            data-template-id="${template.id}"
            data-next-status="${nextStatus}"
            class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-4 py-2.5 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            ${isBusy ? 'disabled' : ''}
          >
            ${isBusy ? 'Saving...' : statusActionLabel}
          </button>
        </div>
      </div>
    `;

    list.appendChild(templateCard);
  });
}

// Re-render all live dashboard sections together.
function refreshStaffDashboard() {
  renderFeedback();
  renderClinicSnapshot();
  renderSummaryCards();
  renderEmptyState();
  renderQueueTable();
  renderSlotTemplateFeedback();
  renderSlotTemplateSummary();
  renderSlotTemplateList();
}

// Safely parse JSON without crashing if the response body is empty.
async function readJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse staff queue JSON:', error);
    return {};
  }
}

// Load the live staff queue from the backend.
// This assumes the backend identifies the correct clinic from the logged-in approved staff user.
async function loadStaffQueue(session, keepExistingFeedback = false) {
  const queueDate = getTodayDateString();

  const response = await fetch(`/api/queue/staff?date=${encodeURIComponent(queueDate)}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  const payload = await readJsonSafely(response);

  if (response.status === 401) {
    window.location.href = '/login';
    return false;
  }

  if (response.status === 403) {
    staffState.feedback = {
      type: 'error',
      message: payload.message || 'Staff access is required.'
    };
    staffState.queueEntries = [];
    staffState.queueSummary = {
      total: 0,
      waiting: 0,
      in_consultation: 0,
      complete: 0,
      cancelled: 0
    };
    refreshStaffDashboard();
    return false;
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to load staff queue.');
  }

  const queueData = payload.data || {};

  staffState.clinic = queueData.clinic || null;
  staffState.queueDate = queueData.queue_date || queueDate;
  staffState.queueEntries = Array.isArray(queueData.queue_entries) ? queueData.queue_entries : [];
  staffState.queueSummary = queueData.queue_summary || {
    total: 0,
    waiting: 0,
    in_consultation: 0,
    complete: 0,
    cancelled: 0
  };

  if (!keepExistingFeedback) {
    staffState.feedback = null;
  }

  refreshStaffDashboard();
  return true;
}

async function loadSlotTemplates(session, keepExistingFeedback = false) {
  const response = await fetch('/api/staff/slot-templates', {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  const payload = await readJsonSafely(response);

  if (response.status === 401) {
    window.location.href = '/login';
    return false;
  }

  if (response.status === 403) {
    staffState.slotTemplates = [];
    staffState.slotTemplateFeedback = {
      type: 'error',
      message: payload.message || 'Approved staff access is required to manage slot templates.'
    };
    refreshStaffDashboard();
    return false;
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to load slot templates.');
  }

  staffState.slotTemplates = Array.isArray(payload.data) ? payload.data : [];

  if (!keepExistingFeedback) {
    staffState.slotTemplateFeedback = null;
  }

  refreshStaffDashboard();
  return true;
}

// Update one queue entry status through the real backend endpoint.
async function updateQueueEntryStatus(entryId, nextStatus, session) {
  const entry = staffState.queueEntries.find((item) => item.id === entryId);

  if (!entry || staffState.actionInProgressId) {
    return;
  }

  staffState.actionInProgressId = entryId;
  staffState.feedback = {
    type: 'loading',
    message: `Updating ${buildPatientLabel(entry)} to ${formatStatusLabel(nextStatus).toLowerCase()}...`
  };
  refreshStaffDashboard();

  try {
    const response = await fetch(`/api/queue/staff/${encodeURIComponent(entryId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        status: nextStatus
      })
    });

    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to update queue status.');
    }

    staffState.feedback = {
      type: 'success',
      message: `${buildPatientLabel(entry)} updated to ${formatStatusLabel(nextStatus).toLowerCase()}.`
    };

    await loadStaffQueue(session, true);
  } catch (error) {
    console.error('Failed to update staff queue entry:', error);
    staffState.feedback = {
      type: 'error',
      message: error.message || 'Queue status update failed.'
    };
    refreshStaffDashboard();
  } finally {
    staffState.actionInProgressId = null;
    refreshStaffDashboard();
  }
}

/**
 * Adds a walk-in patient through the real backend endpoint.
 * The backend accepts patient_name, clinic_id, and queue_date for walk-ins.
 * The staff page reloads the live queue afterwards so the dashboard stays in sync.
 */
async function addWalkInPatient({ patientName, timeLabel, visitType }, session) {
  staffState.feedback = {
    type: 'loading',
    message: `Adding ${patientName} to the walk-in queue...`
  };
  refreshStaffDashboard();

  try {
    const response = await fetch('/api/queue/staff/walk-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        patient_name: patientName,
        clinic_id: staffState.clinic?.id || null,
        queue_date: staffState.queueDate || getTodayDateString(),
        visit_type: visitType || null,
        time_label: timeLabel || null
      })
    });

    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return false;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to add walk-in patient.');
    }

    staffState.feedback = {
      type: 'success',
      message: payload.message || `${patientName} added to the queue successfully.`
    };

    renderWalkInFormFeedback(
      'success',
      `${patientName} was added to today's queue.${timeLabel ? ` Requested time: ${timeLabel}.` : ''}`
    );

    await loadStaffQueue(session, true);
    return true;
  } catch (error) {
    console.error('Failed to add walk-in patient:', error);
    staffState.feedback = {
      type: 'error',
      message: error.message || 'Walk-in patient could not be added.'
    };
    renderWalkInFormFeedback(
      'error',
      error.message || 'Walk-in patient could not be added.'
    );
    refreshStaffDashboard();
    return false;
  }
}

async function submitSlotTemplate(session) {
  if (staffState.slotTemplateActionId || staffState.slotTemplateGenerationInProgress) {
    return;
  }

  const dayField = document.getElementById('slotTemplateDayOfWeek');
  const startField = document.getElementById('slotTemplateStartTime');
  const endField = document.getElementById('slotTemplateEndTime');
  const capacityField = document.getElementById('slotTemplateCapacity');
  const statusField = document.getElementById('slotTemplateStatus');
  const templateId = staffState.editingSlotTemplateId;
  const payload = {
    day_of_week: Number(dayField?.value || ''),
    start_time: startField?.value || '',
    end_time: endField?.value || '',
    capacity: Number(capacityField?.value || ''),
    status: statusField?.value || SLOT_TEMPLATE_STATUSES.ACTIVE
  };

  staffState.slotTemplateActionId = templateId || '__new__';
  staffState.slotTemplateFeedback = {
    type: 'loading',
    message: templateId ? 'Updating slot template...' : 'Saving slot template...'
  };
  refreshStaffDashboard();

  try {
    const response = await fetch(
      templateId
        ? `/api/staff/slot-templates/${encodeURIComponent(templateId)}`
        : '/api/staff/slot-templates',
      {
        method: templateId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      }
    );

    const responsePayload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(responsePayload.message || 'Failed to save slot template.');
    }

    staffState.slotTemplateFeedback = {
      type: 'success',
      message: templateId
        ? 'Recurring slot template updated successfully.'
        : 'Recurring slot template created successfully.'
    };

    resetSlotTemplateForm();
    await loadSlotTemplates(session, true);
  } catch (error) {
    console.error('Failed to save slot template:', error);
    staffState.slotTemplateFeedback = {
      type: 'error',
      message: error.message || 'Slot template could not be saved.'
    };
    refreshStaffDashboard();
  } finally {
    staffState.slotTemplateActionId = null;
    refreshStaffDashboard();
  }
}

async function toggleSlotTemplateStatus(templateId, nextStatus, session) {
  const template = getSlotTemplateById(templateId);

  if (!template || staffState.slotTemplateActionId || staffState.slotTemplateGenerationInProgress) {
    return;
  }

  staffState.slotTemplateActionId = templateId;
  staffState.slotTemplateFeedback = {
    type: 'loading',
    message: `${nextStatus === SLOT_TEMPLATE_STATUSES.ACTIVE ? 'Activating' : 'Pausing'} ${formatDayOfWeekLabel(template.day_of_week)} template...`
  };
  refreshStaffDashboard();

  try {
    const response = await fetch(`/api/staff/slot-templates/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        status: nextStatus
      })
    });

    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to update slot template.');
    }

    staffState.slotTemplateFeedback = {
      type: 'success',
      message: `${formatDayOfWeekLabel(template.day_of_week)} template ${nextStatus === SLOT_TEMPLATE_STATUSES.ACTIVE ? 'activated' : 'paused'} successfully.`
    };

    if (staffState.editingSlotTemplateId === templateId) {
      resetSlotTemplateForm();
    }

    await loadSlotTemplates(session, true);
  } catch (error) {
    console.error('Failed to update slot template status:', error);
    staffState.slotTemplateFeedback = {
      type: 'error',
      message: error.message || 'Slot template status update failed.'
    };
    refreshStaffDashboard();
  } finally {
    staffState.slotTemplateActionId = null;
    refreshStaffDashboard();
  }
}

async function generateUpcomingSlots(session) {
  if (staffState.slotTemplateGenerationInProgress || staffState.slotTemplateActionId) {
    return;
  }

  staffState.slotTemplateGenerationInProgress = true;
  staffState.slotTemplateFeedback = {
    type: 'loading',
    message: `Generating appointment slots for the next ${SLOT_TEMPLATE_GENERATION_DAYS} days...`
  };
  refreshStaffDashboard();

  try {
    const response = await fetch('/api/staff/slot-templates/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        days_ahead: SLOT_TEMPLATE_GENERATION_DAYS
      })
    });

    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to generate appointment slots.');
    }

    const generationSummary = payload.data || {};
    const createdCount = Number(generationSummary.created || 0);
    const skippedCount = Number(generationSummary.skipped_existing || 0);

    staffState.slotTemplateFeedback = {
      type: 'success',
      message: createdCount === 0 && skippedCount === 0
        ? 'No active templates were available to generate future appointment slots.'
        : `Generated ${createdCount} slot${createdCount === 1 ? '' : 's'} for the next ${SLOT_TEMPLATE_GENERATION_DAYS} days. ${skippedCount} existing slot${skippedCount === 1 ? ' was' : 's were'} left unchanged.`
    };

    await loadSlotTemplates(session, true);
  } catch (error) {
    console.error('Failed to generate upcoming slots:', error);
    staffState.slotTemplateFeedback = {
      type: 'error',
      message: error.message || 'Appointment slot generation failed.'
    };
    refreshStaffDashboard();
  } finally {
    staffState.slotTemplateGenerationInProgress = false;
    refreshStaffDashboard();
  }
}

// Attach click handling for the status update buttons in the queue table.
function initialiseQueueActions(session) {
  const tableBody = document.getElementById('staffQueueTableBody');

  if (!tableBody) {
    return;
  }

  tableBody.addEventListener('click', async function (event) {
    const actionButton = event.target.closest('button[data-action="update-status"]');

    if (!actionButton) {
      return;
    }

    const entryId = actionButton.dataset.entryId;
    const statusSelect = tableBody.querySelector(`select[data-entry-id="${entryId}"]`);

    if (!statusSelect) {
      return;
    }

    await updateQueueEntryStatus(entryId, statusSelect.value, session);
  });
}

function initialiseSlotTemplateActions(session) {
  const form = document.getElementById('slotTemplateForm');
  const templateList = document.getElementById('slotTemplateList');
  const generateButton = document.getElementById('generateSlotsButton');
  const cancelEditButton = document.getElementById('slotTemplateCancelEditButton');

  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      await submitSlotTemplate(session);
    });
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', function () {
      resetSlotTemplateForm();
      refreshStaffDashboard();
    });
  }

  if (generateButton) {
    generateButton.addEventListener('click', async function () {
      await generateUpcomingSlots(session);
    });
  }

  if (templateList) {
    templateList.addEventListener('click', async function (event) {
      const editButton = event.target.closest('button[data-action="edit-slot-template"]');
      const toggleButton = event.target.closest('button[data-action="toggle-slot-template"]');

      if (editButton) {
        const template = getSlotTemplateById(editButton.dataset.templateId);

        if (!template) {
          return;
        }

        populateSlotTemplateForm(template);
        refreshStaffDashboard();
        return;
      }

      if (toggleButton) {
        await toggleSlotTemplateStatus(
          toggleButton.dataset.templateId,
          toggleButton.dataset.nextStatus,
          session
        );
      }
    });
  }
}

/**
 * Wire the walk-in form to the live API.
 * The current backend only needs patient_id plus clinic/date context.
 */
function initialiseWalkInForm(session) {
  const form = document.getElementById('walkInForm');
  const patientNameField = document.getElementById('walkInPatientName');
  const timeField = document.getElementById('walkInTime');
  const visitTypeField = document.getElementById('walkInVisitType');

  if (!form || !patientNameField || !timeField || !visitTypeField) {
    return;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const patientName = patientNameField.value.trim();
    const timeLabel = timeField.value;
    const visitType = visitTypeField.value;

    renderWalkInFormFeedback(null, '');

    if (!patientName) {
      renderWalkInFormFeedback('error', 'Enter a patient name or identifier before adding a walk-in.');
      patientNameField.focus();
      return;
    }

    if (!timeLabel) {
      renderWalkInFormFeedback('error', 'Select a time before adding a walk-in.');
      timeField.focus();
      return;
    }

    const wasAdded = await addWalkInPatient(
      {
        patientName,
        timeLabel,
        visitType
      },
      session
    );

    if (!wasAdded) {
      return;
    }

    form.reset();
    visitTypeField.value = 'General consultation';
    timeField.value = '';
    patientNameField.focus();
  });
}

// Entry point for the staff dashboard page.
async function initialiseStaffPage() {
  initialiseLogoutButton('logoutButton');

  const session = await requireAuthenticatedUser();

  if (!session) {
    return;
  }

  try {
    const profile = await getCurrentUserProfile(session);

    if (!profile) {
      window.location.href = '/dashboard';
      return;
    }

    if (profile.role !== 'staff') {
      window.location.href = getHomeRouteForRole(profile.role);
      return;
    }
  } catch (error) {
    console.error('Staff role check failed:', error);
    window.location.href = '/dashboard';
    return;
  }

  const userName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Staff';
  setTextContent('staffName', userName);
  resetSlotTemplateForm();
  refreshStaffDashboard();

  try {
    await loadStaffQueue(session);
  } catch (error) {
    console.error('Failed to load staff queue page:', error);
    staffState.feedback = {
      type: 'error',
      message: error.message || 'Queue data could not be loaded.'
    };
    refreshStaffDashboard();
  }

  try {
    await loadSlotTemplates(session);
  } catch (error) {
    console.error('Failed to load slot templates:', error);
    staffState.slotTemplateFeedback = {
      type: 'error',
      message: error.message || 'Slot templates could not be loaded.'
    };
    refreshStaffDashboard();
  }

  initialiseQueueActions(session);
  initialiseSlotTemplateActions(session);
  initialiseWalkInForm(session);
}

document.addEventListener('DOMContentLoaded', initialiseStaffPage);
