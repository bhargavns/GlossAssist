import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchGlosses,
  fetchDatasets,
  fetchModels
} from "../utils/api";
import { getCurrentUsername } from "../utils/auth";
import { inferenceEnabled } from "../utils/featureFlags";
import "../styles/Dashboard.css";

function Dashboard() {
  const defaultRetrievalHF = "https://huggingface.co/CMU-Wav2Gloss/retrieval-totonac";
  const defaultPointerHF = "https://huggingface.co/CMU-Wav2Gloss/pointer-totonac";

  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [datasetExamples, setDatasetExamples] = useState([]);
  const [datasetExamplesLoading, setDatasetExamplesLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("cwomp");
  const [retrievalModelPath, setRetrievalModelPath] = useState(defaultRetrievalHF);
  const [pointerModelPath, setPointerModelPath] = useState(defaultPointerHF);
  const [defaultLexiconSource, setDefaultLexiconSource] = useState(defaultRetrievalHF);
  const [defaultLexiconFilename, setDefaultLexiconFilename] = useState("morpheme_lexicon_train.csv");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const datasetsData = await fetchDatasets();
        const editableDatasets = (datasetsData || []).filter((dataset) => Boolean(dataset.can_edit_data));
        setDatasets(editableDatasets);
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
    const loadModels = async () => {
      if (!inferenceEnabled) {
        return;
      }

      const availableModels = await fetchModels();
      if (availableModels.length > 0) {
        setModels(availableModels);
        setSelectedModel((currentModel) => (
          availableModels.includes(currentModel) ? currentModel : availableModels[0]
        ));
      } else {
        setModels(["cwomp"]);
      }
    };

    loadModels();
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

  const handleStartLiveGlossing = () => {
    if (!selectedDatasetId || !selectedModel) return;

    const username = getCurrentUsername() || "anonymous";
    const sessionKey = `${username}-${selectedDatasetId}-${selectedModel}-${Date.now()}`;

    navigate(`/gloss-live/${selectedDatasetId}/${selectedModel}/1`, {
      state: {
        hfRetrievalModelPath: retrievalModelPath,
        hfPointerModelPath: pointerModelPath,
        defaultLexiconSource,
        defaultLexiconFilename,
        sessionKey,
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

          {inferenceEnabled && (
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <label htmlFor="liveModelSelect">Live model:</label>
              <select
                id="liveModelSelect"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              <label htmlFor="retrievalModelPath">HF retrieval path:</label>
              <input
                id="retrievalModelPath"
                type="text"
                value={retrievalModelPath}
                onChange={(e) => setRetrievalModelPath(e.target.value)}
                style={{ minWidth: "340px" }}
              />
              <label htmlFor="pointerModelPath">HF pointer path:</label>
              <input
                id="pointerModelPath"
                type="text"
                value={pointerModelPath}
                onChange={(e) => setPointerModelPath(e.target.value)}
                style={{ minWidth: "340px" }}
              />
              <label htmlFor="defaultLexiconSource">Default lexicon HF source:</label>
              <input
                id="defaultLexiconSource"
                type="text"
                value={defaultLexiconSource}
                onChange={(e) => setDefaultLexiconSource(e.target.value)}
                style={{ minWidth: "340px" }}
              />
              <label htmlFor="defaultLexiconFilename">Lexicon filename:</label>
              <input
                id="defaultLexiconFilename"
                type="text"
                value={defaultLexiconFilename}
                onChange={(e) => setDefaultLexiconFilename(e.target.value)}
                style={{ minWidth: "340px" }}
              />
              <button onClick={handleStartLiveGlossing} className="start-button">
                Start Live Inference Session →
              </button>
            </div>
          )}

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
          No editable datasets found. Upload your own dataset to start glossing.
        </p>
      )}
    </div>
  );
}

export default Dashboard;