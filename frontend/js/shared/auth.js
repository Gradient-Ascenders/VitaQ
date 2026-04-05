// This file contains shared authentication helpers that can be reused
// across protected pages. The goal is to keep login, logout, and access
// control behaviour consistent throughout the Sprint 1 flow.

// This signs the user out and returns them to the login page.
async function logoutUser() {
  if (!window.supabaseClient) {
    console.error("Supabase client is not available.");
    alert("Logout could not be completed right now.");
    return;
  }

  try {
    const { error } = await window.supabaseClient.auth.signOut();

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

// This attaches the shared logout behaviour to a specific button or link.
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

// This checks the current session and returns it to the caller.
// It is useful when a page needs user details after access is confirmed.
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

// This helper should be called on protected pages.
// If there is no active session, the user is redirected to /login.
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