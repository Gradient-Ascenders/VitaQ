// Form elements
const registerForm = document.getElementById("registerForm");
const messageBox = document.getElementById("messageBox");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");

// Existing shared Supabase client
const supabase = window.supabaseClient;

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

// Basic email format check
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Handle form submission
registerForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  hideMessage();
  hideFieldError(emailError);
  hideFieldError(passwordError);
  hideFieldError(confirmPasswordError);

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  let isValid = true;

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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
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