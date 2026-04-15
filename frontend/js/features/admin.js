const STAFF_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const MOCK_STAFF_REQUESTS = [
  {
    id: 'req-001',
    fullName: 'Nomsa Dlamini',
    clinic: 'Khayelitsha Community Day Centre',
    staffId: 'WC-10452',
    requestStatus: STAFF_REQUEST_STATUSES.PENDING,
    requestDate: '2026-04-13T08:15:00+02:00'
  },
  {
    id: 'req-002',
    fullName: 'Thabo Mokoena',
    clinic: 'Soweto Clinic 1',
    staffId: 'GP-20817',
    requestStatus: STAFF_REQUEST_STATUSES.PENDING,
    requestDate: '2026-04-14T10:40:00+02:00'
  },
  {
    id: 'req-003',
    fullName: 'Ayesha Patel',
    clinic: 'Chatsworth Community Clinic',
    staffId: 'KZN-33205',
    requestStatus: STAFF_REQUEST_STATUSES.PENDING,
    requestDate: '2026-04-15T07:55:00+02:00'
  }
];

const adminState = {
  requests: MOCK_STAFF_REQUESTS.map((request) => ({ ...request })),
  feedback: null,
  actionInProgressId: null,
  approvedCount: 0,
  rejectedCount: 0
};

function formatRequestDate(dateString) {
  if (!dateString) {
    return 'N/A';
  }

  const date = new Date(dateString);

  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatStatusLabel(status) {
  switch (status) {
    case STAFF_REQUEST_STATUSES.APPROVED:
      return 'Approved';
    case STAFF_REQUEST_STATUSES.REJECTED:
      return 'Rejected';
    case STAFF_REQUEST_STATUSES.PENDING:
    default:
      return 'Pending';
  }
}

function getStatusBadgeClasses(status) {
  switch (status) {
    case STAFF_REQUEST_STATUSES.APPROVED:
      return 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case STAFF_REQUEST_STATUSES.REJECTED:
      return 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    case STAFF_REQUEST_STATUSES.PENDING:
    default:
      return 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]';
  }
}

function setTextContent(elementId, value) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.textContent = value;
}

function renderSummary() {
  const pendingCount = adminState.requests.length;

  setTextContent('pendingRequestCount', String(pendingCount));
  setTextContent('approvedRequestCount', String(adminState.approvedCount));
  setTextContent('rejectedRequestCount', String(adminState.rejectedCount));
  setTextContent(
    'requestTableSummary',
    pendingCount === 0
      ? 'No pending staff verification requests'
      : `${pendingCount} pending staff request${pendingCount === 1 ? '' : 's'} to review`
  );
}

function renderFeedback() {
  const feedback = document.getElementById('adminActionFeedback');

  if (!feedback) {
    return;
  }

  if (!adminState.feedback) {
    feedback.className = 'mt-8 hidden';
    feedback.textContent = '';
    return;
  }

  const typeClasses = {
    loading: 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]',
    success: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
    error: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
  };

  feedback.className = `mt-8 rounded-2xl border px-4 py-3 text-sm font-medium ${typeClasses[adminState.feedback.type] || typeClasses.loading}`;
  feedback.textContent = adminState.feedback.message;
}

function renderEmptyState() {
  const emptyState = document.getElementById('adminEmptyState');
  const requestTable = document.getElementById('adminRequestTable');

  if (!emptyState || !requestTable) {
    return;
  }

  const isEmpty = adminState.requests.length === 0;

  emptyState.classList.toggle('hidden', !isEmpty);
  requestTable.classList.toggle('hidden', isEmpty);
}

function buildActionButtons(request) {
  const isBusy = adminState.actionInProgressId === request.id;

  return `
    <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        data-action="approve"
        data-request-id="${request.id}"
        class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-4 py-2.5 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        ${isBusy ? 'disabled' : ''}
      >
        ${isBusy ? 'Processing...' : 'Approve'}
      </button>
      <button
        type="button"
        data-action="reject"
        data-request-id="${request.id}"
        class="inline-flex items-center justify-center rounded-2xl border border-[#f7768e]/30 bg-[#f7768e]/10 px-4 py-2.5 text-sm font-semibold text-[#f2a7b7] transition hover:bg-[#f7768e]/16 disabled:cursor-not-allowed disabled:opacity-60"
        ${isBusy ? 'disabled' : ''}
      >
        ${isBusy ? 'Please wait...' : 'Reject'}
      </button>
    </div>
  `;
}

