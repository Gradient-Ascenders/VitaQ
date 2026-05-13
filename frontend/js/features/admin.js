// Admin dashboard behaviour for staff request review and clinic management.
// One shared page state keeps the existing admin workflow and the new Sprint 3 clinic form in sync.
const STAFF_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const ADMIN_PENDING_REQUESTS_ENDPOINT = '/api/admin/staff-requests/pending';
const ADMIN_CLINICS_ENDPOINT = '/api/admin/clinics';
const ADMIN_WAIT_TIME_ANALYTICS_ENDPOINT = '/api/admin/analytics/wait-times';
const ADMIN_NO_SHOW_ANALYTICS_ENDPOINT = '/api/admin/analytics/no-shows';
const ADMIN_TABS = {
  DASHBOARD: 'dashboard',
  CLINIC_MANAGEMENT: 'clinic-management',
  ANALYTICS_REPORTS: 'analytics-reports'
};
const DEFAULT_ADMIN_TAB = ADMIN_TABS.DASHBOARD;
const CLINIC_FORM_FIELD_IDS = {
  name: 'clinicNameInput',
  province: 'clinicProvinceInput',
  district: 'clinicDistrictInput',
  area: 'clinicAreaInput',
  municipality: 'clinicMunicipalityInput',
  region: 'clinicRegionInput',
  facility_type: 'clinicFacilityTypeInput',
  services_offered: 'clinicServicesInput',
  contact_website: 'clinicWebsiteInput'
};
const CLINIC_LOCATION_FIELD_ORDER = ['province', 'district', 'area', 'municipality', 'region'];
const CLINIC_DROPDOWN_PLACEHOLDERS = {
  province: 'Select province',
  district: 'Select district',
  area: 'Select area',
  municipality: 'Select municipality',
  region: 'Select region',
  facility_type: 'Select facility type'
};

const adminState = {
  requests: [],
  feedback: null,
  actionInProgressId: null,
  approvedCount: 0,
  rejectedCount: 0,
  isLoading: false,
  loadError: null,
  accessToken: null,
  clinics: [],
  selectedClinicId: '',
  selectedClinic: null,
  clinicFeedback: null,
  isClinicListLoading: false,
  clinicListError: null,
  isClinicDetailLoading: false,
  clinicDetailError: null,
  isClinicSaveLoading: false,
  clinicDetailRequestToken: 0,
  activeAdminTab: DEFAULT_ADMIN_TAB,
  analyticsFilters: {
    clinicId: '',
    startDate: '',
    endDate: '',
    hour: ''
  },
  waitTimeAnalytics: null,
  noShowAnalytics: null,
  isAnalyticsLoading: false,
  analyticsError: null,
  analyticsLoadedAt: null,
  analyticsRequestToken: 0
};
const ADMIN_TAB_ACTIVE_CLASSES = [
  'border-[#7aa2f7]/30',
  'bg-[#7aa2f7]/12',
  'text-[#c0caf5]'
];
const ADMIN_TAB_INACTIVE_CLASSES = [
  'border-[#414868]',
  'bg-[#24283b]/80',
  'text-[#a9b1d6]',
  'hover:border-[#7aa2f7]/40',
  'hover:bg-[#2a2f45]',
  'hover:text-[#c0caf5]'
];

function isValidAdminTab(tabId) {
  return Object.values(ADMIN_TABS).includes(tabId);
}

function getAdminTabElements() {
  return {
    triggers: Array.from(document.querySelectorAll('[data-admin-tab-trigger]')),
    panels: Array.from(document.querySelectorAll('[data-admin-tab-panel]'))
  };
}

