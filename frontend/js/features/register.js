// Form elements
const registerForm = document.getElementById("registerForm");
const messageBox = document.getElementById("messageBox");

const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const firstNameError = document.getElementById("firstNameError");
const lastNameError = document.getElementById("lastNameError");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const oauthButtons = Array.from(document.querySelectorAll("[data-oauth-provider]"));

// Existing shared Supabase client
const supabaseClient = window.supabaseClient;

// Note:
// The new "Register as Staff" button on the register page is a normal link in the HTML,
// so this patient register script does not need any extra click-handling logic for it.

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

function buildFullName(firstName, lastName) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

// Update the social signup buttons while an OAuth redirect is being started.
function setOAuthButtonsLoadingState(isLoading, activeButton) {
  oauthButtons.forEach(function (button) {
    const providerLabel = button.dataset.providerLabel || "Provider";
    const isActiveButton = button === activeButton;

    button.disabled = isLoading;

    if (isLoading && isActiveButton) {
      button.classList.add("opacity-70", "cursor-not-allowed");
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-label", `Signing up with ${providerLabel}`);
    } else {
      button.classList.remove("opacity-70", "cursor-not-allowed");
      button.removeAttribute("aria-busy");
      button.setAttribute("aria-label", `Sign up with ${providerLabel}`);
    }
  });
}

// Basic email format check
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Reuse the dashboard redirect after a successful social sign-up.
function getOAuthRedirectUrl() {
  return `${window.location.origin}/dashboard`;
}

// Start an OAuth sign-up flow through Supabase Auth.
async function handleOAuthSignup(provider) {
  const options = {
    redirectTo: getOAuthRedirectUrl()
  };

  if (provider === "azure") {
    options.scopes = "email";
  }

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: provider,
    options: options
  });

  if (error) {
    throw error;
  }

  if (data?.url) {
    window.location.href = data.url;
  }
}

// Attach social sign-up behaviour to the provider buttons.
function initialiseOAuthButtons() {
  oauthButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      const provider = button.dataset.oauthProvider;
      const providerLabel = button.dataset.providerLabel || "that provider";

      hideMessage();
      hideFieldError(firstNameError);
      hideFieldError(lastNameError);
      hideFieldError(emailError);
      hideFieldError(passwordError);
      hideFieldError(confirmPasswordError);
      setOAuthButtonsLoadingState(true, button);

      try {
        await handleOAuthSignup(provider);
      } catch (error) {
        console.error(`Unexpected OAuth sign-up handling error for ${provider}:`, error);
        showMessage(`Sign up with ${providerLabel} could not be started right now.`);
        setOAuthButtonsLoadingState(false, null);
      }
    });
  });
}

initialiseOAuthButtons();

// Handle form submission
registerForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  hideMessage();
  hideFieldError(firstNameError);
  hideFieldError(lastNameError);
  hideFieldError(emailError);
  hideFieldError(passwordError);
  hideFieldError(confirmPasswordError);

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  let isValid = true;

  if (!firstName) {
    showFieldError(firstNameError, "First name is required.");
    isValid = false;
  }

  if (!lastName) {
    showFieldError(lastNameError, "Last name is required.");
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

  if (!isValid) {
    showMessage("Please fix the errors in the form.");
    return;
  }

  const registerButton = document.getElementById("registerButton");
  registerButton.disabled = true;
  registerButton.textContent = "Creating account...";

  const fullName = buildFullName(firstName, lastName);

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  registerButton.disabled = false;
  registerButton.textContent = "Continue";

  if (error) {
    showMessage(error.message);
    return;
  }

  registerForm.reset();

  if (data.session) {
    showMessage("Account created successfully. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1200);
  } else {
    showMessage(
      "Account created. Check your email to confirm your account.",
      "success"
    );
  }
});
