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

const STAFF_CLINIC = {
  name: 'Khayelitsha Community Day Centre'
};

const MOCK_QUEUE_ENTRIES = [
  {
    id: 'queue-001',
    queueNumber: 'Q001',
    patientName: 'Anele Jacobs',
    arrivalType: ARRIVAL_TYPES.APPOINTMENT,
    visitType: 'General consultation',
    timeLabel: '08:00',
    status: STAFF_QUEUE_STATUSES.COMPLETE
  },
  {
    id: 'queue-002',
    queueNumber: 'Q002',
    patientName: 'Lerato Maseko',
    arrivalType: ARRIVAL_TYPES.APPOINTMENT,
    visitType: 'Medication collection',
    timeLabel: '08:30',
    status: STAFF_QUEUE_STATUSES.IN_CONSULTATION
  },
  {
    id: 'queue-003',
    queueNumber: 'Q003',
    patientName: 'Themba Ndlovu',
    arrivalType: ARRIVAL_TYPES.APPOINTMENT,
    visitType: 'Follow-up review',
    timeLabel: '09:00',
    status: STAFF_QUEUE_STATUSES.WAITING
  },
  {
    id: 'queue-004',
    queueNumber: 'Q004',
    patientName: 'Nosipho Dlamini',
    arrivalType: ARRIVAL_TYPES.APPOINTMENT,
    visitType: 'Immunisation',
    timeLabel: '09:30',
    status: STAFF_QUEUE_STATUSES.WAITING
  },
  {
    id: 'queue-005',
    queueNumber: 'Q005',
    patientName: 'Sipho Khumalo',
    arrivalType: ARRIVAL_TYPES.WALK_IN,
    visitType: 'General consultation',
    timeLabel: '09:45',
    status: STAFF_QUEUE_STATUSES.WAITING
  }
];

const staffState = {
  queueEntries: MOCK_QUEUE_ENTRIES.map((entry) => ({ ...entry })),
  feedback: null,
  actionInProgressId: null,
  walkInsAdded: 0
};

function setTextContent(elementId, value) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.textContent = value;
}

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

function getTimeSortValue(timeLabel) {
  if (!timeLabel) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [hours, minutes] = timeLabel.split(':').map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (hours * 60) + minutes;
}

function getSortedQueueEntries() {
  return [...staffState.queueEntries].sort((leftEntry, rightEntry) => {
    const timeDifference = getTimeSortValue(leftEntry.timeLabel) - getTimeSortValue(rightEntry.timeLabel);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return leftEntry.queueNumber.localeCompare(rightEntry.queueNumber);
  });
}

function getArrivalTypeClasses(arrivalType) {
  if (arrivalType === ARRIVAL_TYPES.WALK_IN) {
    return 'border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dfcbff]';
  }

  return 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';
}

function getQueueSummaryCounts() {
  return staffState.queueEntries.reduce(
    (counts, entry) => {
      counts.total += 1;

      if (entry.status === STAFF_QUEUE_STATUSES.WAITING) {
        counts.waiting += 1;
      }

      if (entry.status === STAFF_QUEUE_STATUSES.IN_CONSULTATION) {
        counts.inConsultation += 1;
      }

      if (entry.status === STAFF_QUEUE_STATUSES.COMPLETE) {
        counts.complete += 1;
      }

      if (entry.arrivalType === ARRIVAL_TYPES.WALK_IN) {
        counts.walkIns += 1;
      }

      return counts;
    },
    {
      total: 0,
      waiting: 0,
      inConsultation: 0,
      complete: 0,
      walkIns: 0
    }
  );
}

function getNextWaitingEntry() {
  return getSortedQueueEntries().find((entry) => entry.status === STAFF_QUEUE_STATUSES.WAITING) || null;
}

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

function renderClinicSnapshot() {
  const nextWaitingEntry = getNextWaitingEntry();

  setTextContent('staffClinicName', STAFF_CLINIC.name);
  setTextContent('walkInTodayCount', String(staffState.walkInsAdded));

  if (!nextWaitingEntry) {
    setTextContent('nextWaitingPatient', 'No one waiting');
    setTextContent('nextWaitingSummary', 'All current patients have either been completed, cancelled, or are already in consultation.');
    return;
  }

  setTextContent('nextWaitingPatient', `${nextWaitingEntry.patientName} (${nextWaitingEntry.queueNumber})`);
  setTextContent('nextWaitingSummary', `${nextWaitingEntry.visitType} at ${nextWaitingEntry.timeLabel} is next in the waiting queue.`);
}

function renderSummaryCards() {
  const counts = getQueueSummaryCounts();

  setTextContent('queueTotalCount', String(counts.total));
  setTextContent('queueWaitingCount', String(counts.waiting));
  setTextContent('queueInConsultationCount', String(counts.inConsultation));
  setTextContent('queueCompletedCount', String(counts.complete));
  setTextContent('queueWalkInCount', String(counts.walkIns));
  setTextContent(
    'queueManagementSummary',
    counts.total === 0
      ? 'No patients are currently in the queue'
      : `${counts.total} patient${counts.total === 1 ? '' : 's'} currently visible in today's queue`
  );
}

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

