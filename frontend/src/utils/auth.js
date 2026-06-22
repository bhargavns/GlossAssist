const AUTH_STORAGE_KEY = 'glossassist_auth';

export const getStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const storeAuth = ({ token, user }) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
};

export const clearStoredAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const getCurrentUsername = () => {
  const auth = getStoredAuth();
  return auth?.user?.username || '';
};
