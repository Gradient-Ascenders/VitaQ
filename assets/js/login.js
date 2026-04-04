// This file handles the client-side behaviour for the login page.
// At this stage, the focus is on validation, UI feedback, and smaller
// front-end interactions needed for the login form.

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("errorMessage");
const loginButton = document.getElementById("loginButton");
const togglePasswordButton = document.getElementById("togglePassword");

// This helper clears any visible error message from a previous attempt.
function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

// This helper displays a user-friendly error message in the login card.
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

// This helper updates the button state while a submission is being processed.
// It improves the overall feel of the page and prevents repeated clicks.
function setLoadingState(isLoading) {
  loginButton.disabled = isLoading;

  if (isLoading) {
    loginButton.textContent = "Logging in...";
    loginButton.classList.add("opacity-70", "cursor-not-allowed");
  } else {
    loginButton.textContent = "Login";
    loginButton.classList.remove("opacity-70", "cursor-not-allowed");
  }
}

// This function performs the client-side checks before we try to sign in.
// Returning an object keeps the submit handler cleaner and easier to read.
function validateLoginForm(email, password) {
  const trimmedEmail = email.trim();

  // Check that the email field is not empty.
  if (!trimmedEmail) {
    return {
      isValid: false,
      message: "Please enter your email address."
    };
  }

  // A basic email pattern is sufficient for Sprint 1 validation.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(trimmedEmail)) {
    return {
      isValid: false,
      message: "Please enter a valid email address."
    };
  }

  // Check that the password field is not empty.
  if (!password) {
    return {
      isValid: false,
      message: "Please enter your password."
    };
  }

  return {
    isValid: true,
    message: ""
  };
}

// This handles the password visibility toggle on the login page.
// Keeping it here avoids extra inline JavaScript in the HTML file.
function initialisePasswordToggle() {
  if (!togglePasswordButton || !passwordInput) {
    return;
  }

  togglePasswordButton.addEventListener("click", function () {
    const passwordIsHidden = passwordInput.type === "password";

    if (passwordIsHidden) {
      passwordInput.type = "text";
      togglePasswordButton.textContent = "Hide";
    } else {
      passwordInput.type = "password";
      togglePasswordButton.textContent = "Show";
    }
  });
}

// This is still a placeholder for the real login request.
// In the next step, this function will call Supabase Auth properly.
async function handleValidatedLogin(email, password) {
  console.log("Validation passed. Ready to send login request for:", email);

  // Placeholder only for now.
  // The actual Supabase sign-in will be added next.
}

// Initialise the smaller page interactions first.
initialisePasswordToggle();

// Main submit handler for the login form.
loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  clearError();

  const email = emailInput.value;
  const password = passwordInput.value;

  const validationResult = validateLoginForm(email, password);

  if (!validationResult.isValid) {
    showError(validationResult.message);
    return;
  }

  try {
    setLoadingState(true);
    await handleValidatedLogin(email, password);
  } catch (error) {
    console.error("Unexpected login handling error:", error);
    showError("Something went wrong while processing your login. Please try again.");
  } finally {
    setLoadingState(false);
  }
});