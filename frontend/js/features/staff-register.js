// Form elements
const staffRegisterForm = document.getElementById("staffRegisterForm");
const staffRegisterButton = document.getElementById("staffRegisterButton");
const messageBox = document.getElementById("messageBox");

// Status card elements
const statusCard = document.getElementById("statusCard");
const statusValue = document.getElementById("statusValue");
const statusDescription = document.getElementById("statusDescription");

// Input elements
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const clinicSelectionInput = document.getElementById("clinicSelection");
const staffIdInput = document.getElementById("staffId");

// Field error elements
const fullNameError = document.getElementById("fullNameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const clinicSelectionError = document.getElementById("clinicSelectionError");
const staffIdError = document.getElementById("staffIdError");

// Backend route note:
// Change this only if your teammate used a different backend endpoint.
const STAFF_REGISTER_ENDPOINT = "/api/staff/register";

// Show a top-level message
function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.className = "mb-4 rounded-2xl px-4 py-3 text-sm";

  if (type === "success") {
    messageBox.classList.add("border", "bg-[#1f3d2e]", "text-[#9ece6a]");
  } else {
    messageBox.classList.add("border", "bg-[#3b1f2b]", "text-[#f7768e]");
  }
}

// Hide the top-level message
function hideMessage() {
  messageBox.textContent = "";
  messageBox.className = "hidden mb-4 rounded-2xl px-4 py-3 text-sm";
}

// Show field-specific error
function showFieldError(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

// Hide field-specific error
function hideFieldError(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

// Hide every field error before validating again
function hideAllFieldErrors() {
  hideFieldError(fullNameError);
  hideFieldError(emailError);
  hideFieldError(passwordError);
  hideFieldError(confirmPasswordError);
  hideFieldError(clinicSelectionError);
  hideFieldError(staffIdError);
}

// Basic email format check
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Show the status card using the allowed Sprint 2 states
function showStatus(status) {
  const normalisedStatus = String(status || "pending").toLowerCase();

  statusCard.classList.remove("hidden");
  statusCard.className = "mb-4 rounded-3xl border p-4";

  if (normalisedStatus === "approved") {
    statusCard.classList.add("border-[#9ece6a]/40", "bg-[#1f3d2e]/70");
    statusValue.textContent = "Approved";
    statusValue.className = "mt-2 text-lg font-semibold text-[#9ece6a]";
    statusDescription.textContent = "Your request has been approved. You can now use staff tools.";
    return;
  }

  if (normalisedStatus === "rejected") {
    statusCard.classList.add("border-[#f7768e]/40", "bg-[#3b1f2b]/70");
    statusValue.textContent = "Rejected";
    statusValue.className = "mt-2 text-lg font-semibold text-[#f7768e]";
    statusDescription.textContent = "Your request was not approved. Please contact an admin if needed.";
    return;
  }

  statusCard.classList.add("border-[#7aa2f7]/40", "bg-[#24283b]/70");
  statusValue.textContent = "Pending";
  statusValue.className = "mt-2 text-lg font-semibold text-[#7aa2f7]";
  statusDescription.textContent = "Your request is awaiting admin review.";
}

// Safely read JSON from a fetch response.
// This avoids crashes if the backend returns an empty body.
async function readJsonSafely(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse staff register response JSON:", error);
    return {};
  }
}

// Handle form submission
staffRegisterForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  hideMessage();
  hideAllFieldErrors();

  const fullName = fullNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const clinicSelection = clinicSelectionInput.value;
  const staffId = staffIdInput.value.trim();

  let isValid = true;

  if (!fullName) {
    showFieldError(fullNameError, "Full name is required.");
    isValid = false;
  }

  if (!email) {
    showFieldError(emailError, "Email is required.");
    isValid = false;
  } else if (!validateEmail(email)) {
    showFieldError(emailError, "Please enter a valid email address.");
    isValid = false;
  }

  if (!password) {
    showFieldError(passwordError, "Password is required.");
    isValid = false;
  } else if (password.length < 6) {
    showFieldError(passwordError, "Password must be at least 6 characters long.");
    isValid = false;
  }

  if (!confirmPassword) {
    showFieldError(confirmPasswordError, "Please confirm your password.");
    isValid = false;
  } else if (password !== confirmPassword) {
    showFieldError(confirmPasswordError, "Passwords do not match.");
    isValid = false;
  }

  if (!clinicSelection) {
    showFieldError(clinicSelectionError, "Please select a clinic.");
    isValid = false;
  }

  if (!staffId) {
    showFieldError(staffIdError, "Staff ID is required.");
    isValid = false;
  }

  if (!isValid) {
    showMessage("Please fix the errors in the form.");
    return;
  }

  staffRegisterButton.disabled = true;
  staffRegisterButton.textContent = "Submitting request...";

  try {
    // Send the frontend form data to the backend route.
    // The backend can handle Supabase Auth creation, profiles, and staff_requests.
    const response = await fetch(STAFF_REGISTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        password: password,
        clinic_id: clinicSelection,
        staff_id: staffId
      })
    });

    const result = await readJsonSafely(response);

    if (!response.ok) {
      showMessage(result.message || "Staff registration could not be completed right now.");
      return;
    }

    staffRegisterForm.reset();
    showStatus(result.status || "pending");
    showMessage(
      result.message || "Staff registration submitted successfully. Your request is pending approval.",
      "success"
    );
  } catch (error) {
    console.error("Unexpected staff registration error:", error);
    showMessage("Something went wrong while submitting your staff registration request.");
  } finally {
    staffRegisterButton.disabled = false;
    staffRegisterButton.textContent = "Submit Staff Registration Request";
  }
});