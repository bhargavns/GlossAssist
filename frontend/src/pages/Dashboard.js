import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchGlosses,
  fetchDatasets
} from "../utils/api";
import "../styles/Dashboard.css";

function Dashboard() {
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [datasetExamples, setDatasetExamples] = useState([]);
  const [datasetExamplesLoading, setDatasetExamplesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const datasetsData = await fetchDatasets();
        setDatasets(datasetsData || []);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  useEffect(() => {
    const loadDatasetExamples = async () => {
      if (!selectedDatasetId) {
        setDatasetExamples([]);
        return;
      }

      try {
        setDatasetExamplesLoading(true);
        const response = await fetchGlosses({
          datasetId: Number(selectedDatasetId),
          mode: "treatment"
        });
        setDatasetExamples(response.data || []);
        setError(null);
      } catch (err) {
        setError(err);
        setDatasetExamples([]);
      } finally {
        setDatasetExamplesLoading(false);
      }
    };

    loadDatasetExamples();
  }, [selectedDatasetId]);

  const handleStartGlossing = () => {
    if (selectedDatasetId) {
      navigate(`/gloss/${selectedDatasetId}/1`, {
        state: {
          datasetId: Number(selectedDatasetId),
          studyFlow: null,
          mode: 'treatment'
        }
      });
    }
  };

  const handleGlossExample = (rowIndex) => {
    if (!selectedDatasetId || !rowIndex) return;

    navigate(`/gloss/${selectedDatasetId}/${rowIndex}`, {
      state: {
        datasetId: Number(selectedDatasetId),
        studyFlow: null,
        mode: "treatment"
      }
    });
  };

  if (loading) {
    return <div className="loading">Loading glossing workspace...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="dashboard-container">
      <h2>Glossing</h2>

      <div className="language-selection">
        <label htmlFor="datasetSelect">
          Pick the dataset you want to work with:
        </label>
        <select
          id="datasetSelect"
          value={selectedDatasetId}
          onChange={(e) => setSelectedDatasetId(e.target.value)}
        >
          <option value="">--Select a dataset--</option>
          {datasets.map((dataset) => (
            <option key={dataset.dataset_id} value={dataset.dataset_id}>
              {dataset.dataset_name} ({dataset.language})
            </option>
          ))}
        </select>
      </div>

      {selectedDatasetId && (
        <div className="selection-confirmation">
          <p>
            You selected dataset <strong>{selectedDatasetId}</strong>. You can start at the first example or pick any example below.
          </p>

          <button
            onClick={handleStartGlossing}
            className="start-button"
          >
            Start From First Example →
          </button>

          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            {datasetExamplesLoading ? (
              <p className="no-languages">Loading examples...</p>
            ) : datasetExamples.length === 0 ? (
              <p className="no-languages">No examples found in this dataset.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Example Index</th>
                    <th>Transcript</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {datasetExamples.map((row) => (
                    <tr key={row.gloss_id || row.row_index}>
                      <td>{row.row_index}</td>
                      <td>{row.transcript}</td>
                      <td>
                        <button className="btn-inline" onClick={() => handleGlossExample(row.row_index)}>
                          Gloss Example
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {datasets.length === 0 && !loading && (
        <p className="no-languages">
          No datasets found. Upload one first, or use the seeded SampleStudyDataset.
        </p>
      )}
    </div>
  );
}

export default Dashboard;