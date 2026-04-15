// Shared authentication helpers for VitaQ protected and public pages.
let authCallbackPromise = null;

// Finalise an OAuth callback if Supabase redirected back with an auth code.
async function completeAuthCallbackIfPresent() {
  if (authCallbackPromise) {
    return authCallbackPromise;
  }

  authCallbackPromise = (async function () {
    if (!window.supabaseClient) {
      throw new Error("Supabase client is not available.");
    }

    const currentUrl = new URL(window.location.href);
    const authCode = currentUrl.searchParams.get("code");

    if (!authCode) {
      return null;
    }

    const { data, error } = await window.supabaseClient.auth.exchangeCodeForSession(authCode);

    if (error) {
      throw error;
    }

    currentUrl.searchParams.delete("code");
    currentUrl.searchParams.delete("scope");
    currentUrl.searchParams.delete("authuser");
    currentUrl.searchParams.delete("prompt");

    const cleanedUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState({}, document.title, cleanedUrl);

    return data.session || null;
  })();

  return authCallbackPromise;
}

// Give Supabase a short window to restore a session after an OAuth redirect.
async function waitForSessionRecovery(timeoutMs = 2000) {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available.");
  }

  return new Promise((resolve) => {
    let authSubscription = null;

    function cleanup(resolvedSession) {
      window.clearTimeout(timeoutId);

      if (authSubscription?.data?.subscription) {
        authSubscription.data.subscription.unsubscribe();
      }

      resolve(resolvedSession);
    }

    const timeoutId = window.setTimeout(() => {
      cleanup(null);
    }, timeoutMs);

    authSubscription = window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        cleanup(session);
      }
    });
  });
}

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
async function getCurrentSession(waitForRecovery = false) {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not available.");
  }

  await completeAuthCallbackIfPresent();

  const { data, error } = await window.supabaseClient.auth.getSession();

  if (error) {
    throw error;
  }

  if (data.session) {
    return data.session;
  }

  if (waitForRecovery) {
    return waitForSessionRecovery();
  }

  return null;
}

// Use this on protected pages.
// If no session exists, redirect to /login.
async function requireAuthenticatedUser() {
  try {
    const session = await getCurrentSession(true);

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
    const session = await getCurrentSession(false);

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
