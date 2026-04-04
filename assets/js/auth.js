// This file contains shared authentication helpers that can be reused
// across protected pages, especially for logout behaviour.

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

    // After signing out, the user should be sent back to the login page.
    window.location.href = "/login";
  } catch (error) {
    console.error("Unexpected logout error:", error);
    alert("Something went wrong while logging out. Please try again.");
  }
}

// This helper attaches the shared logout behaviour to a button or link.
// It can be reused in the navbar, dashboard, or other protected pages.
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