// This file handles the client-side behaviour for the login page.
// It covers validation, smaller UI interactions, and the actual
// Supabase email/password sign-in flow for Sprint 1.

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
// It improves the user experience and prevents repeated clicks.
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

// This sends the validated login details to Supabase Auth.
// On success, the patient is redirected to the dashboard.
async function handleValidatedLogin(email, password) {
  // Guard against the client not being available.
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available on the page.");
  }

  const { data, error } = await window.supabaseClient.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) {
    console.error("Supabase login error:", error);

    // Keep the message clear and user-friendly.
    if (error.message.toLowerCase().includes("email not confirmed")) {
      showError("Please confirm your email address before logging in.");
      return;
    }

    showError("Invalid email or password. Please try again.");
    return;
  }

  // If a session is returned successfully, move the user into the protected area.
  if (data.session) {
    window.location.href = "/dashboard";
    return;
  }

  // Fallback in the rare case no error is thrown but no session is available.
  showError("Login could not be completed. Please try again.");
}

// Initialise smaller page interactions first.
initialisePasswordToggle();

// Main submit handler for the login form.
if (loginForm) {
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
}