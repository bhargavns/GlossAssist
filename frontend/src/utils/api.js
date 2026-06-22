import axios from 'axios';

const API_ROOT = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const API_BASE_URL = `${API_ROOT}/api`;
const AUTH_STORAGE_KEY = 'glossassist_auth';

const apiClient = axios.create({
  baseURL: API_BASE_URL
});

apiClient.interceptors.request.use((config) => {
  const rawAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (rawAuth) {
    try {
      const parsed = JSON.parse(rawAuth);
      if (parsed?.token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${parsed.token}`;
      }
    } catch {
      // Ignore malformed local auth cache.
    }
  }

  return config;
});

// Generic error handler
const handleError = (error, customMessage) => {
  console.error(customMessage, error);
  throw error.response?.data?.error || error.message || customMessage;
};

// Auth APIs
export const login = async (identifier, password) => {
  try {
    const response = await apiClient.post('/auth/login', { identifier, password });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to login');
  }
};

export const register = async ({ username, email, password, code }) => {
  try {
    const response = await apiClient.post('/auth/register', {
      username,
      email,
      password,
      code
    });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to register user');
  }
};

export const requestAccessCode = async ({ name, email, message }) => {
  try {
    const response = await apiClient.post('/auth/request-code', { name, email, message });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to request access code');
  }
};

export const fetchCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data.user;
  } catch (error) {
    handleError(error, 'Failed to fetch current user');
  }
};

export const fetchCodeRequests = async () => {
  try {
    const response = await apiClient.get('/admin/code-requests');
    return response.data.data;
  } catch (error) {
    handleError(error, 'Failed to fetch code requests');
  }
};

export const updateCodeRequestStatus = async (requestId, status) => {
  try {
    const response = await apiClient.patch(`/admin/code-requests/${requestId}`, { status });
    return response.data.data;
  } catch (error) {
    handleError(error, 'Failed to update code request status');
  }
};

export const fetchRegistrationCodes = async () => {
  try {
    const response = await apiClient.get('/admin/registration-codes');
    return response.data.data;
  } catch (error) {
    handleError(error, 'Failed to fetch registration codes');
  }
};

export const createRegistrationCode = async ({ code, expiresAt }) => {
  try {
    const response = await apiClient.post('/admin/registration-codes', { code, expiresAt });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to create registration code');
  }
};

// Language APIs
export const fetchLanguages = async () => {
  try {
    const response = await apiClient.get('/languages');
    return response.data.data.map(lang => lang.lang_str);
  } catch (error) {
    handleError(error, 'Failed to fetch languages');
  }
};

export const fetchDatasets = async () => {
  try {
    const response = await apiClient.get('/datasets');
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'Failed to fetch datasets');
  }
};

// Gloss APIs
export const fetchGlosses = async ({ datasetId, limit, mode = 'treatment' }) => {
  try {
    const params = {
      datasetId,
      mode
    };

    if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
      params.limit = Number(limit);
    }

    const response = await apiClient.get('/get_glosses', {
      params
    });
    return response.data;
  } catch (error) {
    handleError(error, `Failed to fetch glosses for dataset: ${datasetId}`);
  }
};

export const updateDatasetRow = async ({ datasetId, rowIndex, segmentation, gloss, translation, source }) => {
  try {
    const response = await apiClient.patch(`/datasets/${datasetId}/rows/${rowIndex}`, {
      segmentation,
      gloss,
      translation,
      source
    });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to update dataset row');
  }
};

export const uploadGlosses = async ({ language, datasetName, data }) => {
  try {
    const response = await apiClient.post('/upload_glosses', {
      language,
      datasetName,
      data
    });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to upload glosses');
  }
};

export const saveStudySession = async (payload) => {
  try {
    const response = await apiClient.post('/study-sessions', payload);
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to save study session');
  }
};

export const fetchSavedStudySessions = async () => {
  try {
    const response = await apiClient.get('/study-sessions');
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'Failed to fetch study sessions');
  }
};

export const fetchStudySessionExport = async (sessionId) => {
  try {
    const response = await apiClient.get(`/study-sessions/${sessionId}/export`);
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to export study session');
  }
};

export const fetchStudyComparisonReport = async (sessionId) => {
  try {
    const response = await apiClient.get(`/study-sessions/${sessionId}/comparison-report`);
    return response.data.report;
  } catch (error) {
    handleError(error, 'Failed to fetch comparison report');
  }
};

export const getStudyRunSessions = async (runId) => {
  try {
    const response = await apiClient.get('/study-sessions', {
      params: { runId }
    });
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'Failed to fetch study run sessions');
  }
};

// Corrections APIs
export const fetchCorrectionsAPI = async (language, segmentation) => {
  try {
    const response = await apiClient.get('/corrections', {
      params: { lang: language, segmentation }
    });
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'Failed to fetch corrections');
  }
};

export const submitCorrections = async (language, corrections) => {
  try {
    const response = await apiClient.post('/corrections', {
      lang: language,
      corrections
    });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to save corrections');
  }
};

// Prediction API (direct to Flask inference server)
const INFERENCE_API_BASE = process.env.REACT_APP_INFERENCE_API_BASE || 'http://localhost:5050';

export const fetchModels = async () => {
  try {
    const response = await axios.get(`${INFERENCE_API_BASE}/models`);
    return response.data.models || [];
  } catch (error) {
    // Inference server might not be running — return empty list
    console.warn('Inference server not available:', error.message);
    return [];
  }
};

export const predictGloss = async (model, transcript, language) => {
  try {
    const response = await axios.post(`${INFERENCE_API_BASE}/${model}/predict`, {
      transcript,
      language
    });
    return response.data; // { segmentation, gloss }
  } catch (error) {
    handleError(error, 'Failed to get model prediction');
  }
};