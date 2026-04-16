const SUPABASE_URL = "https://dirrhszinkaqazwrrmap.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_j5lc8FOV8Q7w4r9UkJnRXA_G3-wDRXf";
const SUPABASE_STORAGE_KEY = "sb-dirrhszinkaqazwrrmap-auth-token";
const AUTH_STORAGE_MODES = {
  SESSION: "session",
  PERSISTENT: "persistent"
};

let preferredAuthStorageMode = null;

function readFromStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    console.error(`Could not read auth storage key "${key}":`, error);
    return null;
  }
}

function writeToStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.error(`Could not write auth storage key "${key}":`, error);
  }
}

function removeFromStorage(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    console.error(`Could not remove auth storage key "${key}":`, error);
  }
}

function getActiveAuthStorageMode() {
  if (preferredAuthStorageMode) {
    return preferredAuthStorageMode;
  }

  if (readFromStorage(window.sessionStorage, SUPABASE_STORAGE_KEY)) {
    return AUTH_STORAGE_MODES.SESSION;
  }

  if (readFromStorage(window.localStorage, SUPABASE_STORAGE_KEY)) {
    return AUTH_STORAGE_MODES.PERSISTENT;
  }

  return AUTH_STORAGE_MODES.PERSISTENT;
}

function clearStoredAuthSession() {
  removeFromStorage(window.sessionStorage, SUPABASE_STORAGE_KEY);
  removeFromStorage(window.localStorage, SUPABASE_STORAGE_KEY);
}

window.setPreferredAuthStorageMode = function setPreferredAuthStorageMode(mode) {
  preferredAuthStorageMode = mode === AUTH_STORAGE_MODES.PERSISTENT
    ? AUTH_STORAGE_MODES.PERSISTENT
    : AUTH_STORAGE_MODES.SESSION;
};

window.prepareAuthStorageForLogin = function prepareAuthStorageForLogin(rememberUser) {
  preferredAuthStorageMode = rememberUser
    ? AUTH_STORAGE_MODES.PERSISTENT
    : AUTH_STORAGE_MODES.SESSION;

  clearStoredAuthSession();
};

window.clearStoredAuthSession = clearStoredAuthSession;

const authStorage = {
  getItem(key) {
    const sessionValue = readFromStorage(window.sessionStorage, key);

    if (sessionValue) {
      preferredAuthStorageMode = AUTH_STORAGE_MODES.SESSION;
      return sessionValue;
    }

    const persistentValue = readFromStorage(window.localStorage, key);

    if (persistentValue) {
      preferredAuthStorageMode = AUTH_STORAGE_MODES.PERSISTENT;
      return persistentValue;
    }

    return null;
  },

  setItem(key, value) {
    if (getActiveAuthStorageMode() === AUTH_STORAGE_MODES.SESSION) {
      writeToStorage(window.sessionStorage, key, value);
      removeFromStorage(window.localStorage, key);
      return;
    }

    writeToStorage(window.localStorage, key, value);
    removeFromStorage(window.sessionStorage, key);
  },

  removeItem(key) {
    removeFromStorage(window.sessionStorage, key);
    removeFromStorage(window.localStorage, key);
  }
};

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: SUPABASE_STORAGE_KEY,
    storage: authStorage
  }
});