function renderRequestList() {
  const requestTableBody = document.getElementById('adminRequestTableBody');

  if (!requestTableBody) {
    return;
  }

  requestTableBody.innerHTML = '';

  adminState.requests.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'grid gap-5 px-5 py-5 md:grid-cols-[1.25fr_1.2fr_0.9fr_0.9fr_0.9fr_1.15fr] md:items-center';

    item.innerHTML = `
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Full name</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${request.fullName}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Clinic</p>
        <p class="text-sm text-[#c0caf5]">${request.clinic}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Staff ID</p>
        <p class="text-sm text-[#c0caf5]">${request.staffId}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Request status</p>
        <p class="inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getStatusBadgeClasses(request.requestStatus)}">
          ${formatStatusLabel(request.requestStatus)}
        </p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Request date</p>
        <p class="text-sm text-[#c0caf5]">${formatRequestDate(request.requestDate)}</p>
      </section>

      <section>
        ${buildActionButtons(request)}
      </section>
    `;

    requestTableBody.appendChild(item);
  });
}

function refreshAdminDashboard() {
  renderSummary();
  renderFeedback();
  renderEmptyState();
  renderRequestList();
}

function shouldSimulateActionError() {
  const params = new URLSearchParams(window.location.search);
  return params.get('simulateActionError') === 'true';
}

function createLoadingMessage(action, fullName) {
  return `${action === STAFF_REQUEST_STATUSES.APPROVED ? 'Approving' : 'Rejecting'} ${fullName}...`;
}

function createSuccessMessage(action, fullName) {
  return `${fullName} was ${action} successfully.`;
}

function createErrorMessage(action, fullName) {
  return `Could not ${action === STAFF_REQUEST_STATUSES.APPROVED ? 'approve' : 'reject'} ${fullName} right now. Please try again.`;
}

async function handleAdminAction(requestId, nextStatus) {
  const request = adminState.requests.find((entry) => entry.id === requestId);

  if (!request || adminState.actionInProgressId) {
    return;
  }

  adminState.actionInProgressId = requestId;
  adminState.feedback = {
    type: 'loading',
    message: createLoadingMessage(nextStatus, request.fullName)
  };
  refreshAdminDashboard();

  await new Promise((resolve) => {
    window.setTimeout(resolve, 700);
  });

  if (shouldSimulateActionError()) {
    adminState.actionInProgressId = null;
    adminState.feedback = {
      type: 'error',
      message: createErrorMessage(nextStatus, request.fullName)
    };
    refreshAdminDashboard();
    return;
  }

  adminState.requests = adminState.requests.filter((entry) => entry.id !== requestId);
  adminState.actionInProgressId = null;

  if (nextStatus === STAFF_REQUEST_STATUSES.APPROVED) {
    adminState.approvedCount += 1;
  } else {
    adminState.rejectedCount += 1;
  }

  adminState.feedback = {
    type: 'success',
    message: createSuccessMessage(nextStatus, request.fullName)
  };
  refreshAdminDashboard();
}

function initialiseAdminActions() {
  const requestTableBody = document.getElementById('adminRequestTableBody');

  if (!requestTableBody) {
    return;
  }

  requestTableBody.addEventListener('click', async function (event) {
    const actionButton = event.target.closest('button[data-action]');

    if (!actionButton) {
      return;
    }

    const { action, requestId } = actionButton.dataset;

    if (action === 'approve') {
      await handleAdminAction(requestId, STAFF_REQUEST_STATUSES.APPROVED);
      return;
    }

    if (action === 'reject') {
      await handleAdminAction(requestId, STAFF_REQUEST_STATUSES.REJECTED);
    }
  });
}

async function initialiseAdminPage() {
  initialiseLogoutButton('logoutButton');
  initialiseLogoutButton('logoutCardButton');

  const session = await requireAuthenticatedUser();

  if (!session) {
    return;
  }

  const userName = session.user?.user_metadata?.full_name || session.user?.email || 'Admin';
  setTextContent('adminName', userName);

  refreshAdminDashboard();
  initialiseAdminActions();
}

document.addEventListener('DOMContentLoaded', initialiseAdminPage);
