import React, { useState, useEffect } from 'react';
import axios from 'axios';

function HomePage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Use the full URL since we're not using a proxy
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/health`)
      .then((response) => {
        setHealth(response.data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("API Error:", error);
        setError(error.message);
        setLoading(false);
      });
  }, []);

  return (
    <section className="home-page">
      <div className="home-hero">
        <h2>Annotation sessions with accountability and speed</h2>
        <p>
          GlossAssist combines structured session tracking, correction reuse, and model-assisted workflows
          for high-quality linguistic annotation.
        </p>
      </div>

      <div className="home-grid">
        <article className="home-card">
          <h3>Service Health</h3>
          {loading && <p className="status-muted">Checking backend status...</p>}
          {error && (
            <div className="status-error-box">
              <p>Error connecting to backend: {error}</p>
              <p>Expected API base: {process.env.REACT_APP_API_URL}</p>
            </div>
          )}
          {health && (
            <div className="status-ok-box">
              <p>{health.message}</p>
              <p>Last heartbeat: {new Date(health.timestamp).toLocaleString()}</p>
            </div>
          )}
          {!loading && !health && !error && <p className="status-muted">No response from backend.</p>}
        </article>

        <article className="home-card">
          <h3>Recommended Workflow</h3>
          <ol className="home-list">
            <li>Verify available datasets in View Data.</li>
            <li>Start a session from Glossing.</li>
            <li>Export session CSV and review per-user edits.</li>
          </ol>
        </article>

        <article className="home-card">
          <h3>What is tracked</h3>
          <ul className="home-list">
            <li>Per-example timing and total session duration.</li>
            <li>Word-level segmentation and gloss corrections.</li>
            <li>User attribution in exported session data.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

export default HomePage;