import React, { useCallback, useEffect, useState } from "react";
import { fetchDatasets, fetchGlosses } from "../utils/api";

function GlossTableDisplay() {
  const [data, setData] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [limit, setLimit] = useState(10);
  const [mode, setMode] = useState('treatment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchDatasets();
      setDatasets(rows);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const retrieveFromDb = async () => {
    if (!selectedDataset) {
      setError('Please choose a dataset.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchGlosses({
        datasetId: Number(selectedDataset),
        limit: Number(limit),
        mode
      });
      setData(response.data || []);
      setError(null);
      
    } catch (error) {
      console.error("Error retrieving:", error);
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-panel">
      <div className="data-controls data-controls-inline">
        <button className="btn-inline" onClick={loadDatasets} disabled={loading}>
          {loading ? 'Refreshing...' : 'Load Datasets'}
        </button>

        <label htmlFor="datasetId">Dataset: </label>
        <select
          id="datasetId"
          value={selectedDataset}
          onChange={(e) => setSelectedDataset(e.target.value)}
        >
          <option value="">--Select a dataset--</option>
          {datasets.map((dataset) => (
            <option key={dataset.dataset_id} value={dataset.dataset_id}>
              {dataset.dataset_name} ({dataset.language})
            </option>
          ))}
        </select>

        <label htmlFor="mode">Mode: </label>
        <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="treatment">Treatment</option>
          <option value="control">Control</option>
        </select>
        
        <label htmlFor="limit">Limit: </label>
        <input
          type="number"
          id="limit"
          name="limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          min="1"
          max="100"
        />
        
        <button 
          className="btn-solid"
          onClick={retrieveFromDb} 
          disabled={loading}
        >
          {loading ? "Loading..." : "Retrieve Rows"}
        </button>
      </div>

      {error && (
        <div className="status-error-box">
          Error: {error}
        </div>
      )}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
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
        </div>
      )}
      
      {data.length === 0 && !loading && !error && (
        <p className="status-muted">Load datasets, choose one, and retrieve rows.</p>
      )}
    </div>
  );
}

export default GlossTableDisplay;