function buildStatusOptions(currentStatus) {
  return Object.values(STAFF_QUEUE_STATUSES)
    .map((status) => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${formatStatusLabel(status)}</option>`)
    .join('');
}

function renderQueueTable() {
  const tableBody = document.getElementById('staffQueueTableBody');

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  getSortedQueueEntries().forEach((entry) => {
    const isBusy = staffState.actionInProgressId === entry.id;
    const patientName = escapeHtml(entry.patientName);
    const visitType = escapeHtml(entry.visitType);
    const row = document.createElement('article');

    row.className = 'grid gap-5 px-5 py-5 lg:grid-cols-[0.9fr_1.25fr_0.95fr_0.95fr_0.95fr_1.35fr] lg:items-center';
    row.innerHTML = `
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Queue no.</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${entry.queueNumber}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Patient</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${patientName}</p>
        <p class="text-xs text-[#8b93b8]">${visitType}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Arrival type</p>
        <p class="inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getArrivalTypeClasses(entry.arrivalType)}">
          ${formatArrivalTypeLabel(entry.arrivalType)}
        </p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] lg:hidden">Time</p>
        <p class="text-sm text-[#c0caf5]">${entry.timeLabel}</p>
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

function refreshStaffDashboard() {
  renderFeedback();
  renderClinicSnapshot();
  renderSummaryCards();
  renderEmptyState();
  renderQueueTable();
}

function createStatusChangeMessage(patientName, status) {
  return `${patientName} updated to ${formatStatusLabel(status).toLowerCase()}.`;
}

async function updateQueueEntryStatus(entryId, nextStatus) {
  const entry = staffState.queueEntries.find((item) => item.id === entryId);

  if (!entry || staffState.actionInProgressId) {
    return;
  }

  staffState.actionInProgressId = entryId;
  staffState.feedback = {
    type: 'loading',
    message: `Updating ${entry.patientName} to ${formatStatusLabel(nextStatus).toLowerCase()}...`
  };
  refreshStaffDashboard();

  await new Promise((resolve) => {
    window.setTimeout(resolve, 450);
  });

  entry.status = nextStatus;
  staffState.actionInProgressId = null;
  staffState.feedback = {
    type: 'success',
    message: createStatusChangeMessage(entry.patientName, nextStatus)
  };
  refreshStaffDashboard();
}

function getNextQueueNumber() {
  const highestNumber = staffState.queueEntries.reduce((max, entry) => {
    const numericValue = Number(entry.queueNumber.replace(/\D/g, ''));
    return Number.isNaN(numericValue) ? max : Math.max(max, numericValue);
  }, 0);

  return `Q${String(highestNumber + 1).padStart(3, '0')}`;
}

function hasQueueTimeConflict(timeLabel) {
  return staffState.queueEntries.some((entry) => entry.timeLabel === timeLabel);
}

function addWalkInPatient(patientName, visitType, timeLabel) {
  const newEntry = {
    id: `queue-${Date.now()}`,
    queueNumber: getNextQueueNumber(),
    patientName,
    arrivalType: ARRIVAL_TYPES.WALK_IN,
    visitType,
    timeLabel,
    status: STAFF_QUEUE_STATUSES.WAITING
  };

  staffState.queueEntries.push(newEntry);
  staffState.walkInsAdded += 1;
  staffState.feedback = {
    type: 'success',
    message: `${patientName} added to the queue as walk-in ${newEntry.queueNumber}.`
  };
  renderWalkInFormFeedback('success', `${patientName} was added for ${timeLabel}.`);
  refreshStaffDashboard();
}

function initialiseQueueActions() {
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

    await updateQueueEntryStatus(entryId, statusSelect.value);
  });
}

function initialiseWalkInForm() {
  const form = document.getElementById('walkInForm');
  const patientNameField = document.getElementById('walkInPatientName');
  const timeField = document.getElementById('walkInTime');
  const visitTypeField = document.getElementById('walkInVisitType');

  if (!form || !patientNameField || !timeField || !visitTypeField) {
    return;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const patientName = patientNameField.value.trim();
    const timeLabel = timeField.value;
    const visitType = visitTypeField.value;

    renderWalkInFormFeedback(null, '');

    if (!patientName) {
      renderWalkInFormFeedback('error', 'Enter a patient name before adding a walk-in.');
      patientNameField.focus();
      return;
    }

    if (!timeLabel) {
      renderWalkInFormFeedback('error', 'Select a time before adding a walk-in.');
      timeField.focus();
      return;
    }

    if (hasQueueTimeConflict(timeLabel)) {
      renderWalkInFormFeedback('error', `The ${timeLabel} slot is already in use. Choose a different time for this walk-in.`);
      timeField.focus();
      return;
    }

    addWalkInPatient(patientName, visitType, timeLabel);
    form.reset();
    visitTypeField.value = 'General consultation';
    timeField.value = '';
    patientNameField.focus();
  });
}

async function initialiseStaffPage() {
  initialiseLogoutButton('logoutButton');

  let session = null;

  try {
    session = await getCurrentSession(true);
  } catch (error) {
    console.error('Staff page session check failed:', error);
  }

  const userName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Staff';
  setTextContent('staffName', userName);

  refreshStaffDashboard();
  initialiseQueueActions();
  initialiseWalkInForm();
}

document.addEventListener('DOMContentLoaded', initialiseStaffPage);