function getAdminTabFromHash(hashValue = window.location.hash) {
  const tabId = String(hashValue || '').replace(/^#/, '');
  return isValidAdminTab(tabId) ? tabId : DEFAULT_ADMIN_TAB;
}

function updateAdminTabHash(tabId) {
  const nextHash = `#${tabId}`;

  if (window.location.hash === nextHash) {
    return;
  }

  window.location.hash = tabId;
}

function renderAdminTabs() {
  const { triggers, panels } = getAdminTabElements();

  triggers.forEach((trigger) => {
    const isActive = trigger.dataset.adminTabTrigger === adminState.activeAdminTab;

    trigger.classList.remove(...ADMIN_TAB_ACTIVE_CLASSES, ...ADMIN_TAB_INACTIVE_CLASSES);
    trigger.classList.add(...(isActive ? ADMIN_TAB_ACTIVE_CLASSES : ADMIN_TAB_INACTIVE_CLASSES));
    trigger.setAttribute('aria-selected', isActive ? 'true' : 'false');
    trigger.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.adminTabPanel === adminState.activeAdminTab;

    panel.classList.toggle('hidden', !isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

function setActiveAdminTab(tabId, options = {}) {
  const { updateHash = false } = options;
  const nextTabId = isValidAdminTab(tabId) ? tabId : DEFAULT_ADMIN_TAB;

  adminState.activeAdminTab = nextTabId;
  renderAdminTabs();

  if (updateHash) {
    updateAdminTabHash(nextTabId);
  }
}

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

function formatDateTime(dateString) {
  if (!dateString) {
    return 'N/A';
  }

  const date = new Date(dateString);

  return date.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatAnalyticsRefreshTime(date) {
  if (!date) {
    return 'No refresh yet.';
  }

  return `Last refreshed ${date.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatAnalyticsMinutes(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '0 min';
  }

  return `${Math.round(numberValue)} min`;
}

function formatAnalyticsNumber(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '0';
  }

  return new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: 0
  }).format(numberValue);
}

function formatAnalyticsPercent(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '0%';
  }

  return `${numberValue.toFixed(1)}%`;
}

function formatAnalyticsHour(hour) {
  const numberValue = Number(hour);

  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 23) {
    return 'Unknown hour';
  }

  return `${String(numberValue).padStart(2, '0')}:00`;
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

function normalizeClinicSummary(rawClinic) {
  return {
    id: rawClinic?.id || '',
    name: rawClinic?.name || 'Unnamed clinic',
    province: rawClinic?.province || '',
    district: rawClinic?.district || '',
    area: rawClinic?.area || '',
    municipality: rawClinic?.municipality || '',
    region: rawClinic?.region || '',
    facility_type: rawClinic?.facility_type || '',
    is_active: rawClinic?.is_active ?? true,
    updated_at: rawClinic?.updated_at || null
  };
}

function normalizeClinicDetail(rawClinic) {
  return {
    id: rawClinic?.id || '',
    name: rawClinic?.name || '',
    province: rawClinic?.province || '',
    district: rawClinic?.district || '',
    area: rawClinic?.area || '',
    municipality: rawClinic?.municipality || '',
    region: rawClinic?.region || '',
    facility_type: rawClinic?.facility_type || '',
    services_offered: rawClinic?.services_offered || '',
    latitude: rawClinic?.latitude ?? null,
    longitude: rawClinic?.longitude ?? null,
    contact_website: rawClinic?.contact_website || '',
    is_active: rawClinic?.is_active ?? true,
    source_dataset: rawClinic?.source_dataset || '',
    source_record_id: rawClinic?.source_record_id || '',
    source_last_updated: rawClinic?.source_last_updated || null,
    created_at: rawClinic?.created_at || null,
    updated_at: rawClinic?.updated_at || null
  };
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

function createAuthHeaders(extraHeaders = {}) {
  return {
    Authorization: `Bearer ${adminState.accessToken}`,
    ...extraHeaders
  };
}

function buildAdminClinicEndpoint(clinicId = '') {
  if (!clinicId) {
    return ADMIN_CLINICS_ENDPOINT;
  }

  return `${ADMIN_CLINICS_ENDPOINT}/${encodeURIComponent(clinicId)}`;
}

function buildAnalyticsEndpoint(baseEndpoint, filters = {}, options = {}) {
  const params = new URLSearchParams();
  const includeHour = options.includeHour === true;

  if (filters.clinicId) {
    params.set('clinicId', filters.clinicId);
  }

  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }

  if (includeHour && filters.hour !== '') {
    params.set('hour', filters.hour);
  }

  const queryString = params.toString();

  return queryString ? `${baseEndpoint}?${queryString}` : baseEndpoint;
}

function getAnalyticsCardQueueCount(waitTimeAnalytics = {}) {
  return (
    waitTimeAnalytics.activeQueueCount ??
    waitTimeAnalytics.totalActiveQueues ??
    waitTimeAnalytics.activeQueues ??
    waitTimeAnalytics.completedQueueCount ??
    0
  );
}

function cleanClinicFieldValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isClinicDropdownField(fieldName) {
  return Object.prototype.hasOwnProperty.call(CLINIC_DROPDOWN_PLACEHOLDERS, fieldName);
}

function getDistinctSortedClinicValues(values) {
  return [...new Set(values.map(cleanClinicFieldValue).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function getClinicDropdownSelections(preferredSelections = null) {
  const { fields } = getClinicFormElements();
  const selections = {};

  Object.keys(CLINIC_DROPDOWN_PLACEHOLDERS).forEach((fieldName) => {
    const preferredValue = preferredSelections?.[fieldName];
    selections[fieldName] = cleanClinicFieldValue(
      preferredValue !== undefined ? preferredValue : fields[fieldName]?.value
    );
  });

  return selections;
}

function getClinicsMatchingDropdownParents(fieldName, selections) {
  if (fieldName === 'facility_type') {
    return adminState.clinics;
  }

  const fieldIndex = CLINIC_LOCATION_FIELD_ORDER.indexOf(fieldName);

  if (fieldIndex === -1) {
    return adminState.clinics;
  }

  return adminState.clinics.filter((clinic) =>
    CLINIC_LOCATION_FIELD_ORDER.slice(0, fieldIndex).every((parentFieldName) => {
      const selectedParentValue = cleanClinicFieldValue(selections[parentFieldName]);

      if (!selectedParentValue) {
        return true;
      }

      return cleanClinicFieldValue(clinic?.[parentFieldName]) === selectedParentValue;
    })
  );
}

function buildClinicDropdownOptions(fieldName, selections) {
  return getDistinctSortedClinicValues(
    getClinicsMatchingDropdownParents(fieldName, selections).map((clinic) => clinic?.[fieldName])
  );
}

function populateClinicDropdown(fieldName, options, selectedValue) {
  const { fields } = getClinicFormElements();
  const field = fields[fieldName];

  if (!field) {
    return '';
  }

  const nextValue = cleanClinicFieldValue(selectedValue);

  field.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = CLINIC_DROPDOWN_PLACEHOLDERS[fieldName];
  field.appendChild(placeholderOption);

  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    field.appendChild(option);
  });

  field.value = nextValue && options.includes(nextValue) ? nextValue : '';
  return field.value;
}

// Rebuild child option lists whenever location selections change so invalid combinations disappear.
function renderClinicDropdownOptions(preferredSelections = null) {
  const resolvedSelections = getClinicDropdownSelections(preferredSelections);

  CLINIC_LOCATION_FIELD_ORDER.forEach((fieldName) => {
    const options = buildClinicDropdownOptions(fieldName, resolvedSelections);
    resolvedSelections[fieldName] = populateClinicDropdown(
      fieldName,
      options,
      resolvedSelections[fieldName]
    );
  });

  resolvedSelections.facility_type = populateClinicDropdown(
    'facility_type',
    getDistinctSortedClinicValues(adminState.clinics.map((clinic) => clinic?.facility_type)),
    resolvedSelections.facility_type
  );

  return resolvedSelections;
}

function redirectForAdminApiResponseStatus(status) {
  if (status === 401) {
    window.location.href = '/login';
    return true;
  }

  if (status === 403) {
    window.location.href = '/dashboard';
    return true;
  }

  return false;
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

function getClinicFormElements() {
  const fields = {};

  Object.entries(CLINIC_FORM_FIELD_IDS).forEach(([fieldName, elementId]) => {
    fields[fieldName] = document.getElementById(elementId);
  });

  return {
    form: document.getElementById('adminClinicForm'),
    select: document.getElementById('adminClinicSelect'),
    selectHelp: document.getElementById('adminClinicSelectHelp'),
    saveButton: document.getElementById('adminClinicSaveButton'),
    feedback: document.getElementById('clinicFormFeedback'),
    content: document.getElementById('adminClinicManagementContent'),
    emptyState: document.getElementById('adminClinicEmptyState'),
    emptyStateTitle: document.getElementById('adminClinicEmptyStateTitle'),
    emptyStateMessage: document.getElementById('adminClinicEmptyStateMessage'),
    selectedClinicName: document.getElementById('selectedClinicName'),
    selectedClinicStatus: document.getElementById('selectedClinicStatus'),
    clinicFormMeta: document.getElementById('clinicFormMeta'),
    summary: document.getElementById('clinicManagementSummary'),
    selectionSummary: document.getElementById('clinicSelectionSummary'),
    fields
  };
}

function buildClinicOptionLabel(clinic) {
  const locationParts = [
    clinic?.province,
    clinic?.district || clinic?.municipality
  ].filter(Boolean);
  const locationLabel = locationParts.length > 0 ? ` • ${locationParts.join(' / ')}` : '';
  const statusLabel = clinic?.is_active === false ? ' • Inactive' : '';

  return `${clinic?.name || 'Unnamed clinic'}${locationLabel}${statusLabel}`;
}

function getClinicStatusLabel(clinic) {
  if (!clinic) {
    return 'No clinic selected';
  }

  return clinic.is_active === false ? 'Inactive from public search' : 'Active in public search';
}

function setClinicFormValues(clinic) {
  const { fields } = getClinicFormElements();

  renderClinicDropdownOptions(clinic);

  Object.keys(CLINIC_FORM_FIELD_IDS).forEach((fieldName) => {
    const element = fields[fieldName];

    if (!element) {
      return;
    }

    if (isClinicDropdownField(fieldName)) {
      element.value = cleanClinicFieldValue(clinic?.[fieldName]);
      return;
    }

    element.value = clinic?.[fieldName] || '';
  });
}

function resetClinicFormValues() {
  setClinicFormValues({
    name: '',
    province: '',
    district: '',
    area: '',
    municipality: '',
    region: '',
    facility_type: '',
    services_offered: '',
    contact_website: ''
  });
}

function getClinicFormPayload() {
  const { fields } = getClinicFormElements();

  return {
    name: fields.name?.value || '',
    province: fields.province?.value || '',
    district: fields.district?.value || '',
    area: fields.area?.value || '',
    municipality: fields.municipality?.value || '',
    region: fields.region?.value || '',
    facility_type: fields.facility_type?.value || '',
    services_offered: fields.services_offered?.value || '',
    contact_website: fields.contact_website?.value || ''
  };
}

function renderClinicFeedback() {
  const { feedback } = getClinicFormElements();

  if (!feedback) {
    return;
  }

  if (!adminState.clinicFeedback) {
    feedback.className = 'mt-8 hidden';
    feedback.textContent = '';
    return;
  }

  const typeClasses = {
    loading: 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]',
    success: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
    error: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
  };

  feedback.className = `mt-8 rounded-2xl border px-4 py-3 text-sm font-medium ${typeClasses[adminState.clinicFeedback.type] || typeClasses.loading}`;
  feedback.textContent = adminState.clinicFeedback.message;
}

function renderClinicSummary() {
  const clinicCount = adminState.clinics.length;
  let summaryMessage = `${clinicCount} clinic record${clinicCount === 1 ? '' : 's'} available for management`;
  let selectionMessage = 'Select a clinic to begin editing.';

  if (adminState.isClinicListLoading) {
    summaryMessage = 'Loading clinics...';
  } else if (adminState.clinicListError) {
    summaryMessage = 'Unable to load clinics';
  } else if (clinicCount === 0) {
    summaryMessage = 'No clinics available for management';
  }

  if (adminState.isClinicDetailLoading) {
    selectionMessage = 'Loading clinic details...';
  } else if (adminState.clinicDetailError) {
    selectionMessage = adminState.clinicDetailError;
  } else if (adminState.selectedClinic) {
    selectionMessage = `Editing ${adminState.selectedClinic.name || 'selected clinic'} • Last updated ${formatDateTime(adminState.selectedClinic.updated_at)}`;
  }

  setTextContent('clinicManagementSummary', summaryMessage);
  setTextContent('clinicSelectionSummary', selectionMessage);
}

function renderClinicEmptyState() {
  const {
    content,
    emptyState,
    emptyStateTitle,
    emptyStateMessage
  } = getClinicFormElements();

  if (!content || !emptyState || !emptyStateTitle || !emptyStateMessage) {
    return;
  }

  if (adminState.isClinicListLoading) {
    content.classList.remove('hidden');
    emptyState.classList.add('hidden');
    return;
  }

  if (adminState.clinicListError) {
    emptyStateTitle.textContent = 'Unable to load clinic records';
    emptyStateMessage.textContent = adminState.clinicListError;
    content.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  if (adminState.clinics.length === 0) {
    emptyStateTitle.textContent = 'No clinics are available for management';
    emptyStateMessage.textContent =
      'Clinic records will appear here once the admin clinic directory has data available.';
    content.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  content.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

function renderClinicSelector() {
  const { select, selectHelp } = getClinicFormElements();

  if (!select || !selectHelp) {
    return;
  }

  const disableSelector =
    adminState.isClinicListLoading ||
    adminState.clinics.length === 0 ||
    adminState.isClinicDetailLoading ||
    adminState.isClinicSaveLoading;

  select.disabled = disableSelector;
  select.innerHTML = '';

  if (adminState.isClinicListLoading) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Loading clinics...';
    select.appendChild(option);
    selectHelp.textContent = 'The clinic list is being loaded for this admin session.';
    return;
  }

  if (adminState.clinicListError) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Unable to load clinics';
    select.appendChild(option);
    selectHelp.textContent = adminState.clinicListError;
    return;
  }

  if (adminState.clinics.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No clinics available';
    select.appendChild(option);
    selectHelp.textContent = 'No clinic records are currently available for admin editing.';
    return;
  }

  adminState.clinics.forEach((clinic) => {
    const option = document.createElement('option');
    option.value = clinic.id;
    option.textContent = buildClinicOptionLabel(clinic);
    select.appendChild(option);
  });

  select.value = adminState.selectedClinicId || adminState.clinics[0].id;
  selectHelp.textContent = 'Select a clinic to load its current directory details into the form.';
}

function renderClinicSelectionCards() {
  const {
    selectedClinicName,
    selectedClinicStatus,
    clinicFormMeta
  } = getClinicFormElements();
  const selectedClinic =
    adminState.selectedClinic ||
    adminState.clinics.find((clinic) => clinic.id === adminState.selectedClinicId) ||
    null;

  if (selectedClinicName) {
    selectedClinicName.textContent = selectedClinic?.name || '-';
  }

  if (selectedClinicStatus) {
    selectedClinicStatus.textContent = getClinicStatusLabel(selectedClinic);
  }

  if (clinicFormMeta) {
    if (adminState.isClinicDetailLoading) {
      clinicFormMeta.textContent = 'Loading selected clinic details...';
    } else if (adminState.isClinicSaveLoading) {
      clinicFormMeta.textContent = 'Saving clinic updates...';
    } else if (adminState.selectedClinic) {
      clinicFormMeta.textContent = `Last updated ${formatDateTime(adminState.selectedClinic.updated_at)}`;
    } else if (adminState.clinicDetailError) {
      clinicFormMeta.textContent = adminState.clinicDetailError;
    } else {
      clinicFormMeta.textContent = 'Select a clinic to begin editing.';
    }
  }
}

function renderClinicFormState() {
  const { fields, saveButton } = getClinicFormElements();
  const canEdit =
    Boolean(adminState.selectedClinic) &&
    !adminState.isClinicDetailLoading &&
    !adminState.isClinicSaveLoading &&
    !adminState.clinicListError;

  Object.values(fields).forEach((field) => {
    if (field) {
      field.disabled = !canEdit;
    }
  });

  if (saveButton) {
    saveButton.disabled = !canEdit;
    saveButton.textContent = adminState.isClinicSaveLoading ? 'Saving...' : 'Save clinic updates';
  }

  // Keep in-progress edits visible while the save request is running.
  if (adminState.selectedClinic && !adminState.isClinicSaveLoading) {
    setClinicFormValues(adminState.selectedClinic);
    return;
  }

  if (adminState.isClinicDetailLoading || adminState.clinicDetailError || adminState.clinics.length === 0) {
    resetClinicFormValues();
  }
}

function refreshClinicManagement() {
  renderClinicFeedback();
  renderClinicSummary();
  renderClinicEmptyState();
  renderClinicSelector();
  renderClinicSelectionCards();
  renderClinicFormState();
}

function getAnalyticsElements() {
  return {
    form: document.getElementById('analyticsFilterForm'),
    clinicSelect: document.getElementById('analyticsClinicSelect'),
    startDateInput: document.getElementById('analyticsStartDateInput'),
    endDateInput: document.getElementById('analyticsEndDateInput'),
    hourSelect: document.getElementById('analyticsHourSelect'),
    refreshButton: document.getElementById('analyticsRefreshButton'),
    feedback: document.getElementById('analyticsFeedback'),
    summaryText: document.getElementById('analyticsSummaryText'),
    lastUpdated: document.getElementById('analyticsLastUpdated'),
    averageWait: document.getElementById('analyticsAverageWait'),
    activeQueues: document.getElementById('analyticsActiveQueues'),
    activeQueuesMeta: document.getElementById('analyticsActiveQueuesMeta'),
    averageConsultation: document.getElementById('analyticsAverageConsultation'),
    clinicTableBody: document.getElementById('analyticsClinicTableBody'),
    hourBars: document.getElementById('analyticsHourBars'),
    noShowSummary: document.getElementById('analyticsNoShowSummary'),
    noShowRate: document.getElementById('analyticsNoShowRate'),
    noShowCount: document.getElementById('analyticsNoShowCount'),
    totalAppointments: document.getElementById('analyticsTotalAppointments'),
    noShowClinicTableBody: document.getElementById('analyticsNoShowClinicTableBody'),
    noShowTrendBars: document.getElementById('analyticsNoShowTrendBars'),
    emptyState: document.getElementById('analyticsEmptyState')
  };
}

function renderAnalyticsFeedback() {
  const { feedback } = getAnalyticsElements();

  if (!feedback) {
    return;
  }

  if (!adminState.analyticsError && !adminState.isAnalyticsLoading) {
    feedback.className = 'mt-8 hidden';
    feedback.textContent = '';
    return;
  }

  const isError = Boolean(adminState.analyticsError);
  feedback.className = `mt-8 rounded-2xl border px-4 py-3 text-sm font-medium ${
    isError
      ? 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]'
      : 'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]'
  }`;
  feedback.textContent = isError ? adminState.analyticsError : 'Loading analytics...';
}

function renderAnalyticsFilters() {
  const {
    clinicSelect,
    startDateInput,
    endDateInput,
    hourSelect,
    refreshButton
  } = getAnalyticsElements();

  if (clinicSelect) {
    const selectedClinicId = adminState.analyticsFilters.clinicId;
    const isDisabled = adminState.isClinicListLoading || adminState.isAnalyticsLoading;

    clinicSelect.disabled = isDisabled;
    clinicSelect.innerHTML = '';

    const allClinicsOption = document.createElement('option');
    allClinicsOption.value = '';
    allClinicsOption.textContent = adminState.isClinicListLoading ? 'Loading clinics...' : 'All clinics';
    clinicSelect.appendChild(allClinicsOption);

    adminState.clinics.forEach((clinic) => {
      const option = document.createElement('option');
      option.value = clinic.id;
      option.textContent = buildClinicOptionLabel(clinic);
      clinicSelect.appendChild(option);
    });

    clinicSelect.value = adminState.clinics.some((clinic) => clinic.id === selectedClinicId)
      ? selectedClinicId
      : '';
  }

  if (startDateInput) {
    startDateInput.disabled = adminState.isAnalyticsLoading;
    startDateInput.value = adminState.analyticsFilters.startDate;
  }

  if (endDateInput) {
    endDateInput.disabled = adminState.isAnalyticsLoading;
    endDateInput.value = adminState.analyticsFilters.endDate;
  }

  if (hourSelect) {
    const selectedHour = adminState.analyticsFilters.hour;

    hourSelect.disabled = adminState.isAnalyticsLoading;
    hourSelect.innerHTML = '<option value="">All hours</option>';

    for (let hour = 0; hour < 24; hour += 1) {
      const option = document.createElement('option');
      option.value = String(hour);
      option.textContent = formatAnalyticsHour(hour);
      hourSelect.appendChild(option);
    }

    hourSelect.value = selectedHour;
  }

  if (refreshButton) {
    refreshButton.disabled = adminState.isAnalyticsLoading;
    refreshButton.textContent = adminState.isAnalyticsLoading ? 'Loading...' : 'Apply filters';
  }
}

function renderAnalyticsSummary() {
  const {
    summaryText,
    lastUpdated,
    averageWait,
    activeQueues,
    activeQueuesMeta,
    averageConsultation
  } = getAnalyticsElements();
  const waitTimeAnalytics = adminState.waitTimeAnalytics || {};
  const noShowAnalytics = adminState.noShowAnalytics || {};
  const completedQueueCount = Number(waitTimeAnalytics.completedQueueCount || 0);
  const activeQueueCount = getAnalyticsCardQueueCount(waitTimeAnalytics);

  if (summaryText) {
    if (adminState.isAnalyticsLoading) {
      summaryText.textContent = 'Loading analytics...';
    } else if (adminState.analyticsError) {
      summaryText.textContent = 'Unable to load analytics';
    } else {
      const noShowRate = Number(noShowAnalytics.noShowRate || 0);
      summaryText.textContent = `${formatAnalyticsNumber(completedQueueCount)} completed queue record${completedQueueCount === 1 ? '' : 's'} · ${formatAnalyticsPercent(noShowRate)} no-show rate`;
    }
  }

  if (lastUpdated) {
    lastUpdated.textContent = formatAnalyticsRefreshTime(adminState.analyticsLoadedAt);
  }

  if (averageWait) {
    averageWait.textContent = formatAnalyticsMinutes(waitTimeAnalytics.averageWaitMinutes);
  }

  if (activeQueues) {
    activeQueues.textContent = formatAnalyticsNumber(activeQueueCount);
  }

  if (activeQueuesMeta) {
    activeQueuesMeta.textContent =
      waitTimeAnalytics.activeQueueCount === undefined &&
      waitTimeAnalytics.totalActiveQueues === undefined &&
      waitTimeAnalytics.activeQueues === undefined
        ? 'Filtered queue total from current analytics data.'
        : 'Active queue entries matching the selected filters.';
  }

  if (averageConsultation) {
    averageConsultation.textContent = formatAnalyticsMinutes(
      waitTimeAnalytics.averageConsultationMinutes
    );
  }
}

function renderNoShowSummaryCards() {
  const {
    noShowSummary,
    noShowRate,
    noShowCount,
    totalAppointments
  } = getAnalyticsElements();
  const noShowAnalytics = adminState.noShowAnalytics || {};
  const noShowRateValue = Number(noShowAnalytics.noShowRate || 0);
  const noShowCountValue = Number(noShowAnalytics.noShowCount || 0);
  const totalAppointmentsValue = Number(noShowAnalytics.totalAppointments || 0);
  const attendedQueueCount = Number(noShowAnalytics.attendedQueueCount || 0);

  if (noShowSummary) {
    if (adminState.isAnalyticsLoading) {
      noShowSummary.textContent = 'Loading no-show analytics...';
    } else if (adminState.analyticsError) {
      noShowSummary.textContent = 'Unable to load no-show analytics.';
    } else {
      noShowSummary.textContent = `${formatAnalyticsNumber(attendedQueueCount)} attended · ${formatAnalyticsNumber(noShowCountValue)} no-show${noShowCountValue === 1 ? '' : 's'}`;
    }
  }

  if (noShowRate) {
    noShowRate.textContent = formatAnalyticsPercent(noShowRateValue);
  }

  if (noShowCount) {
    noShowCount.textContent = formatAnalyticsNumber(noShowCountValue);
  }

  if (totalAppointments) {
    totalAppointments.textContent = formatAnalyticsNumber(totalAppointmentsValue);
  }
}

function renderAnalyticsClinicRows() {
  const { clinicTableBody } = getAnalyticsElements();
  const waitTimeAnalytics = adminState.waitTimeAnalytics || {};
  const rows = Array.isArray(waitTimeAnalytics.byClinic) ? waitTimeAnalytics.byClinic : [];

  if (!clinicTableBody) {
    return;
  }

  if (adminState.isAnalyticsLoading) {
    clinicTableBody.innerHTML = `
      <article class="px-5 py-6 text-sm text-[#a9b1d6]">Loading clinic analytics...</article>
    `;
    return;
  }

  if (rows.length === 0) {
    clinicTableBody.innerHTML = `
      <article class="px-5 py-6 text-sm text-[#a9b1d6]">No clinic rows match the selected filters.</article>
    `;
    return;
  }

  clinicTableBody.innerHTML = rows.map((row) => `
    <article class="grid gap-4 px-5 py-5 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] md:items-center">
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Clinic</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${escapeHtml(row.clinicName || 'Unknown clinic')}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Wait</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsMinutes(row.averageWaitMinutes)}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Consultation</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsMinutes(row.averageConsultationMinutes)}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Queues</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsNumber(row.completedQueueCount)}</p>
      </section>
    </article>
  `).join('');
}

function renderAnalyticsHourBars() {
  const { hourBars } = getAnalyticsElements();
  const waitTimeAnalytics = adminState.waitTimeAnalytics || {};
  const rows = Array.isArray(waitTimeAnalytics.byHour) ? waitTimeAnalytics.byHour : [];
  const maxWaitMinutes = rows.reduce((maxValue, row) => {
    const waitMinutes = Number(row.averageWaitMinutes || 0);
    return waitMinutes > maxValue ? waitMinutes : maxValue;
  }, 0);

  if (!hourBars) {
    return;
  }

  if (adminState.isAnalyticsLoading) {
    hourBars.innerHTML = '<p class="text-sm text-[#a9b1d6]">Loading hourly analytics...</p>';
    return;
  }

  if (rows.length === 0) {
    hourBars.innerHTML = '<p class="text-sm text-[#a9b1d6]">No hourly rows match the selected filters.</p>';
    return;
  }

  hourBars.innerHTML = rows.map((row) => {
    const waitMinutes = Number(row.averageWaitMinutes || 0);
    const barWidth = maxWaitMinutes > 0 ? Math.max((waitMinutes / maxWaitMinutes) * 100, 8) : 8;

    return `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-4 text-sm">
          <span class="font-semibold text-[#e0e5ff]">${formatAnalyticsHour(row.hour)}</span>
          <span class="text-[#a9b1d6]">${formatAnalyticsMinutes(waitMinutes)}</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-[#16161e]">
          <div class="h-full rounded-full bg-gradient-to-r from-[#7dcfff] to-[#7aa2f7]" style="width: ${barWidth}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderNoShowClinicRows() {
  const { noShowClinicTableBody } = getAnalyticsElements();
  const noShowAnalytics = adminState.noShowAnalytics || {};
  const rows = Array.isArray(noShowAnalytics.byClinic) ? noShowAnalytics.byClinic : [];

  if (!noShowClinicTableBody) {
    return;
  }

  if (adminState.isAnalyticsLoading) {
    noShowClinicTableBody.innerHTML = `
      <article class="px-5 py-6 text-sm text-[#a9b1d6]">Loading no-show clinic comparisons...</article>
    `;
    return;
  }

  if (rows.length === 0) {
    noShowClinicTableBody.innerHTML = `
      <article class="px-5 py-6 text-sm text-[#a9b1d6]">No no-show rows match the selected filters.</article>
    `;
    return;
  }

  noShowClinicTableBody.innerHTML = rows.map((row) => `
    <article class="grid gap-4 px-5 py-5 md:grid-cols-[1.3fr_0.75fr_0.75fr_0.75fr] md:items-center">
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Clinic</p>
        <p class="text-sm font-semibold text-[#e0e5ff]">${escapeHtml(row.clinicName || 'Unknown clinic')}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Rate</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsPercent(row.noShowRate)}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">No-shows</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsNumber(row.noShowCount)}</p>
      </section>
      <section class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b93b8] md:hidden">Total</p>
        <p class="text-sm text-[#c0caf5]">${formatAnalyticsNumber(row.totalAppointments)}</p>
      </section>
    </article>
  `).join('');
}

function renderNoShowTrendBars() {
  const { noShowTrendBars } = getAnalyticsElements();
  const noShowAnalytics = adminState.noShowAnalytics || {};
  const rows = Array.isArray(noShowAnalytics.byDate) ? noShowAnalytics.byDate : [];
  const maxNoShowCount = rows.reduce((maxValue, row) => {
    const noShowCount = Number(row.noShowCount || 0);
    return noShowCount > maxValue ? noShowCount : maxValue;
  }, 0);

  if (!noShowTrendBars) {
    return;
  }

  if (adminState.isAnalyticsLoading) {
    noShowTrendBars.innerHTML = '<p class="text-sm text-[#a9b1d6]">Loading no-show trends...</p>';
    return;
  }

  if (rows.length === 0) {
    noShowTrendBars.innerHTML = '<p class="text-sm text-[#a9b1d6]">No trend rows match the selected filters.</p>';
    return;
  }

  noShowTrendBars.innerHTML = rows.map((row) => {
    const noShowCount = Number(row.noShowCount || 0);
    const barWidth =
      noShowCount > 0 && maxNoShowCount > 0
        ? Math.max((noShowCount / maxNoShowCount) * 100, 8)
        : 0;

    return `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-4 text-sm">
          <span class="font-semibold text-[#e0e5ff]">${escapeHtml(row.date || 'Unknown date')}</span>
          <span class="text-[#a9b1d6]">${formatAnalyticsPercent(row.noShowRate)} · ${formatAnalyticsNumber(noShowCount)} missed</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-[#16161e]">
          <div class="h-full rounded-full bg-gradient-to-r from-[#f7768e] to-[#bb9af7]" style="width: ${barWidth}%"></div>
        </div>
        <p class="text-xs text-[#8b93b8]">${formatAnalyticsNumber(row.totalAppointments)} tracked appointment${Number(row.totalAppointments || 0) === 1 ? '' : 's'}</p>
      </div>
    `;
  }).join('');
}

function renderAnalyticsEmptyState() {
  const { emptyState } = getAnalyticsElements();
  const completedQueueCount = Number(adminState.waitTimeAnalytics?.completedQueueCount || 0);
  const shouldShowEmpty =
    !adminState.isAnalyticsLoading &&
    !adminState.analyticsError &&
    adminState.waitTimeAnalytics &&
    completedQueueCount === 0;

  if (emptyState) {
    emptyState.classList.toggle('hidden', !shouldShowEmpty);
  }
}

function refreshAnalyticsDashboard() {
  renderAnalyticsFeedback();
  renderAnalyticsFilters();
  renderAnalyticsSummary();
  renderNoShowSummaryCards();
  renderAnalyticsClinicRows();
  renderAnalyticsHourBars();
  renderNoShowClinicRows();
  renderNoShowTrendBars();
  renderAnalyticsEmptyState();
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

    if (redirectForAdminApiResponseStatus(response.status)) {
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

    if (redirectForAdminApiResponseStatus(response.status)) {
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

async function loadAdminClinicDetails(clinicId) {
  if (!clinicId) {
    adminState.selectedClinicId = '';
    adminState.selectedClinic = null;
    adminState.clinicDetailError = null;
    adminState.isClinicDetailLoading = false;
    refreshClinicManagement();
    return;
  }

  const requestToken = adminState.clinicDetailRequestToken + 1;

  adminState.clinicDetailRequestToken = requestToken;
  adminState.selectedClinicId = clinicId;
  adminState.selectedClinic = null;
  adminState.clinicDetailError = null;
  adminState.isClinicDetailLoading = true;
  adminState.clinicFeedback = null;
  refreshClinicManagement();

  try {
    const response = await fetch(buildAdminClinicEndpoint(clinicId), {
      headers: createAuthHeaders(),
      cache: 'no-store'
    });
    const payload = await readJsonSafely(response);

    if (redirectForAdminApiResponseStatus(response.status)) {
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load clinic details.');
    }

    if (adminState.clinicDetailRequestToken !== requestToken) {
      return;
    }

    adminState.selectedClinic = normalizeClinicDetail(payload.data || {});
    adminState.clinicDetailError = null;
  } catch (error) {
    console.error('Failed to load admin clinic details:', error);

    if (adminState.clinicDetailRequestToken !== requestToken) {
      return;
    }

    adminState.selectedClinic = null;
    adminState.clinicDetailError =
      error.message || 'We could not load this clinic right now.';
    adminState.clinicFeedback = {
      type: 'error',
      message: adminState.clinicDetailError
    };
  } finally {
    if (adminState.clinicDetailRequestToken === requestToken) {
      adminState.isClinicDetailLoading = false;
      refreshClinicManagement();
    }
  }
}

async function loadAdminClinics() {
  adminState.isClinicListLoading = true;
  adminState.clinicListError = null;
  adminState.clinicFeedback = null;
  refreshClinicManagement();
  refreshAnalyticsDashboard();

  try {
    const response = await fetch(ADMIN_CLINICS_ENDPOINT, {
      headers: createAuthHeaders(),
      cache: 'no-store'
    });
    const payload = await readJsonSafely(response);

    if (redirectForAdminApiResponseStatus(response.status)) {
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load clinics for admin management.');
    }

    adminState.clinics = Array.isArray(payload.data)
      ? payload.data.map(normalizeClinicSummary)
      : [];

    if (adminState.clinics.length === 0) {
      adminState.selectedClinicId = '';
      adminState.selectedClinic = null;
      adminState.clinicDetailError = null;
      adminState.clinicFeedback = null;
      return;
    }

    const selectedClinicExists = adminState.clinics.some(
      (clinic) => clinic.id === adminState.selectedClinicId
    );
    const targetClinicId = selectedClinicExists
      ? adminState.selectedClinicId
      : adminState.clinics[0].id;

    await loadAdminClinicDetails(targetClinicId);
  } catch (error) {
    console.error('Failed to load admin clinics:', error);
    adminState.clinics = [];
    adminState.selectedClinicId = '';
    adminState.selectedClinic = null;
    adminState.clinicListError =
      error.message || 'We could not load clinic records right now.';
    adminState.clinicFeedback = {
      type: 'error',
      message: adminState.clinicListError
    };
  } finally {
    adminState.isClinicListLoading = false;
    refreshClinicManagement();
    refreshAnalyticsDashboard();
  }
}

function getAnalyticsFiltersFromForm() {
  const {
    clinicSelect,
    startDateInput,
    endDateInput,
    hourSelect
  } = getAnalyticsElements();

  return {
    clinicId: clinicSelect?.value || '',
    startDate: startDateInput?.value || '',
    endDate: endDateInput?.value || '',
    hour: hourSelect?.value || ''
  };
}

function validateAnalyticsFilters(filters) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error('Start date cannot be after end date.');
  }
}

async function loadAdminAnalytics(filters = adminState.analyticsFilters) {
  if (!adminState.accessToken) {
    return;
  }

  const requestToken = adminState.analyticsRequestToken + 1;

  adminState.analyticsRequestToken = requestToken;
  adminState.analyticsFilters = { ...filters };
  adminState.isAnalyticsLoading = true;
  adminState.analyticsError = null;
  refreshAnalyticsDashboard();

  try {
    const [waitTimeResponse, noShowResponse] = await Promise.all([
      fetch(buildAnalyticsEndpoint(ADMIN_WAIT_TIME_ANALYTICS_ENDPOINT, filters, { includeHour: true }), {
        headers: createAuthHeaders(),
        cache: 'no-store'
      }),
      fetch(buildAnalyticsEndpoint(ADMIN_NO_SHOW_ANALYTICS_ENDPOINT, filters), {
        headers: createAuthHeaders(),
        cache: 'no-store'
      })
    ]);
    const [waitTimePayload, noShowPayload] = await Promise.all([
      readJsonSafely(waitTimeResponse),
      readJsonSafely(noShowResponse)
    ]);

    if (
      redirectForAdminApiResponseStatus(waitTimeResponse.status) ||
      redirectForAdminApiResponseStatus(noShowResponse.status)
    ) {
      return;
    }

    if (!waitTimeResponse.ok) {
      throw new Error(waitTimePayload.message || 'Failed to load wait-time analytics.');
    }

    if (!noShowResponse.ok) {
      throw new Error(noShowPayload.message || 'Failed to load no-show analytics.');
    }

    if (adminState.analyticsRequestToken !== requestToken) {
      return;
    }

    adminState.waitTimeAnalytics = waitTimePayload.data || {};
    adminState.noShowAnalytics = noShowPayload.data || {};
    adminState.analyticsLoadedAt = new Date();
    adminState.analyticsError = null;
  } catch (error) {
    console.error('Failed to load admin analytics:', error);

    if (adminState.analyticsRequestToken !== requestToken) {
      return;
    }

    adminState.analyticsError =
      error.message || 'We could not load analytics right now.';
  } finally {
    if (adminState.analyticsRequestToken === requestToken) {
      adminState.isAnalyticsLoading = false;
      refreshAnalyticsDashboard();
    }
  }
}

async function handleAnalyticsFilterSubmit(event) {
  event.preventDefault();

  try {
    const filters = getAnalyticsFiltersFromForm();
    validateAnalyticsFilters(filters);
    await loadAdminAnalytics(filters);
  } catch (error) {
    adminState.analyticsError = error.message || 'Check the selected analytics filters.';
    refreshAnalyticsDashboard();
  }
}

async function handleClinicSave(event) {
  event.preventDefault();

  if (
    !adminState.accessToken ||
    !adminState.selectedClinicId ||
    !adminState.selectedClinic ||
    adminState.isClinicDetailLoading ||
    adminState.isClinicSaveLoading
  ) {
    return;
  }

  const formPayload = getClinicFormPayload();

  adminState.isClinicSaveLoading = true;
  adminState.clinicFeedback = {
    type: 'loading',
    message: `Saving updates for ${adminState.selectedClinic.name || 'selected clinic'}...`
  };
  refreshClinicManagement();

  try {
    const response = await fetch(buildAdminClinicEndpoint(adminState.selectedClinicId), {
      method: 'PATCH',
      headers: createAuthHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(formPayload)
    });
    const payload = await readJsonSafely(response);

    if (redirectForAdminApiResponseStatus(response.status)) {
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to save clinic updates.');
    }

    const updatedClinic = normalizeClinicDetail(payload.data || {});

    adminState.selectedClinic = updatedClinic;
    adminState.clinicDetailError = null;
    adminState.clinics = adminState.clinics.map((clinic) => {
      if (clinic.id !== updatedClinic.id) {
        return clinic;
      }

      return normalizeClinicSummary(updatedClinic);
    });
    adminState.clinics.sort((leftClinic, rightClinic) =>
      String(leftClinic.name || '').localeCompare(String(rightClinic.name || ''))
    );
    adminState.clinicFeedback = {
      type: 'success',
      message: `${updatedClinic.name || 'Clinic'} updated successfully.`
    };
  } catch (error) {
    console.error('Failed to save clinic updates:', error);
    adminState.clinicFeedback = {
      type: 'error',
      message:
        error.message || 'We could not save this clinic right now. Please try again.'
    };
  } finally {
    adminState.isClinicSaveLoading = false;
    refreshClinicManagement();
    refreshAnalyticsDashboard();
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

function initialiseClinicManagementActions() {
  const { form, select, fields } = getClinicFormElements();

  if (select) {
    select.addEventListener('change', async function (event) {
      const nextClinicId = event.target.value;
      await loadAdminClinicDetails(nextClinicId);
    });
  }

  Object.keys(CLINIC_DROPDOWN_PLACEHOLDERS).forEach((fieldName) => {
    const field = fields[fieldName];

    if (!field) {
      return;
    }

    field.addEventListener('change', function () {
      renderClinicDropdownOptions();
    });
  });

  if (form) {
    form.addEventListener('submit', handleClinicSave);
  }
}

function initialiseAnalyticsActions() {
  const { form } = getAnalyticsElements();

  if (form) {
    form.addEventListener('submit', handleAnalyticsFilterSubmit);
  }
}

function initialiseAdminTabNavigation() {
  const { triggers } = getAdminTabElements();

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', function () {
      const nextTabId = trigger.dataset.adminTabTrigger;

      if (!isValidAdminTab(nextTabId)) {
        return;
      }

      if (window.location.hash === `#${nextTabId}`) {
        setActiveAdminTab(nextTabId);
        return;
      }

      setActiveAdminTab(nextTabId, { updateHash: true });
    });
  });

  window.addEventListener('hashchange', function () {
    setActiveAdminTab(getAdminTabFromHash());
  });

  setActiveAdminTab(getAdminTabFromHash());
}

async function initialiseAdminPage() {
  initialiseLogoutButton('logoutButton');
  initialiseLogoutButton('logoutCardButton');
  initialiseAdminTabNavigation();

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
  initialiseClinicManagementActions();
  initialiseAnalyticsActions();
  refreshAdminDashboard();
  refreshClinicManagement();
  refreshAnalyticsDashboard();

  await Promise.all([
    loadPendingStaffRequests(),
    loadAdminClinics(),
    loadAdminAnalytics()
  ]);
}

document.addEventListener('DOMContentLoaded', initialiseAdminPage);
