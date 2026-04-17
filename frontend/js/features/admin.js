const STAFF_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const ADMIN_PENDING_REQUESTS_ENDPOINT = '/api/admin/staff-requests/pending';

const adminState = {
  requests: [],
  feedback: null,
  actionInProgressId: null,
  approvedCount: 0,
  rejectedCount: 0,
  isLoading: false,
  loadError: null,
  accessToken: null
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse admin response JSON:', error);
    return {};
  }
}

function getClinicName(rawRequest) {
  if (rawRequest?.clinic?.name) {
    return rawRequest.clinic.name;
  }

  if (Array.isArray(rawRequest?.clinic) && rawRequest.clinic[0]?.name) {
    return rawRequest.clinic[0].name;
  }

  return 'Clinic not available';
}

function normaliseStaffRequest(rawRequest) {
  return {
    id: rawRequest?.id || '',
    fullName: rawRequest?.full_name || 'Unnamed request',
    clinic: getClinicName(rawRequest),
    staffId: rawRequest?.staff_id || 'N/A',
    requestStatus: rawRequest?.status || STAFF_REQUEST_STATUSES.PENDING,
    requestDate: rawRequest?.created_at || ''
  };
}

function createAuthHeaders() {
  return {
    Authorization: `Bearer ${adminState.accessToken}`
  };
}

function renderSummary() {
  const pendingCount = adminState.requests.length;
  let requestSummary = `${pendingCount} pending staff request${pendingCount === 1 ? '' : 's'} to review`;

  if (adminState.isLoading) {
    requestSummary = 'Loading staff requests...';
  } else if (adminState.loadError) {
    requestSummary = 'Unable to load staff requests';
  } else if (pendingCount === 0) {
    requestSummary = 'No pending staff verification requests';
  }

  setTextContent('pendingRequestCount', String(pendingCount));
  setTextContent('approvedRequestCount', String(adminState.approvedCount));
  setTextContent('rejectedRequestCount', String(adminState.rejectedCount));
  setTextContent('requestTableSummary', requestSummary);
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
  const emptyStateTitle = document.getElementById('adminEmptyStateTitle');
  const emptyStateMessage = document.getElementById('adminEmptyStateMessage');

  if (!emptyState || !requestTable || !emptyStateTitle || !emptyStateMessage) {
    return;
  }

  if (adminState.isLoading) {
    emptyState.classList.add('hidden');
    requestTable.classList.remove('hidden');
    return;
  }

  if (adminState.loadError) {
    emptyStateTitle.textContent = 'Unable to load staff requests';
    emptyStateMessage.textContent = adminState.loadError;
    emptyState.classList.remove('hidden');
    requestTable.classList.add('hidden');
    return;
  }

  emptyStateTitle.textContent = 'No pending staff requests right now';
  emptyStateMessage.textContent =
    'Every staff verification request in this admin view has already been handled for this session. Check back later when new requests are submitted.';

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
        data-request-id="${escapeHtml(request.id)}"
        class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-4 py-2.5 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        ${isBusy ? 'disabled' : ''}
      >
        ${isBusy ? 'Processing...' : 'Approve'}
      </button>
      <button
        type="button"
        data-action="reject"
        data-request-id="${escapeHtml(request.id)}"
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
        <p class="text-sm font-semibold text-[#e0e5ff]">${escapeHtml(request.fullName)}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Clinic</p>
        <p class="text-sm text-[#c0caf5]">${escapeHtml(request.clinic)}</p>
      </section>

      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Staff ID</p>
        <p class="text-sm text-[#c0caf5]">${escapeHtml(request.staffId)}</p>
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

function createLoadingMessage(action, fullName) {
  return `${action === STAFF_REQUEST_STATUSES.APPROVED ? 'Approving' : 'Rejecting'} ${fullName}...`;
}

function createSuccessMessage(action, fullName) {
  return `${fullName} was ${action} successfully.`;
}

function buildReviewEndpoint(requestId, nextStatus) {
  const action = nextStatus === STAFF_REQUEST_STATUSES.APPROVED ? 'approve' : 'reject';
  return `/api/admin/staff-requests/${encodeURIComponent(requestId)}/${action}`;
}

async function loadPendingStaffRequests() {
  adminState.isLoading = true;
  adminState.loadError = null;
  adminState.feedback = null;
  refreshAdminDashboard();

  try {
    const response = await fetch(ADMIN_PENDING_REQUESTS_ENDPOINT, {
      headers: createAuthHeaders()
    });
    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (response.status === 403) {
      window.location.href = '/dashboard';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load staff requests.');
    }

    adminState.requests = Array.isArray(payload.data)
      ? payload.data.map(normaliseStaffRequest)
      : [];
    adminState.feedback = null;
  } catch (error) {
    console.error('Failed to load admin staff requests:', error);
    adminState.loadError =
      error.message || 'We could not load staff requests right now.';
    adminState.feedback = {
      type: 'error',
      message: adminState.loadError
    };
  } finally {
    adminState.isLoading = false;
    refreshAdminDashboard();
  }
}

async function handleAdminAction(requestId, nextStatus) {
  const request = adminState.requests.find((entry) => entry.id === requestId);

  if (!request || adminState.actionInProgressId || !adminState.accessToken) {
    return;
  }

  adminState.actionInProgressId = requestId;
  adminState.feedback = {
    type: 'loading',
    message: createLoadingMessage(nextStatus, request.fullName)
  };
  refreshAdminDashboard();

  try {
    const response = await fetch(buildReviewEndpoint(requestId, nextStatus), {
      method: 'PATCH',
      headers: createAuthHeaders()
    });
    const payload = await readJsonSafely(response);

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (response.status === 403) {
      window.location.href = '/dashboard';
      return;
    }

    if (!response.ok) {
      throw new Error(
        payload.message ||
        `Could not ${nextStatus === STAFF_REQUEST_STATUSES.APPROVED ? 'approve' : 'reject'} ${request.fullName} right now. Please try again.`
      );
    }

    adminState.requests = adminState.requests.filter((entry) => entry.id !== requestId);

    if (nextStatus === STAFF_REQUEST_STATUSES.APPROVED) {
      adminState.approvedCount += 1;
    } else {
      adminState.rejectedCount += 1;
    }

    adminState.feedback = {
      type: 'success',
      message: createSuccessMessage(nextStatus, request.fullName)
    };
  } catch (error) {
    console.error('Admin review action failed:', error);
    adminState.feedback = {
      type: 'error',
      message:
        error.message ||
        `Could not ${nextStatus === STAFF_REQUEST_STATUSES.APPROVED ? 'approve' : 'reject'} ${request.fullName} right now. Please try again.`
    };
  } finally {
    adminState.actionInProgressId = null;
    refreshAdminDashboard();
  }
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

  try {
    const profile = await getCurrentUserProfile(session);

    if (!profile) {
      window.location.href = '/dashboard';
      return;
    }

    if (profile.role !== 'admin') {
      window.location.href = getHomeRouteForRole(profile.role);
      return;
    }
  } catch (error) {
    console.error('Admin role check failed:', error);
    window.location.href = '/dashboard';
    return;
  }

  const userName = session.user?.user_metadata?.full_name || session.user?.email || 'Admin';
  adminState.accessToken = session.access_token;

  setTextContent('adminName', userName);
  initialiseAdminActions();
  await loadPendingStaffRequests();
}

document.addEventListener('DOMContentLoaded', initialiseAdminPage);
