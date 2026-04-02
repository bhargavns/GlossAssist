import React, { useState } from "react";

function GlossTableDisplay() {
  const [data, setData] = useState([]);
  const [lang, setLang] = useState("");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const retrieveFromDb = async () => {
    if (!lang) {
      alert("Please enter a language code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `http://localhost:5001/api/get_glosses?lang=${encodeURIComponent(lang)}&limit=${limit}`
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result.data);
      console.log("Retrieved:", result);
      alert(`Success! ${result.count} rows retrieved.`);
      
    } catch (error) {
      console.error("Error retrieving:", error);
      setError(error.message);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="lang">Enter Language Code: </label>
        <input
          type="text"
          id="lang"
          name="lang"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="e.g., en, es, fr"
        />
        
        <label htmlFor="limit" style={{ marginLeft: "20px" }}>Limit: </label>
        <input
          type="number"
          id="limit"
          name="limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          min="1"
          max="100"
          style={{ width: "60px" }}
        />
        
        <button 
          onClick={retrieveFromDb} 
          disabled={loading}
          style={{ marginLeft: "10px" }}
        >
          {loading ? "Loading..." : "Retrieve Rows"}
        </button>
      </div>

      {error && (
        <div style={{ color: "red", marginBottom: "10px" }}>
          Error: {error}
        </div>
      )}

      {data.length > 0 && (
        <table border="1" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Transcript</th>
              <th>Segmentation</th>
              <th>Gloss</th>
              <th>Translation</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={row.gloss_id || index}>
                <td>{row.transcript}</td>
                <td>{row.segmentation}</td>
                <td>{row.gloss}</td>
                <td>{row.translation}</td>
                <td>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      {data.length === 0 && !loading && !error && (
        <p>No data to display. Enter a language code and click Retrieve Rows.</p>
      )}
    </div>
  );
}

export default GlossTableDisplay;