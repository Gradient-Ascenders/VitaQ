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

function formatReminderDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'appointment time';
  }

  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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

const queuePageContext = {
  clinicId: '',
  appointmentId: '',
  date: '',
  start: '',
  end: '',
  session: null,
  joinQueueLoading: false,

  // Reminder status comes from the appointment record.
  // The queue page falls back to time-based messages only if the backend status is unavailable.
  reminderLoading: false,
  reminderError: '',
  reminderStatus: '',
  reminderRecord: null
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

/**
 * Builds the near-turn alert content for the UI.
 * The backend decides whether near-turn is true.
 * The frontend only decides how to present the alert.
 */
function getNearTurnAlertConfig(position, nearTurnMessage) {
  if (position === 1) {
    return {
      title: 'It is almost your turn',
      message: nearTurnMessage || 'You are next in the queue. Please stay ready now and watch for staff guidance.',
      priority: 'high'
    };
  }

  return {
    title: 'Your turn is coming up soon',
    message: nearTurnMessage || 'You are close to the front of the queue. Please stay nearby and be ready to move when called.',
    priority: 'normal'
  };
}

/**
 * Renders the near-turn alert using the backend's near-turn state.
 * This keeps the UI aligned with the service logic and prevents the
 * page from inventing its own near-turn rule separately.
 */
function renderNearTurnAlert({ queueState, position, nearTurn, nearTurnMessage }) {
  const alert = document.getElementById('nearTurnAlert');
  const title = document.getElementById('nearTurnAlertTitle');
  const message = document.getElementById('nearTurnAlertMessage');
  const positionBadge = document.getElementById('nearTurnAlertPosition');
  const eyebrow = document.getElementById('nearTurnAlertEyebrow');

  if (!alert || !title || !message || !positionBadge || !eyebrow) {
    return;
  }

  // Safety rule:
  // only waiting patients with an active near-turn flag should see this banner.
  if (queueState !== QUEUE_STATES.WAITING || !nearTurn) {
    alert.classList.add('hidden');
    alert.setAttribute('data-priority', 'normal');
    positionBadge.textContent = '';
    return;
  }

  const config = getNearTurnAlertConfig(position, nearTurnMessage);

  eyebrow.textContent = position === 1 ? 'Immediate attention' : 'Near-turn alert';
  title.textContent = config.title;
  message.textContent = config.message;
  positionBadge.textContent =
    typeof position === 'number' && Number.isFinite(position)
      ? `Position ${position}`
      : 'Be ready';
  alert.setAttribute('data-priority', config.priority);
  alert.classList.remove('hidden');
}

function getQueueEmptyStateConfig(emptyState) {
  switch (emptyState) {
    case QUEUE_EMPTY_STATES.NOT_IN_QUEUE:
      return {
        eyebrow: 'Not in queue',
        title: 'No active queue entry for this visit',
        message: 'This visit does not currently have an active queue entry. Join the queue when you arrive at the clinic so your live position and wait estimate can start updating.'
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

function renderJoinQueueAction({ visible, loading = false, message = '', isError = false } = {}) {
  const container = document.getElementById('queueJoinAction');
  const button = document.getElementById('joinQueueButton');
  const messageElement = document.getElementById('joinQueueMessage');

  if (!container || !button || !messageElement) {
    return;
  }

  if (!visible) {
    container.classList.add('hidden');
    button.disabled = false;
    button.textContent = 'Join Queue Now';
    messageElement.textContent = '';
    messageElement.className = 'mt-3 text-sm leading-7 text-[#8b93b8]';
    return;
  }

  container.classList.remove('hidden');
  button.disabled = loading;
  button.textContent = loading ? 'Joining queue...' : 'Join Queue Now';
  messageElement.textContent = message;
  messageElement.className = `mt-3 text-sm leading-7 ${
    isError ? 'text-[#f4b5c0]' : 'text-[#8b93b8]'
  }`;
}

async function joinQueueForCurrentVisit() {
  if (
    queuePageContext.joinQueueLoading
    || !queuePageContext.session?.access_token
    || !queuePageContext.appointmentId
  ) {
    return;
  }

  queuePageContext.joinQueueLoading = true;
  renderJoinQueueAction({
    visible: true,
    loading: true,
    message: 'Creating your queue entry for this visit.'
  });

  try {
    const response = await fetch('/api/queue/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${queuePageContext.session.access_token}`
      },
      body: JSON.stringify({
        appointment_id: queuePageContext.appointmentId
      })
    });

    const payload = await response.json();

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to join queue.');
    }

    await loadQueueStatus();
  } catch (error) {
    console.error(error);
    renderJoinQueueAction({
      visible: true,
      loading: false,
      message: error.message || 'Failed to join queue.',
      isError: true
    });
  } finally {
    queuePageContext.joinQueueLoading = false;
  }
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

function getResolvedWaitEstimate(queueData) {
  const waitEstimateCandidates = [
    queueData?.predicted_wait_minutes,
    queueData?.estimated_wait_minutes,
    queueData?.queue_entry?.estimated_wait_minutes
  ];

  for (const candidate of waitEstimateCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
  }

  return null;
}

function getQueueEstimateDisplay(queueState, waitEstimateMinutes) {
  if (queueState === QUEUE_STATES.IN_CONSULTATION) {
    return {
      metricValue: 'Now',
      heading: 'Clinic staff are attending to you now',
      value: 'Now',
      message: 'You do not need to rely on an estimate while your consultation is in progress.',
      footnote: 'Live queue movement can still affect other patients waiting behind you.'
    };
  }

  if (queueState === QUEUE_STATES.WAITING && waitEstimateMinutes !== null) {
    const formattedWaitTime = formatWaitTime(waitEstimateMinutes, queueState);

    return {
      metricValue: formattedWaitTime,
      heading: 'Estimated time until your turn',
      value: formattedWaitTime,
      message: 'Use this as a guide while you keep watching your queue status on this page.',
      footnote: 'This is an estimate, not a guaranteed call time. It may change as the queue moves.'
    };
  }

  if (queueState === QUEUE_STATES.WAITING) {
    return {
      metricValue: '--',
      heading: 'Wait time estimate not available yet',
      value: '--',
      message: 'Your queue number, status, and position will still keep updating here.',
      footnote: 'An estimate will appear once current queue timing data is available.'
    };
  }

  if (queueState === QUEUE_STATES.NOT_IN_QUEUE) {
    return {
      metricValue: '--',
      heading: 'No active wait estimate for this visit',
      value: '--',
      message: 'You do not currently have an active queue entry for this clinic visit.',
      footnote: 'If you join the queue later, an estimate may appear here when available.'
    };
  }

  if (queueState === QUEUE_STATES.COMPLETE) {
    return {
      metricValue: '--',
      heading: 'This visit is complete',
      value: '--',
      message: 'Your queue process for this clinic visit has finished.',
      footnote: 'No additional wait time estimate is needed for a completed visit.'
    };
  }

  if (queueState === QUEUE_STATES.CANCELLED) {
    return {
      metricValue: '--',
      heading: 'This queue entry has been cancelled',
      value: '--',
      message: 'Cancelled queue entries no longer receive active wait time estimates.',
      footnote: 'Contact clinic staff if you need help with this visit.'
    };
  }

  return {
    metricValue: '--',
    heading: 'Wait time estimate unavailable',
    value: '--',
    message: 'The queue page is still available, but the wait estimate could not be shown right now.',
    footnote: 'Please refresh later if you need the latest estimate.'
  };
}

function renderQueueEstimate(queueState, waitEstimateMinutes) {
  const queueWaitValue = document.getElementById('queueWaitValue');
  const heading = document.getElementById('queueEstimateHeading');
  const value = document.getElementById('queueEstimateValue');
  const message = document.getElementById('queueEstimateMessage');
  const footnote = document.getElementById('queueEstimateFootnote');

  if (!queueWaitValue || !heading || !value || !message || !footnote) {
    return;
  }

  const config = getQueueEstimateDisplay(queueState, waitEstimateMinutes);

  queueWaitValue.textContent = config.metricValue;
  heading.textContent = config.heading;
  value.textContent = config.value;
  message.textContent = config.message;
  footnote.textContent = config.footnote;
}

// Normalises reminder status values returned from the appointment endpoint.
function normaliseReminderStatus(status) {
  return String(status || '').trim().toLowerCase();
}

// Reads the reminder status fields that may be attached to an appointment.
function getAppointmentReminderStatus(appointment) {
  const candidates = [
    appointment?.reminder_status,
    appointment?.email_reminder_status,
    appointment?.notification_status,
    appointment?.reminder?.status
  ];

  return normaliseReminderStatus(
    candidates.find((status) => typeof status === 'string' && status.trim()) || ''
  );
}

// Formats reminder timestamps for the queue reminder panel.
function formatReminderRecordDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-ZA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Loads the real reminder status for the current appointment.
// Without this, the queue page can only guess based on the appointment time.
async function loadQueueAppointmentReminderStatus() {
  if (!queuePageContext.session?.access_token || !queuePageContext.appointmentId) {
    return;
  }

  queuePageContext.reminderLoading = true;
  queuePageContext.reminderError = '';
  renderQueueReminderStatus();

  try {
    const response = await fetch('/api/appointments', {
      headers: {
        Authorization: `Bearer ${queuePageContext.session.access_token}`
      }
    });

    const payload = await response.json();

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load appointment reminder status.');
    }

    const appointments = Array.isArray(payload.data) ? payload.data : [];
    const appointment = appointments.find((entry) =>
      String(entry.id) === String(queuePageContext.appointmentId)
    );

    if (!appointment) {
      queuePageContext.reminderStatus = '';
      queuePageContext.reminderRecord = null;
      return;
    }

    queuePageContext.reminderStatus = getAppointmentReminderStatus(appointment);
    queuePageContext.reminderRecord =
      appointment.reminder && typeof appointment.reminder === 'object'
        ? appointment.reminder
        : null;
  } catch (error) {
    console.error(error);
    queuePageContext.reminderError =
      error.message || 'Reminder status could not be checked right now.';
  } finally {
    queuePageContext.reminderLoading = false;
    renderQueueReminderStatus();
  }
}

function getQueueReminderStatusConfig() {
  if (queuePageContext.reminderLoading) {
    return {
      title: 'Checking reminder status',
      badge: 'Loading',
      badgeClass: 'border-[#7dcfff]/25 bg-[#7dcfff]/10 text-[#b8ecff]',
      panelClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10',
      message: 'Checking whether your appointment reminder is pending, sent, or failed.'
    };
  }

  if (queuePageContext.reminderError) {
    return {
      title: 'Reminder status unavailable',
      badge: 'Check failed',
      badgeClass: 'border-[#f7768e]/25 bg-[#f7768e]/10 text-[#f4b5c0]',
      panelClass: 'border-[#f7768e]/20 bg-[#f7768e]/10',
      message: queuePageContext.reminderError
    };
  }

  if (queuePageContext.reminderStatus === 'sent') {
    const sentAt = formatReminderRecordDateTime(queuePageContext.reminderRecord?.sent_at);

    return {
      title: 'Reminder sent',
      badge: 'Sent',
      badgeClass: 'border-[#9ece6a]/25 bg-[#9ece6a]/10 text-[#d6f3b8]',
      panelClass: 'border-[#9ece6a]/20 bg-[#9ece6a]/10',
      message: sentAt
        ? `Your 30-minute appointment reminder was sent at ${sentAt}.`
        : 'Your 30-minute appointment reminder has been sent to your account email address.'
    };
  }

  if (queuePageContext.reminderStatus === 'failed') {
    return {
      title: 'Reminder failed',
      badge: 'Failed',
      badgeClass: 'border-[#f7768e]/25 bg-[#f7768e]/10 text-[#f4b5c0]',
      panelClass: 'border-[#f7768e]/20 bg-[#f7768e]/10',
      message: queuePageContext.reminderRecord?.error_message ||
        'The reminder could not be sent. Please still use the appointment time shown on this page.'
    };
  }

  if (queuePageContext.reminderStatus === 'pending') {
    const scheduledFor = formatReminderRecordDateTime(queuePageContext.reminderRecord?.scheduled_for);

    return {
      title: 'Reminder pending',
      badge: 'Pending',
      badgeClass: 'border-[#7dcfff]/25 bg-[#7dcfff]/10 text-[#b8ecff]',
      panelClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10',
      message: scheduledFor
        ? `Your reminder is scheduled for ${scheduledFor}.`
        : 'Your reminder is scheduled and will be sent before your visit.'
    };
  }

  if (!queuePageContext.appointmentId) {
    return {
      title: 'Appointment reminder unavailable',
      badge: 'No appointment',
      badgeClass: 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]',
      panelClass: 'border-[#414868] bg-[#1f2335]/85',
      message: 'This queue page is not linked to a booked appointment, so appointment reminder status cannot be shown.'
    };
  }

  if (!queuePageContext.date || !queuePageContext.start) {
    return {
      title: 'Reminder time unavailable',
      badge: 'Check time',
      badgeClass: 'border-[#e0af68]/25 bg-[#e0af68]/10 text-[#f6d8a8]',
      panelClass: 'border-[#e0af68]/20 bg-[#e0af68]/10',
      message: 'Your reminder is enabled, but the appointment start time is not available on this queue page.'
    };
  }

  const appointmentStart = new Date(`${queuePageContext.date}T${queuePageContext.start}`);

  if (Number.isNaN(appointmentStart.getTime())) {
    return {
      title: 'Reminder time unavailable',
      badge: 'Check time',
      badgeClass: 'border-[#e0af68]/25 bg-[#e0af68]/10 text-[#f6d8a8]',
      panelClass: 'border-[#e0af68]/20 bg-[#e0af68]/10',
      message: 'Your reminder is enabled, but the appointment start time could not be read from this queue page.'
    };
  }

  const minutesUntilStart = Math.round((appointmentStart.getTime() - Date.now()) / 60000);
  const reminderTime = new Date(appointmentStart.getTime() - 30 * 60000);

  if (minutesUntilStart > 30) {
    return {
      title: 'Reminder pending',
      badge: 'Pending',
      badgeClass: 'border-[#7dcfff]/25 bg-[#7dcfff]/10 text-[#b8ecff]',
      panelClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10',
      message: `A reminder is scheduled for ${formatReminderDateTime(reminderTime)}, 30 minutes before your appointment.`
    };
  }

  if (minutesUntilStart >= 0) {
    return {
      title: 'Reminder window active',
      badge: 'Due soon',
      badgeClass: 'border-[#bb9af7]/25 bg-[#bb9af7]/10 text-[#dfcbff]',
      panelClass: 'border-[#bb9af7]/20 bg-[#bb9af7]/10',
      message: 'Your appointment starts in less than 30 minutes. Check your email and keep following this queue page.'
    };
  }

  return {
    title: 'Reminder window passed',
    badge: 'Processed',
    badgeClass: 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]',
    panelClass: 'border-[#414868] bg-[#1f2335]/85',
    message: 'If email reminders are enabled for your account, the 30-minute reminder window for this appointment has already passed.'
  };
}

