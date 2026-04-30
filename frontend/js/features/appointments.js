// Appointments page logic.
// This page renders the patient's booking history and exposes frontend-only
// cancel and reschedule flows for active appointments.

const pageState = {
  session: null,
  appointments: [],
  loadingAppointments: true,
  appointmentsError: '',
  feedback: null,
  activePanelAppointmentId: null,
  panel: createClosedPanelState()
};

function createClosedPanelState() {
  return {
    mode: null,
    loading: false,
    message: '',
    messageType: 'error',
    slotsLoading: false,
    slotsError: '',
    slots: [],
    selectedSlotId: ''
  };
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  return date.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(timeString) {
  return timeString ? timeString.slice(0, 5) : 'N/A';
}

function formatTimeRange(startTime, endTime) {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatus(status) {
  if (!status) return 'Unknown';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusClasses(status) {
  switch (status) {
    case 'booked':
      return 'border border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case 'completed':
      return 'border border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]';
    case 'cancelled':
      return 'border border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    default:
      return 'border border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';
  }
}

function getPageFeedbackClasses(type) {
  switch (type) {
    case 'success':
      return 'border border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case 'error':
      return 'border border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    default:
      return 'border border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]';
  }
}

function getInlineMessageClasses(type) {
  switch (type) {
    case 'info':
      return 'border border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]';
    case 'success':
      return 'border border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    default:
      return 'border border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
  }
}

function canViewQueue(appointment) {
  return appointment?.status === 'booked' && appointment?.clinic && appointment?.slot?.date;
}

function canManageAppointment(appointment) {
  return appointment?.status === 'booked';
}

function canRescheduleAppointment(appointment) {
  return canManageAppointment(appointment) && Boolean(appointment?.clinic_id) && Boolean(appointment?.slot_id);
}

function buildQueuePageUrl(appointment) {
  const clinic = appointment.clinic || {};
  const slot = appointment.slot || {};
  const params = new URLSearchParams({
    clinic: clinic.name || '',
    clinicId: appointment.clinic_id || '',
    appointmentId: appointment.id || '',
    date: slot.date || '',
    start: slot.start_time || '',
    end: slot.end_time || ''
  });

  return `/queue?${params.toString()}`;
}

function buildRequestHeaders(includeJson = false) {
  const headers = {};

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (pageState.session?.access_token) {
    headers.Authorization = `Bearer ${pageState.session.access_token}`;
  }

  return headers;
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  try {
    const text = await response.text();
    return text ? { message: text } : {};
  } catch (error) {
    return {};
  }
}

function getActionErrorMessage(response, payloadMessage, fallbackMessage) {
  const cleanedMessage = String(payloadMessage || '').trim();

  if (cleanedMessage && cleanedMessage !== '404 Not Found') {
    return cleanedMessage;
  }

  if (response.status === 404) {
    return 'This action is not available right now. Please try again later.';
  }

  if (response.status === 409) {
    return 'This appointment can no longer be changed. Refresh the page and try again.';
  }

  return fallbackMessage;
}

function setPageFeedback(type, message) {
  pageState.feedback = message
    ? {
        type,
        message
      }
    : null;
}

function clearPageFeedback() {
  pageState.feedback = null;
}

function getAppointmentById(appointmentId) {
  return pageState.appointments.find((appointment) => String(appointment.id) === String(appointmentId)) || null;
}

function clearActivePanel() {
  pageState.activePanelAppointmentId = null;
  pageState.panel = createClosedPanelState();
}

function syncActivePanelWithAppointments() {
  if (!pageState.activePanelAppointmentId || !pageState.panel.mode) {
    return;
  }

  const activeAppointment = getAppointmentById(pageState.activePanelAppointmentId);

  if (!activeAppointment || !canManageAppointment(activeAppointment)) {
    clearActivePanel();
  }
}

function getAvailabilityForSlot(slot) {
  const capacity = Number(slot?.capacity || 0);
  const bookedCount = Number(slot?.booked_count || 0);

  if (Number.isFinite(Number(slot?.availability))) {
    return Math.max(Number(slot.availability), 0);
  }

  return Math.max(capacity - bookedCount, 0);
}

function isValidRescheduleSlot(slot, appointment) {
  if (!slot || !appointment) {
    return false;
  }

  if (String(slot.id) === String(appointment.slot_id)) {
    return false;
  }

  if (slot.status !== 'available') {
    return false;
  }

  if (getAvailabilityForSlot(slot) <= 0) {
    return false;
  }

  return Boolean(slot.date && slot.start_time && slot.end_time);
}

function buildAppointmentDetailsMarkup(appointment) {
  const details = [];

  if (appointment?.cancelled_at) {
    details.push(`
      <article class="rounded-3xl border border-[#f7768e]/20 bg-[#f7768e]/10 p-5">
        <p class="text-xs uppercase tracking-[0.2em] text-[#f4b5c0]">Cancelled On</p>
        <p class="mt-3 text-base font-semibold text-[#ffe0e6]">${escapeHtml(formatDateTime(appointment.cancelled_at))}</p>
      </article>
    `);
  }

  if (appointment?.cancellation_reason) {
    details.push(`
      <article class="rounded-3xl border border-[#f7768e]/20 bg-[#f7768e]/10 p-5">
        <p class="text-xs uppercase tracking-[0.2em] text-[#f4b5c0]">Cancellation Reason</p>
        <p class="mt-3 text-sm leading-6 text-[#ffe0e6]">${escapeHtml(appointment.cancellation_reason)}</p>
      </article>
    `);
  }

  if (appointment?.rescheduled_at) {
    details.push(`
      <article class="rounded-3xl border border-[#7aa2f7]/20 bg-[#7aa2f7]/10 p-5">
        <p class="text-xs uppercase tracking-[0.2em] text-[#c7d8ff]">Rescheduled On</p>
        <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatDateTime(appointment.rescheduled_at))}</p>
      </article>
    `);
  }

  if (appointment?.notes) {
    details.push(`
      <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5 md:col-span-3">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Notes</p>
        <p class="mt-3 text-sm leading-6 text-[#c0caf5]">${escapeHtml(appointment.notes)}</p>
      </article>
    `);
  }

  if (details.length === 0) {
    return '';
  }

  return `
    <section class="mt-4 grid gap-4 md:grid-cols-3">
      ${details.join('')}
    </section>
  `;
}

function buildAppointmentActionMarkup(appointment) {
  if (!canManageAppointment(appointment)) {
    return '';
  }

  const actionPanelIsOpen = String(pageState.activePanelAppointmentId) === String(appointment.id);
  const actionPanel = actionPanelIsOpen ? pageState.panel : createClosedPanelState();
  const isBusy = actionPanel.loading;
  const canReschedule = canRescheduleAppointment(appointment);
  const queueAction = canViewQueue(appointment)
    ? `
      <a
        href="${buildQueuePageUrl(appointment)}"
        class="inline-flex items-center justify-center rounded-2xl border border-[#7aa2f7]/35 bg-[#7aa2f7]/12 px-5 py-3 text-sm font-semibold text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#7aa2f7]/18"
      >
        View Queue
      </a>
    `
    : '';
  const rescheduleDisabledAttributes = canReschedule ? '' : 'disabled aria-disabled="true"';
  const rescheduleButtonClasses = canReschedule
    ? 'border border-[#7aa2f7]/35 bg-[#7aa2f7]/12 text-[#c0caf5] hover:border-[#7aa2f7] hover:bg-[#7aa2f7]/18'
    : 'cursor-not-allowed border border-[#414868] bg-[#24283b]/80 text-[#6b7194]';
  const cancelDisabledAttributes = isBusy ? 'disabled aria-disabled="true"' : '';

  return `
    <section class="mt-6 rounded-[1.75rem] border border-[#414868] bg-[#1f2335]/85 p-5">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Actions</p>
          <p class="mt-2 text-sm leading-6 text-[#a9b1d6]">
            Change requests are only available while this appointment is still booked.
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          ${queueAction}
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl border border-[#f7768e]/35 bg-[#f7768e]/10 px-5 py-3 text-sm font-semibold text-[#f4b5c0] transition hover:border-[#f7768e] hover:bg-[#f7768e]/18 disabled:cursor-not-allowed disabled:opacity-60"
            data-action="open-cancel"
            data-appointment-id="${escapeHtml(appointment.id)}"
            ${cancelDisabledAttributes}
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${rescheduleButtonClasses}"
            data-action="open-reschedule"
            data-appointment-id="${escapeHtml(appointment.id)}"
            ${rescheduleDisabledAttributes}
            ${isBusy ? 'disabled aria-disabled="true"' : ''}
          >
            Reschedule
          </button>
        </div>
      </div>

      ${!canReschedule ? `
        <p class="mt-4 rounded-2xl border border-[#e0af68]/20 bg-[#e0af68]/10 px-4 py-3 text-sm text-[#f6d8a8]">
          Rescheduling is not available for this appointment right now.
        </p>
      ` : ''}

      ${buildActionPanelMarkup(appointment, actionPanelIsOpen ? actionPanel : null)}
    </section>
  `;
}

function buildActionPanelMarkup(appointment, panel) {
  if (!panel || !panel.mode) {
    return '';
  }

  if (panel.mode === 'cancel') {
    const messageMarkup = panel.message
      ? `
        <section class="mt-4 rounded-2xl px-4 py-3 text-sm ${getInlineMessageClasses(panel.messageType)}">
          ${escapeHtml(panel.message)}
        </section>
      `
      : '';

    return `
      <section class="mt-5 rounded-[1.5rem] border border-[#f7768e]/20 bg-[#241c2d] p-5">
        <p class="text-sm font-semibold text-[#f4b5c0]">Cancel this appointment?</p>
        <p class="mt-2 text-sm leading-6 text-[#c0caf5]">
          This will mark the appointment as cancelled. Make sure you still want to give up this visit before you confirm.
        </p>

        ${messageMarkup}

        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl border border-[#414868] bg-[#24283b]/85 px-5 py-3 text-sm font-semibold text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#2a2f45] disabled:cursor-not-allowed disabled:opacity-60"
            data-action="close-panel"
            data-appointment-id="${escapeHtml(appointment.id)}"
            ${panel.loading ? 'disabled aria-disabled="true"' : ''}
          >
            Keep appointment
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl bg-[#f7768e] px-5 py-3 text-sm font-semibold text-[#1a1b26] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            data-action="confirm-cancel"
            data-appointment-id="${escapeHtml(appointment.id)}"
            ${panel.loading ? 'disabled aria-disabled="true"' : ''}
          >
            ${panel.loading ? 'Cancelling...' : 'Confirm cancellation'}
          </button>
        </div>
      </section>
    `;
  }

  const currentSlot = appointment.slot || {};
  const inlineMessageMarkup = panel.message
    ? `
      <section class="mt-4 rounded-2xl px-4 py-3 text-sm ${getInlineMessageClasses(panel.messageType)}">
        ${escapeHtml(panel.message)}
      </section>
    `
    : '';
  const slotsErrorMarkup = panel.slotsError
    ? `
      <section class="mt-4 rounded-2xl px-4 py-3 text-sm ${getInlineMessageClasses('error')}">
        ${escapeHtml(panel.slotsError)}
      </section>
    `
    : '';
  const slotsLoadingMarkup = panel.slotsLoading
    ? `
      <section class="mt-4 rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-4 py-3 text-sm text-[#b8ecff]">
        Loading available appointment slots...
      </section>
    `
    : '';

  let slotsMarkup = '';

  if (!panel.slotsLoading && !panel.slotsError) {
    if (panel.slots.length === 0) {
      slotsMarkup = `
        <section class="mt-4 rounded-2xl border border-[#414868] bg-[#24283b]/70 px-4 py-4 text-sm text-[#a9b1d6]">
          No other valid slots are available for this clinic right now.
        </section>
      `;
    } else {
      slotsMarkup = `
        <fieldset class="mt-4 grid gap-3" ${panel.loading ? 'disabled' : ''}>
          <legend class="sr-only">Select a new appointment slot</legend>
          ${panel.slots.map((slot) => {
            const isSelected = String(panel.selectedSlotId) === String(slot.id);
            const availability = getAvailabilityForSlot(slot);

            return `
              <label class="flex cursor-pointer flex-col gap-3 rounded-[1.35rem] border px-4 py-4 transition ${isSelected ? 'border-[#7aa2f7] bg-[#7aa2f7]/12' : 'border-[#414868] bg-[#24283b]/80 hover:border-[#7aa2f7]/50'} ${panel.loading ? 'pointer-events-none opacity-60' : ''}">
                <div class="flex items-start gap-3">
                  <input
                    type="radio"
                    name="rescheduleSlot"
                    value="${escapeHtml(slot.id)}"
                    class="mt-1 h-4 w-4 border-[#7aa2f7] bg-[#1a1b26] text-[#7aa2f7] focus:ring-[#7aa2f7]"
                    data-slot-picker="true"
                    ${isSelected ? 'checked' : ''}
                    ${panel.loading ? 'disabled' : ''}
                  />
                  <div class="flex-1">
                    <p class="text-sm font-semibold text-[#e0e5ff]">${escapeHtml(formatDate(slot.date))}</p>
                    <p class="mt-1 text-sm text-[#c0caf5]">${escapeHtml(formatTimeRange(slot.start_time, slot.end_time))}</p>
                    <p class="mt-2 text-xs uppercase tracking-[0.18em] text-[#7dcfff]">
                      ${escapeHtml(`${availability} space${availability === 1 ? '' : 's'} left`)}
                    </p>
                  </div>
                </div>
              </label>
            `;
          }).join('')}
        </fieldset>
      `;
    }
  }

  return `
    <section class="mt-5 rounded-[1.5rem] border border-[#7aa2f7]/20 bg-[#1d2337] p-5">
      <p class="text-sm font-semibold text-[#c7d8ff]">Choose a new slot</p>
      <p class="mt-2 text-sm leading-6 text-[#c0caf5]">
        Current appointment: ${escapeHtml(formatDate(currentSlot.date))} at ${escapeHtml(formatTimeRange(currentSlot.start_time, currentSlot.end_time))}.
      </p>

      ${inlineMessageMarkup}
      ${slotsErrorMarkup}
      ${slotsLoadingMarkup}
      ${slotsMarkup}

      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl border border-[#414868] bg-[#24283b]/85 px-5 py-3 text-sm font-semibold text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#2a2f45] disabled:cursor-not-allowed disabled:opacity-60"
          data-action="close-panel"
          data-appointment-id="${escapeHtml(appointment.id)}"
          ${panel.loading ? 'disabled aria-disabled="true"' : ''}
        >
          Close
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-5 py-3 text-sm font-semibold text-[#1a1b26] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          data-action="confirm-reschedule"
          data-appointment-id="${escapeHtml(appointment.id)}"
          ${(panel.loading || panel.slotsLoading || panel.slots.length === 0) ? 'disabled aria-disabled="true"' : ''}
        >
          ${panel.loading ? 'Rescheduling...' : 'Confirm reschedule'}
        </button>
      </div>
    </section>
  `;
}

function renderPageScaffolding() {
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const pageActionFeedback = document.getElementById('pageActionFeedback');
  const emptyState = document.getElementById('emptyState');
  const appointmentsList = document.getElementById('appointmentsList');
  const appointmentsCount = document.getElementById('appointmentsCount');

  const isInitialLoading = pageState.loadingAppointments && pageState.appointments.length === 0 && !pageState.appointmentsError;

  loadingState.classList.toggle('hidden', !isInitialLoading);

  if (pageState.appointmentsError) {
    errorState.textContent = pageState.appointmentsError;
    errorState.classList.remove('hidden');
  } else {
    errorState.textContent = '';
    errorState.classList.add('hidden');
  }

  if (pageState.feedback?.message) {
    pageActionFeedback.className = `mt-6 rounded-3xl px-6 py-5 ${getPageFeedbackClasses(pageState.feedback.type)}`;
    pageActionFeedback.textContent = pageState.feedback.message;
    pageActionFeedback.classList.remove('hidden');
  } else {
    pageActionFeedback.textContent = '';
    pageActionFeedback.className = 'mt-6 hidden rounded-3xl px-6 py-5';
  }

  if (isInitialLoading || pageState.appointmentsError) {
    appointmentsList.classList.add('hidden');
    emptyState.classList.add('hidden');
    appointmentsCount.textContent = isInitialLoading ? 'Loading appointments...' : 'Appointments unavailable';
    return;
  }

  if (!pageState.appointments.length) {
    appointmentsCount.textContent = '0 appointments';
    appointmentsList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  appointmentsCount.textContent = `${pageState.appointments.length} appointment${pageState.appointments.length === 1 ? '' : 's'}`;
  appointmentsList.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

function renderAppointments() {
  const appointmentsList = document.getElementById('appointmentsList');

  appointmentsList.innerHTML = '';

  if (pageState.loadingAppointments || pageState.appointmentsError || !pageState.appointments.length) {
    return;
  }

  pageState.appointments.forEach((appointment) => {
    const clinic = appointment.clinic || {};
    const slot = appointment.slot || {};
    const location = [clinic.area, clinic.district, clinic.province].filter(Boolean).join(' • ');
    const address = clinic.address || 'Address not available';
    const appointmentDetailsMarkup = buildAppointmentDetailsMarkup(appointment);
    const actionMarkup = buildAppointmentActionMarkup(appointment);
    const queueOnlyMarkup = !canManageAppointment(appointment) && canViewQueue(appointment)
      ? `
        <section class="lg:justify-self-end">
          <a
            href="${buildQueuePageUrl(appointment)}"
            class="inline-flex items-center justify-center rounded-2xl border border-[#7aa2f7]/35 bg-[#7aa2f7]/12 px-5 py-3 text-sm font-semibold text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#7aa2f7]/18"
          >
            View Queue
          </a>
        </section>
      `
      : '';

    const card = document.createElement('article');
    card.className =
      'rounded-[2rem] border border-[#414868] bg-[#24283b]/72 p-6 shadow-xl shadow-black/10 backdrop-blur-sm';

    card.innerHTML = `
      <section class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <section class="flex-1">
          <div class="flex flex-wrap items-center gap-3">
            <p class="inline-flex rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7dcfff]">
              Appointment
            </p>
            <p class="inline-flex rounded-full px-4 py-2 text-sm font-semibold ${getStatusClasses(appointment.status)}">
              ${formatStatus(appointment.status)}
            </p>
          </div>

          <h3 class="mt-4 text-2xl font-semibold text-[#e0e5ff]">
            ${escapeHtml(clinic.name || 'Clinic not available')}
          </h3>

          <p class="mt-3 text-sm text-[#a9b1d6]">
            ${escapeHtml(location || 'Location not available')}
          </p>

          <p class="mt-2 text-sm text-[#8b93b8]">
            ${escapeHtml(clinic.facility_type || 'Facility type not available')}
          </p>

          <p class="mt-2 text-sm text-[#8b93b8]">
            ${escapeHtml(address)}
          </p>
        </section>

        ${queueOnlyMarkup}
      </section>

      <section class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Date</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatDate(slot.date))}</p>
        </article>

        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Time</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatTimeRange(slot.start_time, slot.end_time))}</p>
        </article>

        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Booked On</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${escapeHtml(formatDate(appointment.created_at))}</p>
        </article>
      </section>

      ${appointmentDetailsMarkup}
      ${actionMarkup}
    `;

    appointmentsList.appendChild(card);
  });
}

function renderPage() {
  syncActivePanelWithAppointments();
  renderPageScaffolding();
  renderAppointments();
}

async function fetchAppointments(options = {}) {
  const shouldShowLoadingState = Boolean(options.showLoadingState);
  const preserveExistingOnError = Boolean(options.preserveExistingOnError);

  if (shouldShowLoadingState) {
    pageState.loadingAppointments = true;
    pageState.appointmentsError = '';
    renderPage();
  }

  try {
    const response = await fetch('/api/appointments', {
      headers: buildRequestHeaders()
    });
    const payload = await parseResponsePayload(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return false;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load appointments.');
    }

    pageState.appointments = Array.isArray(payload.data) ? payload.data : [];
    pageState.appointmentsError = '';
    return true;
  } catch (error) {
    console.error(error);

    if (preserveExistingOnError && pageState.appointments.length > 0) {
      pageState.appointmentsError = '';
    } else {
      pageState.appointmentsError = error.message || 'We could not load your appointments right now.';
    }

    return false;
  } finally {
    pageState.loadingAppointments = false;
    renderPage();
  }
}

async function loadRescheduleSlots(appointment) {
  const appointmentId = String(appointment.id);

  pageState.panel.slotsLoading = true;
  pageState.panel.slotsError = '';
  pageState.panel.message = '';
  pageState.panel.messageType = 'error';
  pageState.panel.slots = [];
  pageState.panel.selectedSlotId = '';
  renderPage();

  try {
    const response = await fetch(`/api/clinics/${encodeURIComponent(appointment.clinic_id)}/slots`, {
      headers: buildRequestHeaders()
    });
    const payload = await parseResponsePayload(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load available slots.');
    }

    if (String(pageState.activePanelAppointmentId) !== appointmentId || pageState.panel.mode !== 'reschedule') {
      return;
    }

    pageState.panel.slots = (Array.isArray(payload.data) ? payload.data : []).filter((slot) =>
      isValidRescheduleSlot(slot, appointment)
    );
  } catch (error) {
    console.error(error);

    if (String(pageState.activePanelAppointmentId) !== appointmentId || pageState.panel.mode !== 'reschedule') {
      return;
    }

    pageState.panel.slotsError = error.message || 'We could not load available slots right now.';
  } finally {
    if (String(pageState.activePanelAppointmentId) === appointmentId && pageState.panel.mode === 'reschedule') {
      pageState.panel.slotsLoading = false;
      renderPage();
    }
  }
}

function openCancelPanel(appointmentId) {
  const appointment = getAppointmentById(appointmentId);

  if (!appointment || !canManageAppointment(appointment)) {
    setPageFeedback('error', 'This appointment can no longer be cancelled from this page.');
    renderPage();
    return;
  }

  clearPageFeedback();
  pageState.activePanelAppointmentId = appointment.id;
  pageState.panel = {
    mode: 'cancel',
    loading: false,
    message: '',
    messageType: 'error',
    slotsLoading: false,
    slotsError: '',
    slots: [],
    selectedSlotId: ''
  };
  renderPage();
}

function openReschedulePanel(appointmentId) {
  const appointment = getAppointmentById(appointmentId);

  if (!appointment || !canManageAppointment(appointment)) {
    setPageFeedback('error', 'This appointment can no longer be rescheduled from this page.');
    renderPage();
    return;
  }

  if (!canRescheduleAppointment(appointment)) {
    setPageFeedback('error', 'Rescheduling is not available for this appointment right now.');
    renderPage();
    return;
  }

  clearPageFeedback();
  pageState.activePanelAppointmentId = appointment.id;
  pageState.panel = {
    mode: 'reschedule',
    loading: false,
    message: '',
    messageType: 'error',
    slotsLoading: false,
    slotsError: '',
    slots: [],
    selectedSlotId: ''
  };
  renderPage();
  loadRescheduleSlots(appointment);
}

function closeActivePanel(appointmentId) {
  if (String(pageState.activePanelAppointmentId) !== String(appointmentId) || pageState.panel.loading) {
    return;
  }

  clearActivePanel();
  renderPage();
}

async function submitCancellation(appointmentId) {
  const appointment = getAppointmentById(appointmentId);

  if (!appointment || !canManageAppointment(appointment)) {
    pageState.panel.message = 'This appointment can no longer be cancelled.';
    pageState.panel.messageType = 'error';
    renderPage();
    return;
  }

  pageState.panel.loading = true;
  pageState.panel.message = '';
  renderPage();

  try {
    const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/cancel`, {
      method: 'PATCH',
      headers: buildRequestHeaders(true),
      body: JSON.stringify({})
    });
    const payload = await parseResponsePayload(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(
        getActionErrorMessage(
          response,
          payload.message,
          'We could not cancel this appointment right now.'
        )
      );
    }

    clearActivePanel();
    const refreshed = await fetchAppointments({ preserveExistingOnError: true });

    if (refreshed) {
      setPageFeedback('success', payload.message || 'Your appointment was cancelled successfully.');
    } else {
      setPageFeedback('error', 'The appointment was updated, but the page could not refresh automatically.');
    }

    renderPage();
  } catch (error) {
    console.error(error);
    pageState.panel.loading = false;
    pageState.panel.message = error.message || 'We could not cancel this appointment right now.';
    pageState.panel.messageType = 'error';
    renderPage();
  }
}

async function submitReschedule(appointmentId) {
  const appointment = getAppointmentById(appointmentId);

  if (!appointment || !canManageAppointment(appointment)) {
    pageState.panel.message = 'This appointment can no longer be rescheduled.';
    pageState.panel.messageType = 'error';
    renderPage();
    return;
  }

  if (!pageState.panel.selectedSlotId) {
    pageState.panel.message = 'Please choose a new appointment slot before confirming.';
    pageState.panel.messageType = 'error';
    renderPage();
    return;
  }

  const selectedSlot = pageState.panel.slots.find(
    (slot) => String(slot.id) === String(pageState.panel.selectedSlotId)
  );

  if (!selectedSlot || !isValidRescheduleSlot(selectedSlot, appointment)) {
    pageState.panel.message = 'That slot is no longer allowed. Please choose another available slot.';
    pageState.panel.messageType = 'error';
    renderPage();
    return;
  }

  pageState.panel.loading = true;
  pageState.panel.message = '';
  renderPage();

  try {
    const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/reschedule`, {
      method: 'PATCH',
      headers: buildRequestHeaders(true),
      body: JSON.stringify({
        new_slot_id: selectedSlot.id
      })
    });
    const payload = await parseResponsePayload(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(
        getActionErrorMessage(
          response,
          payload.message,
          'We could not reschedule this appointment right now.'
        )
      );
    }

    clearActivePanel();
    const refreshed = await fetchAppointments({ preserveExistingOnError: true });

    if (refreshed) {
      setPageFeedback('success', payload.message || 'Your appointment was rescheduled successfully.');
    } else {
      setPageFeedback('error', 'The appointment was updated, but the page could not refresh automatically.');
    }

    renderPage();
  } catch (error) {
    console.error(error);
    pageState.panel.loading = false;
    pageState.panel.message = error.message || 'We could not reschedule this appointment right now.';
    pageState.panel.messageType = 'error';
    renderPage();
  }
}

function handleAppointmentListClick(event) {
  const actionButton = event.target.closest('button[data-action]');

  if (!actionButton) {
    return;
  }

  const { action, appointmentId } = actionButton.dataset;

  if (!action || !appointmentId) {
    return;
  }

  if (action === 'open-cancel') {
    openCancelPanel(appointmentId);
    return;
  }

  if (action === 'open-reschedule') {
    openReschedulePanel(appointmentId);
    return;
  }

  if (action === 'close-panel') {
    closeActivePanel(appointmentId);
    return;
  }

  if (action === 'confirm-cancel') {
    submitCancellation(appointmentId);
    return;
  }

  if (action === 'confirm-reschedule') {
    submitReschedule(appointmentId);
  }
}

function handleAppointmentListChange(event) {
  const slotInput = event.target.closest('input[data-slot-picker="true"]');

  if (!slotInput) {
    return;
  }

  pageState.panel.selectedSlotId = slotInput.value;
  pageState.panel.message = '';
  pageState.panel.messageType = 'error';
  renderPage();
}

async function loadAppointmentsPage() {
  initialiseLogoutButton('logoutButton');

  const session = await requireAuthenticatedUser();
  if (!session) {
    return;
  }

  pageState.session = session;
  renderPage();
  await fetchAppointments({ showLoadingState: true });
}

document.addEventListener('DOMContentLoaded', () => {
  const appointmentsList = document.getElementById('appointmentsList');

  appointmentsList.addEventListener('click', handleAppointmentListClick);
  appointmentsList.addEventListener('change', handleAppointmentListChange);

  loadAppointmentsPage();
});
