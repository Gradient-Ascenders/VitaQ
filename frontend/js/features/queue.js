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

function formatTimeRange(start, end) {
  const cleanStart = start ? start.slice(0, 5) : 'N/A';
  const cleanEnd = end ? end.slice(0, 5) : 'N/A';

  if (!start && !end) {
    return 'N/A';
  }

  return `${cleanStart} - ${cleanEnd}`;
}

const QUEUE_STATES = {
  UNAVAILABLE: 'unavailable',
  NOT_IN_QUEUE: 'not_in_queue',
  WAITING: 'waiting',
  IN_CONSULTATION: 'in_consultation',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled'
};

const QUEUE_EMPTY_STATES = {
  NOT_IN_QUEUE: 'not_in_queue',
  QUEUE_UNAVAILABLE: 'queue_unavailable'
};

function getQueueBadgeClasses(state) {
  switch (state) {
    case QUEUE_STATES.WAITING:
      return 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]';
    case QUEUE_STATES.IN_CONSULTATION:
      return 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]';
    case QUEUE_STATES.COMPLETE:
      return 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case QUEUE_STATES.CANCELLED:
      return 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    case QUEUE_STATES.UNAVAILABLE:
      return 'border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dfcbff]';
    case QUEUE_STATES.NOT_IN_QUEUE:
    default:
      return 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';
  }
}

function formatQueueStateLabel(state) {
  switch (state) {
    case QUEUE_STATES.IN_CONSULTATION:
      return 'In consultation';
    case QUEUE_STATES.NOT_IN_QUEUE:
      return 'Not in queue';
    case QUEUE_STATES.UNAVAILABLE:
      return 'Unavailable';
    default:
      return state
        ? state.charAt(0).toUpperCase() + state.slice(1)
        : 'Unknown';
  }
}

function getQueueStateConfig(state) {
  switch (state) {
    case QUEUE_STATES.WAITING:
      return {
        label: 'Waiting',
        badgeClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]',
        message: 'You are currently in the queue and waiting for your turn at the clinic.'
      };
    case QUEUE_STATES.IN_CONSULTATION:
      return {
        label: 'In consultation',
        badgeClass: 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]',
        message: 'You are currently being attended to by clinic staff.'
      };
    case QUEUE_STATES.COMPLETE:
      return {
        label: 'Complete',
        badgeClass: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
        message: 'Your queue process for this clinic visit has been completed.'
      };
    case QUEUE_STATES.CANCELLED:
      return {
        label: 'Cancelled',
        badgeClass: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]',
        message: 'This queue entry has been cancelled and is no longer active for this clinic visit.'
      };
    case QUEUE_STATES.NOT_IN_QUEUE:
      return {
        label: 'Not in queue',
        badgeClass: 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]',
        message: 'You do not currently have an active queue entry for this clinic visit.'
      };
    case QUEUE_STATES.UNAVAILABLE:
      return {
        label: 'Unavailable',
        badgeClass: 'border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dfcbff]',
        message: 'Queue information could not be loaded right now. Please try again shortly.'
      };
    default:
      return {
        label: 'Waiting',
        badgeClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]',
        message: 'You are currently in the queue and waiting for your turn at the clinic.'
      };
  }
}

function renderQueueState(state) {
  const badge = document.getElementById('queueStateBadge');
  const message = document.getElementById('queueStateMessage');

  if (!badge || !message) {
    return;
  }

  const config = getQueueStateConfig(state);

  badge.textContent = config.label;
  badge.className = `inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${config.badgeClass}`;
  message.textContent = config.message;
}

function getQueueEmptyStateConfig(emptyState) {
  switch (emptyState) {
    case QUEUE_EMPTY_STATES.NOT_IN_QUEUE:
      return {
        eyebrow: 'Not in queue',
        title: 'No active queue entry for this visit',
        message: 'This visit does not currently have an active queue entry. Return to your appointments if you need to confirm the visit details.'
      };
    case QUEUE_EMPTY_STATES.QUEUE_UNAVAILABLE:
    default:
      return {
        eyebrow: 'Queue unavailable',
        title: 'Queue unavailable right now',
        message: 'The clinic queue cannot be displayed at the moment. Please refresh later or contact clinic staff if the problem continues.'
      };
  }
}

