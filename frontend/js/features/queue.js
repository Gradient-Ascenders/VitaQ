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
  NOT_IN_QUEUE: 'not_in_queue',
  WAITING: 'waiting',
  IN_CONSULTATION: 'in_consultation',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled'
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
    default:
      return state
        ? state.charAt(0).toUpperCase() + state.slice(1)
        : 'Unknown';
  }
}

function getMockQueueEntries(appointmentStart, currentState) {
  return [
    {
      position: 1,
      patientLabel: 'Patient 01',
      appointmentTime: '08:00',
      queueNumber: 'A001',
      status: QUEUE_STATES.COMPLETE
    },
    {
      position: 2,
      patientLabel: 'Patient 02',
      appointmentTime: '08:30',
      queueNumber: 'A002',
      status: QUEUE_STATES.COMPLETE
    },
    {
      position: 3,
      patientLabel: 'Patient 03',
      appointmentTime: '09:00',
      queueNumber: 'A003',
      status: QUEUE_STATES.WAITING
    },
    {
      position: 4,
      patientLabel: 'You',
      appointmentTime: appointmentStart ? appointmentStart.slice(0, 5) : '09:30',
      queueNumber: 'A004',
      status: currentState
    },
    {
      position: 5,
      patientLabel: 'Patient 05',
      appointmentTime: '10:00',
      queueNumber: 'A005',
      status: QUEUE_STATES.WAITING
    },
    {
      position: 6,
      patientLabel: 'Patient 06',
      appointmentTime: '10:30',
      queueNumber: 'A006',
      status: QUEUE_STATES.IN_CONSULTATION
    }
  ];
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
    default:
      return {
        label: 'Not in queue',
        badgeClass: 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]',
        message: 'You are not currently in the queue for this clinic visit.'
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

function renderQueueList(entries) {
  const list = document.getElementById('queueList');
  const summary = document.getElementById('queueListSummary');
  const totalCount = document.getElementById('queueTotalCount');
  const waitingCount = document.getElementById('queueWaitingCount');
  const inConsultationCount = document.getElementById('queueInConsultationCount');
  const completeCount = document.getElementById('queueCompleteCount');

  if (!list) {
    return;
  }

  const total = entries.length;
  const waiting = entries.filter((entry) => entry.status === QUEUE_STATES.WAITING).length;
  const inConsultation = entries.filter((entry) => entry.status === QUEUE_STATES.IN_CONSULTATION).length;
  const complete = entries.filter((entry) => entry.status === QUEUE_STATES.COMPLETE).length;

  if (summary) {
    summary.textContent = `${total} patient${total === 1 ? '' : 's'} in today’s queue`;
  }

  if (totalCount) totalCount.textContent = String(total);
  if (waitingCount) waitingCount.textContent = String(waiting);
  if (inConsultationCount) inConsultationCount.textContent = String(inConsultation);
  if (completeCount) completeCount.textContent = String(complete);

  list.innerHTML = '';

  entries.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'grid gap-4 px-5 py-4 md:grid-cols-[0.7fr_1.2fr_1fr_1fr_1.1fr] md:items-center';

    const highlightClass = entry.patientLabel === 'You'
      ? 'border border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]'
      : 'border border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';

    item.innerHTML = `
      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Position</p>
        <p class="text-base font-semibold text-[#e0e5ff]">${entry.position}</p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Patient</p>
        <p class="inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${highlightClass}">
          ${entry.patientLabel}
        </p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Appointment</p>
        <p class="text-sm font-medium text-[#c0caf5]">${entry.appointmentTime}</p>
      </section>

      <section class="flex items-center justify-between gap-3 md:block">
        <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Queue Number</p>
        <p class="text-sm font-medium text-[#c0caf5]">${entry.queueNumber}</p>
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

function loadQueuePage() {
  const params = new URLSearchParams(window.location.search);
  const clinic = params.get('clinic') || 'Clinic not available';
  const date = params.get('date') || '';
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  const state = params.get('state') || QUEUE_STATES.NOT_IN_QUEUE;

  document.getElementById('queueClinicHero').textContent = clinic;
  document.getElementById('queueClinicName').textContent = clinic;
  document.getElementById('queueDate').textContent = formatDate(date);
  document.getElementById('queueTime').textContent = formatTimeRange(start, end);
  document.getElementById('queueDayCaption').textContent = date
    ? `Queue details for ${formatDate(date)}`
    : 'Visit date unavailable';
  renderQueueState(state);
  renderQueueList(getMockQueueEntries(start, state));
}

document.addEventListener('DOMContentLoaded', loadQueuePage);
