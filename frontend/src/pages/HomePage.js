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
    <>
      {loading && <p>Loading...</p>}

      {error && (
        <div style={{ color: "red" }}>
          <p>Error connecting to backend: {error}</p>
          <p>
            Make sure the backend is running on {process.env.REACT_APP_API_URL}
          </p>
        </div>
      )}

      {health && (
        <div style={{ color: "green" }}>
          <p>Backend Status: {health.message}</p>
          <p>Timestamp: {health.timestamp}</p>
        </div>
      )}

      {!loading && !health && !error && <p>No response from backend</p>}
    </>
  );
}

export default HomePage;