function renderQueueEmptyState(emptyState) {
  const content = document.getElementById('queueListContent');
  const emptyContainer = document.getElementById('queueEmptyState');
  const eyebrow = document.getElementById('queueEmptyStateEyebrow');
  const title = document.getElementById('queueEmptyStateTitle');
  const message = document.getElementById('queueEmptyStateMessage');
  const summary = document.getElementById('queueListSummary');
  const footnote = document.getElementById('queueListFootnote');

  if (!emptyContainer || !title || !message || !eyebrow) {
    return;
  }

  const config = getQueueEmptyStateConfig(emptyState);

  if (content) {
    content.classList.add('hidden');
  }

  if (summary) {
    summary.textContent = config.title;
  }

  if (footnote) {
    footnote.classList.add('hidden');
  }

  eyebrow.textContent = config.eyebrow;
  title.textContent = config.title;
  message.textContent = config.message;
  emptyContainer.classList.remove('hidden');
}

function formatWaitTime(minutes, queueState) {
  if (queueState === QUEUE_STATES.IN_CONSULTATION) {
    return 'Now';
  }

  if (
    queueState === QUEUE_STATES.NOT_IN_QUEUE
    || queueState === QUEUE_STATES.UNAVAILABLE
    || queueState === QUEUE_STATES.CANCELLED
    || queueState === QUEUE_STATES.COMPLETE
  ) {
    return '--';
  }

  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return '--';
  }

  return `${minutes} min${minutes === 1 ? '' : 's'}`;
}

function renderQueueMetrics(queueEntry, position, queueState) {
  const positionValue = document.getElementById('queuePositionValue');
  const queueNumberValue = document.getElementById('queueNumberValue');
  const queueWaitValue = document.getElementById('queueWaitValue');

  if (!positionValue || !queueNumberValue || !queueWaitValue) {
    return;
  }

  if (queueState === QUEUE_STATES.IN_CONSULTATION) {
    positionValue.textContent = 'Now';
  } else if (typeof position === 'number') {
    positionValue.textContent = String(position);
  } else {
    positionValue.textContent = '--';
  }

  queueNumberValue.textContent = queueEntry?.queue_number || '--';
  queueWaitValue.textContent = formatWaitTime(queueEntry?.estimated_wait_minutes, queueState);
}

function buildPatientLabel(entry) {
  if (entry.is_current_patient) {
    return 'You';
  }

  if (typeof entry.position === 'number') {
    return `Patient ${String(entry.position).padStart(2, '0')}`;
  }

  return 'Patient';
}