function renderQueueReminderStatus() {
  const panel = document.getElementById('queueReminderPanel');
  const title = document.getElementById('queueReminderTitle');
  const message = document.getElementById('queueReminderMessage');
  const badge = document.getElementById('queueReminderBadge');

  if (!title || !message || !badge) {
    return;
  }

  const config = getQueueReminderStatusConfig();

  if (panel) {
    panel.className = `mt-6 rounded-[1.5rem] border px-5 py-5 shadow-lg shadow-black/10 ${config.panelClass}`;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-atomic', 'true');
  }

  title.textContent = config.title;
  message.textContent = config.message;
  badge.textContent = config.badge;
  badge.className = `inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${config.badgeClass}`;
}

function renderQueueMetrics(queueEntry, position, queueState) {
  const positionValue = document.getElementById('queuePositionValue');
  const queueNumberValue = document.getElementById('queueNumberValue');

  if (!positionValue || !queueNumberValue) {
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
    item.className = 'grid gap-4 px-5 py-4 md:grid-cols-[0.7fr_1.2fr_1fr_1.1fr] md:items-center';
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
  renderQueueReminderStatus();
}

async function loadQueueStatus() {
  if (!queuePageContext.clinicId || !queuePageContext.date) {
    renderQueueState(QUEUE_STATES.UNAVAILABLE);
    renderQueueMetrics(null, null, QUEUE_STATES.UNAVAILABLE);
    renderQueueEstimate(QUEUE_STATES.UNAVAILABLE, null);
    renderNearTurnAlert({
      queueState: QUEUE_STATES.UNAVAILABLE,
      position: null,
      nearTurn: false,
      nearTurnMessage: null
    });
    renderQueueEmptyState(QUEUE_EMPTY_STATES.QUEUE_UNAVAILABLE);
    renderJoinQueueAction({ visible: false });
    return;
  }

  try {
    const queryParams = new URLSearchParams({
      clinic_id: queuePageContext.clinicId,
      date: queuePageContext.date
    });

    if (queuePageContext.appointmentId) {
      queryParams.set('appointment_id', queuePageContext.appointmentId);
    }

    const response = await fetch(`/api/queue/my-status?${queryParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${queuePageContext.session.access_token}`
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
    const waitEstimateMinutes = getResolvedWaitEstimate(queueData);

    renderQueueState(queueState);
    renderQueueMetrics(queueData.queue_entry, queueData.position, queueState);
    renderQueueEstimate(queueState, waitEstimateMinutes);
    renderNearTurnAlert({
      queueState,
      position: queueData.position,
      nearTurn: Boolean(queueData.near_turn),
      nearTurnMessage: queueData.near_turn_message || null
    });

    if (!queueData.is_in_queue) {
      renderQueueEmptyState(QUEUE_EMPTY_STATES.NOT_IN_QUEUE);
      renderJoinQueueAction({
        visible: Boolean(queuePageContext.appointmentId),
        message: queuePageContext.appointmentId
          ? 'Use this when you are ready to check in for the visit.'
          : ''
      });
      return;
    }

    renderJoinQueueAction({ visible: false });
    renderQueueList(queueData.queue_entries || [], queueData.queue_summary || {});
  } catch (error) {
    console.error(error);
    renderQueueState(QUEUE_STATES.UNAVAILABLE);
    renderQueueMetrics(null, null, QUEUE_STATES.UNAVAILABLE);
    renderQueueEstimate(QUEUE_STATES.UNAVAILABLE, null);
    renderNearTurnAlert({
      queueState: QUEUE_STATES.UNAVAILABLE,
      position: null,
      nearTurn: false,
      nearTurnMessage: null
    });
    renderQueueEmptyState(QUEUE_EMPTY_STATES.QUEUE_UNAVAILABLE);
    renderJoinQueueAction({ visible: false });
  }
}

async function loadQueuePage() {
  const params = new URLSearchParams(window.location.search);
  queuePageContext.clinicId = params.get('clinicId') || '';
  queuePageContext.appointmentId = params.get('appointmentId') || '';
  queuePageContext.date = params.get('date') || '';
  queuePageContext.start = params.get('start') || '';
  queuePageContext.end = params.get('end') || '';

  initialiseLogoutButton('logoutButton');
  applyVisitDetails(params);

  const joinQueueButton = document.getElementById('joinQueueButton');
  if (joinQueueButton) {
    joinQueueButton.addEventListener('click', joinQueueForCurrentVisit);
  }

  const session = await requireAuthenticatedUser();
  if (!session) {
    return;
  }

  queuePageContext.session = session;

  // Load the real reminder status and queue status together.
  // This keeps the queue page reminder panel consistent with the appointments page.
  await Promise.all([
    loadQueueAppointmentReminderStatus(),
    loadQueueStatus()
  ]);
}

document.addEventListener('DOMContentLoaded', loadQueuePage);
