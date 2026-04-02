import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLanguages } from "../utils/api";
import "../styles/Dashboard.css";

function Dashboard() {
  const [selectedLang, setSelectedLang] = useState("");
  const [langs, setLangs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const handleLangSelection = (e) => {
    setSelectedLang(e.target.value);
  };

  const handleStartGlossing = () => {
    if (selectedLang) {
      navigate(`/gloss/${selectedLang}/1`);
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