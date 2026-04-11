// Shared authentication helpers for VitaQ protected and public pages.

// Signs the user out and sends them back to the login page.
async function logoutUser() {
  if (!window.supabaseClient) {
    console.error("Supabase client is not available.");
    alert("Logout could not be completed right now.");
    return;
  }

  try {
    const { error } = await window.supabaseClient.auth.signOut({ scope: "global" });

    if (error) {
      console.error("Supabase logout error:", error);
      alert("Logout failed. Please try again.");
      return;
    }

    window.location.href = "/login";
  } catch (error) {
    console.error("Unexpected logout error:", error);
    alert("Something went wrong while logging out. Please try again.");
  }
}

// Attaches logout behaviour to a button.
function initialiseLogoutButton(buttonId) {
  const logoutButton = document.getElementById(buttonId);

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", async function (event) {
    event.preventDefault();
    await logoutUser();
  });
}

// Returns the current Supabase session.
async function getCurrentSession() {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available.");
  }

  const { data, error } = await window.supabaseClient.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

// Use this on protected pages.
// If no session exists, redirect to /login.
async function requireAuthenticatedUser() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      window.location.href = "/login";
      return null;
    }

    return session;
  } catch (error) {
    console.error("Protected page session check failed:", error);
    window.location.href = "/login";
    return null;
  }
}

// Use this on public auth pages like /login and /register.
// If a session already exists, redirect to /dashboard.
async function redirectIfAuthenticated() {
  try {
    const session = await getCurrentSession();

    if (session) {
      window.location.href = "/dashboard";
      return session;
    }

    return null;
  } catch (error) {
    console.error("Public page session check failed:", error);
    return null;
  }
}