const HF_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isHuggingFaceSource = (value) => {
  if (!value) return true;
  if (value.startsWith('https://huggingface.co/') || value.startsWith('http://huggingface.co/')) return true;
  return HF_REPO_PATTERN.test(value);
};

const createInferenceProxyHelpers = ({ allowLocalInferencePaths }) => {
  const validateInferenceSource = (label, value) => {
    if (!value || allowLocalInferencePaths || isHuggingFaceSource(value)) return;
    const err = new Error(`${label} must be a HuggingFace URL or owner/repo id`);
    err.status = 400;
    throw err;
  };

  const validatePointerFilename = (value) => {
    if (!value) return;
    if (value.includes('/') || value.includes('\\')) {
      const err = new Error('pointerFilename must be a filename, not a path');
      err.status = 400;
      throw err;
    }
  };

  const scopedInferenceSessionKey = (req, rawSessionKey) => {
    const raw = String(rawSessionKey || '').trim();
    if (!raw) return '';
    return `${req.user.userId}-${raw.slice(0, 160)}`;
  };

  const buildInferencePayload = (req, extra = {}) => {
    const body = req.body || {};
    const retrievalModelPath = body.retrievalModelPath || body.retrieval_model_path || '';
    const pointerModelPath = body.pointerModelPath || body.pointer_model_path || '';
    const pointerFilename = body.pointerFilename || body.pointer_filename || '';
    const lexiconPath = body.lexiconPath || body.lexicon_path || '';
    const defaultLexiconSource = body.defaultLexiconSource || body.default_lexicon_source || '';
    const defaultLexiconFilename = body.defaultLexiconFilename || body.default_lexicon_filename || '';

    validateInferenceSource('retrievalModelPath', retrievalModelPath);
    validateInferenceSource('pointerModelPath', pointerModelPath);
    validateInferenceSource('lexiconPath', lexiconPath);
    validateInferenceSource('defaultLexiconSource', defaultLexiconSource);
    validatePointerFilename(pointerFilename);

    return {
      ...extra,
      ...(retrievalModelPath ? { retrieval_model_path: retrievalModelPath } : {}),
      ...(pointerModelPath ? { pointer_model_path: pointerModelPath } : {}),
      ...(pointerFilename ? { pointer_filename: pointerFilename } : {}),
      ...(lexiconPath ? { lexicon_path: lexiconPath } : {}),
      ...(defaultLexiconSource ? { default_lexicon_source: defaultLexiconSource } : {}),
      ...(defaultLexiconFilename ? { default_lexicon_filename: defaultLexiconFilename } : {}),
      ...(body.sessionKey || body.session_key
        ? { session_key: scopedInferenceSessionKey(req, body.sessionKey || body.session_key) }
        : {})
    };
  };

  const handleInferenceProxyError = (res, err, fallbackMessage) => {
    console.error(`${fallbackMessage}:`, err.message);
    const status = err.status || err.response?.status || 502;
    const detail = err.response?.data?.error || err.message;
    return res.status(status).json({ error: fallbackMessage, details: detail });
  };

  return {
    buildInferencePayload,
    handleInferenceProxyError
  };
};

module.exports = {
  createInferenceProxyHelpers
};
