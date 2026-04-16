// This file handles the client-side behaviour for the login page.
// It includes validation, password visibility toggling, and the
// main outcome handling for Supabase email/password sign-in.

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMeCheckbox = document.getElementById("rememberMe");
const errorMessage = document.getElementById("errorMessage");
const loginButton = document.getElementById("loginButton");
const togglePasswordButton = document.getElementById("togglePassword");
const oauthButtons = Array.from(document.querySelectorAll("[data-oauth-provider]"));

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
// It prevents repeated clicks and makes the UI feel more responsive.
function setLoadingState(isLoading) {
  loginButton.disabled = isLoading;

  if (isLoading) {
    loginButton.textContent = "Logging in...";
    loginButton.classList.add("opacity-70", "cursor-not-allowed");
  } else {
    loginButton.textContent = "Continue";
    loginButton.classList.remove("opacity-70", "cursor-not-allowed");
  }
}

// This updates the social login buttons while an OAuth redirect is being started.
function setOAuthButtonsLoadingState(isLoading, activeButton) {
  oauthButtons.forEach(function (button) {
    const providerLabel = button.dataset.providerLabel || "Provider";
    const isActiveButton = button === activeButton;

    button.disabled = isLoading;

    if (isLoading && isActiveButton) {
      button.classList.add("opacity-70", "cursor-not-allowed");
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-label", `Signing in with ${providerLabel}`);
    } else {
      button.classList.remove("opacity-70", "cursor-not-allowed");
      button.removeAttribute("aria-busy");
      button.setAttribute("aria-label", `Sign in with ${providerLabel}`);
    }
  });
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

  // A basic email pattern is enough for Sprint 1.
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

// If the user already has an active session, there is no reason to keep
// them on the login page. We redirect them straight to the dashboard.
async function redirectAuthenticatedUser() {
  try {
    const session = await getCurrentSession(false);

    if (session) {
      await redirectToRoleHome(session);
    }
  } catch (error) {
    console.error("Unexpected session check error:", error);
  }
}

// Build a safe redirect target for OAuth providers.
function getOAuthRedirectUrl() {
  return `${window.location.origin}/dashboard`;
}

// This starts a third-party login flow via Supabase Auth.
async function handleOAuthLogin(provider) {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available on the page.");
  }

  const options = {
    redirectTo: getOAuthRedirectUrl()
  };

  if (provider === "azure") {
    options.scopes = "email";
  }

  const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
    provider: provider,
    options: options
  });

  if (error) {
    throw error;
  }

  // In the browser, Supabase normally redirects immediately. If a URL is returned
  // without an automatic redirect, fall back to navigating manually.
  if (data?.url) {
    window.location.href = data.url;
  }
}

// Attach OAuth login behaviour to the social buttons.
function initialiseOAuthButtons() {
  oauthButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      const provider = button.dataset.oauthProvider;
      const providerLabel = button.dataset.providerLabel || "that provider";

      clearError();
      setOAuthButtonsLoadingState(true, button);

      try {
        await handleOAuthLogin(provider);
      } catch (error) {
        console.error(`Unexpected OAuth login handling error for ${provider}:`, error);
        showError(`Sign in with ${providerLabel} could not be started right now. Please try again.`);
        setOAuthButtonsLoadingState(false, null);
      }
    });
  });
}

// This sends the validated credentials to Supabase Auth and handles
// the different outcomes in a user-friendly way.
async function handleValidatedLogin(email, password, rememberUser) {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available on the page.");
  }

  if (typeof window.prepareAuthStorageForLogin === "function") {
    window.prepareAuthStorageForLogin(rememberUser);
  }

  const { data, error } = await window.supabaseClient.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) {
    console.error("Supabase login error:", error);

    const normalisedMessage = error.message.toLowerCase();

    // Handle the case where a user has registered but not yet confirmed
    // their email address.
    if (normalisedMessage.includes("email not confirmed")) {
      showError("Please confirm your email address before logging in.");
      return;
    }

    // Handle general invalid credential errors without exposing too much detail.
    if (
      normalisedMessage.includes("invalid login credentials") ||
      normalisedMessage.includes("invalid credentials") ||
      normalisedMessage.includes("invalid email or password")
    ) {
      showError("Invalid email or password. Please try again.");
      return;
    }

    // Handle connectivity-related problems more gracefully.
    if (!navigator.onLine) {
      showError("You appear to be offline. Please check your internet connection and try again.");
      return;
    }

    // Fallback for any other login-related issue.
    showError("Login could not be completed right now. Please try again.");
    return;
  }

  // If sign-in succeeds and a session is returned, move the patient into
  // the protected area of the system.
  if (data.session) {
    await redirectToRoleHome(data.session);
    return;
  }

  // Fallback in the unlikely case that no error is thrown but no session exists.
  showError("Login could not be completed right now. Please try again.");
}

// Initialise smaller page interactions first.
initialisePasswordToggle();
initialiseOAuthButtons();

// Check whether the user is already logged in.
redirectAuthenticatedUser();

// Main submit handler for the login form.
if (loginForm) {
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    clearError();

    const email = emailInput.value;
    const password = passwordInput.value;
    const rememberUser = Boolean(rememberMeCheckbox?.checked);

    const validationResult = validateLoginForm(email, password);

    if (!validationResult.isValid) {
      showError(validationResult.message);
      return;
    }

    try {
      setLoadingState(true);
      await handleValidatedLogin(email, password, rememberUser);
    } catch (error) {
      console.error("Unexpected login handling error:", error);

      if (!navigator.onLine) {
        showError("You appear to be offline. Please check your internet connection and try again.");
      } else {
        showError("Something went wrong while processing your login. Please try again.");
      }
    } finally {
      setLoadingState(false);
    }
  });
}
