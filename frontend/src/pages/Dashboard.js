import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLanguages, fetchModels } from "../utils/api";
import "../styles/Dashboard.css";

function Dashboard() {
  const [selectedLang, setSelectedLang] = useState("");
  const [langs, setLangs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live glossing state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const loadLanguages = async () => {
      try {
        setLoading(true);
        const languages = await fetchLanguages();
        setLangs(languages);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadLanguages();
  }, []);

  // Fetch available models from the inference server
  useEffect(() => {
    const loadModels = async () => {
      try {
        setModelsLoading(true);
        const modelList = await fetchModels();
        setModels(modelList);
      } finally {
        setModelsLoading(false);
      }
    };

    loadModels();
  }, []);

  const handleLangSelection = (e) => {
    setSelectedLang(e.target.value);
  };

  const handleStartGlossing = () => {
    if (selectedLang) {
      navigate(`/gloss/${selectedLang}/1`);
    }
  };

  const handleStartLiveGlossing = () => {
    if (selectedLang && selectedModel) {
      navigate(`/gloss-live/${selectedLang}/${selectedModel}/1`);
    }
  };

  if (loading) {
    return <div className="loading">Loading languages...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="dashboard-container">
      <h2>Language Dashboard</h2>

      <div className="language-selection">
        <label htmlFor="langSelect">
          Pick the language you want to work with:
        </label>
        <select
          id="langSelect"
          value={selectedLang}
          onChange={handleLangSelection}
        >
          <option value="">--Select a language--</option>
          {langs.map((lang, index) => (
            <option key={index} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {selectedLang && (
        <div className="selection-confirmation">
          <p>You selected: <strong>{selectedLang}</strong></p>

          <button
            onClick={handleStartGlossing}
            className="start-button"
          >
            Start Glossing →
          </button>

          {/* Live Glossing section */}
          <div className="live-glossing-section">
            <hr />
            <p className="live-glossing-label">Or start with live model predictions:</p>

            {modelsLoading ? (
              <p className="models-loading">Loading models...</p>
            ) : models.length > 0 ? (
              <>
                <select
                  id="modelSelect"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="model-select"
                >
                  <option value="">--Select a model--</option>
                  {models.map((m, index) => (
                    <option key={index} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleStartLiveGlossing}
                  className="start-button start-button-live"
                  disabled={!selectedModel}
                >
                  Start Live Glossing ⚡
                </button>
              </>
            ) : (
              <p className="no-models">
                No inference server detected. Start your Flask server to enable live glossing.
              </p>
            )}
          </div>
        </div>
      )}

      {langs.length === 0 && !loading && (
        <p className="no-languages">
          No languages found in the database. Please upload some data first.
        </p>
      )}
    </div>
  );
}

export default Dashboard;