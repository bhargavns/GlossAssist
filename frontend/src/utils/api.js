import axios from 'axios';

const API_BASE_URL = `${process.env.REACT_APP_API_URL}/api` || 'http://localhost:5001/api';

// Generic error handler
const handleError = (error, customMessage) => {
  console.error(customMessage, error);
  throw error.response?.data?.error || error.message || customMessage;
};

// Language APIs
export const fetchLanguages = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/languages`);
    return response.data.data.map(lang => lang.lang_str);
  } catch (error) {
    handleError(error, 'Failed to fetch languages');
  }
};

// Gloss APIs
export const fetchGlosses = async (language, limit = 20) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/get_glosses?lang=${encodeURIComponent(language)}&limit=${limit}`
    );
    return response.data.data;
  } catch (error) {
    handleError(error, `Failed to fetch glosses for language: ${language}`);
  }
};

export const uploadGlosses = async (language, data) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/upload_glosses`, {
      lang: language,
      data: data
    });
    return response.data;
  } catch (error) {
    handleError(error, 'Failed to upload glosses');
  }
};

// Corrections APIs
export const fetchCorrectionsAPI = async (language, segmentation) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/corrections`, {
      params: { lang: language, segmentation }
    });
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'Failed to fetch corrections');
  }
};

export const submitCorrections = async (language, corrections) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/corrections`, {
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