function renderQueueList(entries, summaryCounts) {
  const list = document.getElementById('queueList');
  const summary = document.getElementById('queueListSummary');
  const totalCount = document.getElementById('queueTotalCount');
  const waitingCount = document.getElementById('queueWaitingCount');
  const inConsultationCount = document.getElementById('queueInConsultationCount');
  const completeCount = document.getElementById('queueCompleteCount');
  const content = document.getElementById('queueListContent');
  const emptyContainer = document.getElementById('queueEmptyState');
  const footnote = document.getElementById('queueListFootnote');

  if (!list) {
    return;
  }

  if (content) {
    content.classList.remove('hidden');
  }

  if (emptyContainer) {
    emptyContainer.classList.add('hidden');
  }

  if (footnote) {
    footnote.classList.remove('hidden');
  }

  const total = Number(summaryCounts?.total || entries.length);
  const waiting = Number(summaryCounts?.waiting || 0);
  const inConsultation = Number(summaryCounts?.in_consultation || 0);
  const complete = Number(summaryCounts?.complete || 0);

  if (summary) {
    summary.textContent = `${total} patient${total === 1 ? '' : 's'} in this queue`;
  }

  if (totalCount) totalCount.textContent = String(total);
  if (waitingCount) waitingCount.textContent = String(waiting);
  if (inConsultationCount) inConsultationCount.textContent = String(inConsultation);
  if (completeCount) completeCount.textContent = String(complete);

  list.innerHTML = '';

  entries.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'grid gap-4 px-5 py-4 md:grid-cols-[0.7fr_1.2fr_1fr_1fr_1.1fr] md:items-center';
    const patientLabel = buildPatientLabel(entry);
    const positionLabel = typeof entry.position === 'number' ? String(entry.position) : '--';

    const highlightClass = entry.is_current_patient
      ? 'border border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]'
      : 'border border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';

    item.innerHTML = `
      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Position</p>
        <p class="text-base font-semibold text-[#e0e5ff]">${positionLabel}</p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Patient</p>
        <p class="inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${highlightClass}">
          ${patientLabel}
        </p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Appointment</p>
        <p class="text-sm font-medium text-[#c0caf5]">${entry.appointment_time}</p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Queue Number</p>
        <p class="text-sm font-medium text-[#c0caf5]">${entry.queue_number}</p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Status</p>
        <p class="inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getQueueBadgeClasses(entry.status)}">
          ${formatQueueStateLabel(entry.status)}
        </p>
      </section>
    `;

    list.appendChild(item);
  });
}

function applyVisitDetails(params) {
  const clinic = params.get('clinic') || 'Clinic not available';
  const date = params.get('date') || '';
  const start = params.get('start') || '';
  const end = params.get('end') || '';

  document.getElementById('queueClinicHero').textContent = clinic;
  document.getElementById('queueClinicName').textContent = clinic;
  document.getElementById('queueDate').textContent = formatDate(date);
  document.getElementById('queueTime').textContent = formatTimeRange(start, end);
  document.getElementById('queueDayCaption').textContent = date
    ? `Queue details for ${formatDate(date)}`
    : 'Visit date unavailable';
}

async function loadQueuePage() {
  const params = new URLSearchParams(window.location.search);
  const clinicId = params.get('clinicId') || '';
  const date = params.get('date') || '';
  initialiseLogoutButton('logoutButton');
  applyVisitDetails(params);

  const session = await requireAuthenticatedUser();
  if (!session) {
    return;
  }

  if (!clinicId || !date) {
    renderQueueState(QUEUE_STATES.UNAVAILABLE);
    renderQueueMetrics(null, null, QUEUE_STATES.UNAVAILABLE);
    renderQueueEmptyState(QUEUE_EMPTY_STATES.QUEUE_UNAVAILABLE);
    return;
  }

  try {
    const response = await fetch(`/api/queue/my-status?clinic_id=${encodeURIComponent(clinicId)}&date=${encodeURIComponent(date)}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const payload = await response.json();

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load queue status.');
    }

    const queueData = payload.data || {};
    const queueState = queueData.is_in_queue
      ? queueData.queue_entry?.status || QUEUE_STATES.WAITING
      : QUEUE_STATES.NOT_IN_QUEUE;

    renderQueueState(queueState);
    renderQueueMetrics(queueData.queue_entry, queueData.position, queueState);

    if (!queueData.is_in_queue) {
      renderQueueEmptyState(QUEUE_EMPTY_STATES.NOT_IN_QUEUE);
      return;
    }

    renderQueueList(queueData.queue_entries || [], queueData.queue_summary || {});
  } catch (error) {
    console.error(error);
    renderQueueState(QUEUE_STATES.UNAVAILABLE);
    renderQueueMetrics(null, null, QUEUE_STATES.UNAVAILABLE);
    renderQueueEmptyState(QUEUE_EMPTY_STATES.QUEUE_UNAVAILABLE);
  }
}

document.addEventListener('DOMContentLoaded', loadQueuePage);
