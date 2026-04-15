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
}

document.addEventListener('DOMContentLoaded', loadQueuePage);
