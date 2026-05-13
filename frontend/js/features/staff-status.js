// This page shows pending, rejected, or approved staff request status.
// It is used to stop pending/rejected staff accounts from entering the patient dashboard.

const STAFF_STATUS_PAGE_ENDPOINT = "/api/staff/request-status";

const statusBadge = document.getElementById("statusBadge");
const statusHeading = document.getElementById("statusHeading");
const statusDescription = document.getElementById("statusDescription");
const requestDetails = document.getElementById("requestDetails");
const requestFullName = document.getElementById("requestFullName");
const requestStaffId = document.getElementById("requestStaffId");
const requestCreatedAt = document.getElementById("requestCreatedAt");
const staffPageButton = document.getElementById("staffPageButton");
const patientRegisterButton = document.getElementById("patientRegisterButton");

// Safely reads JSON from a backend response.
async function readJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse staff status response:", error);
    return {};
  }
}

// Updates the main status card classes and text.
function setStatusBadge(text, type = "pending") {
  statusBadge.textContent = text;
  statusBadge.className =
    "mx-auto mb-5 inline-flex rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em]";

  if (type === "approved") {
    statusBadge.classList.add("border-[#9ece6a]/30", "bg-[#9ece6a]/10", "text-[#9ece6a]");
    return;
  }

  if (type === "rejected") {
    statusBadge.classList.add("border-[#f7768e]/30", "bg-[#f7768e]/10", "text-[#f7768e]");
    return;
  }

  if (type === "none") {
    statusBadge.classList.add("border-[#bb9af7]/30", "bg-[#bb9af7]/10", "text-[#bb9af7]");
    return;
  }

  statusBadge.classList.add("border-[#7aa2f7]/30", "bg-[#7aa2f7]/10", "text-[#7dcfff]");
}

// Formats the request date for display.
function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// Shows request details if a staff request exists.
function renderRequestDetails(request) {
  if (!request) {
    requestDetails.classList.add("hidden");
    return;
  }

  requestFullName.textContent = request.full_name || "-";
  requestStaffId.textContent = request.staff_id || "-";
  requestCreatedAt.textContent = formatDate(request.created_at);
  requestDetails.classList.remove("hidden");
}

// Renders the page depending on the current request status.
function renderStaffStatus(status, request) {
  const normalisedStatus = String(status || "none").toLowerCase();

  renderRequestDetails(request);

  staffPageButton.classList.add("hidden");
  patientRegisterButton.classList.add("hidden");

  if (normalisedStatus === "approved") {
    setStatusBadge("Approved", "approved");
    statusHeading.textContent = "Your staff account is approved.";
    statusDescription.textContent =
      "You can now access VitaQ staff tools for your assigned clinic.";
    staffPageButton.classList.remove("hidden");
    return;
  }

  if (normalisedStatus === "rejected") {
    setStatusBadge("Rejected", "rejected");
    statusHeading.textContent = "Your staff request was rejected.";
    statusDescription.textContent =
      "This account cannot access staff tools. Please contact an administrator if you believe this was a mistake.";
    return;
  }

  if (normalisedStatus === "pending") {
    setStatusBadge("Pending approval", "pending");
    statusHeading.textContent = "Your staff request is awaiting approval.";
    statusDescription.textContent =
      "An admin still needs to review your staff registration request before you can access clinic staff tools.";
    return;
  }

  setStatusBadge("No staff request", "none");
  statusHeading.textContent = "No staff request was found.";
  statusDescription.textContent =
    "This account does not have a staff registration request. Please use the patient dashboard or register as staff from the staff registration page.";
  patientRegisterButton.classList.remove("hidden");
}

// Loads the logged-in user's staff request status from the backend.
async function loadStaffStatus() {
  const session = await requireAuthenticatedUser();

  if (!session) {
    return;
  }

  try {
    const response = await fetch(STAFF_STATUS_PAGE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const result = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(result.message || "Failed to load staff request status.");
    }

    renderStaffStatus(result.data?.status, result.data?.request || null);
  } catch (error) {
    console.error("Staff status page failed:", error);
    setStatusBadge("Error", "rejected");
    statusHeading.textContent = "Staff status could not be loaded.";
    statusDescription.textContent =
      "Please refresh the page or log out and try again.";
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  initialiseLogoutButton("logoutButton");
  await loadStaffStatus();
});