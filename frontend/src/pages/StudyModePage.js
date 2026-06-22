import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDatasets } from '../utils/api';

function StudyModePage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [controlDatasetId, setControlDatasetId] = useState('');
  const [treatmentDatasetId, setTreatmentDatasetId] = useState('');
  const [exampleLimit, setExampleLimit] = useState(5);
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const rows = await fetchDatasets();
        setDatasets(rows || []);
      } catch (err) {
        setError(String(err));
      }
    };

    loadDatasets();
  }, []);

  const startStudy = () => {
    setError('');

    if (!controlDatasetId || !treatmentDatasetId) {
      setError('Please choose both a control dataset and a treatment dataset.');
      return;
    }

    if (controlDatasetId === treatmentDatasetId) {
      setError('Control and treatment datasets must be different to avoid familiarity bias.');
      return;
    }

    const numericLimit = Number(exampleLimit);

    if (!numericLimit || numericLimit <= 0) {
      setError('Please choose a valid example limit greater than 0.');
      return;
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const controlDataset = datasets.find((dataset) => String(dataset.dataset_id) === String(controlDatasetId));
    const treatmentDataset = datasets.find((dataset) => String(dataset.dataset_id) === String(treatmentDatasetId));

    const studyFlow = {
      enabled: true,
      runId,
      shuffle: shuffleEnabled,
      currentPart: 0,
      exampleLimit: numericLimit,
      controlDatasetId: Number(controlDatasetId),
      treatmentDatasetId: Number(treatmentDatasetId),
      controlDatasetName: controlDataset?.dataset_name || `Dataset ${controlDatasetId}`,
      treatmentDatasetName: treatmentDataset?.dataset_name || `Dataset ${treatmentDatasetId}`,
      parts: shuffleEnabled
        ? [
            {
              key: 'mixed',
              title: 'Shuffled Mixed Session',
              mode: 'mixed',
              datasetId: Number(treatmentDatasetId),
              description: 'Control and treatment examples are mixed into one continuous session.'
            }
          ]
        : [
            {
              key: 'control',
              title: 'Control Session (Predictions hidden)',
              mode: 'control',
              datasetId: Number(controlDatasetId),
              description: 'Annotate transcripts without pre-filled segmentation or gloss predictions.'
            },
            {
              key: 'treatment',
              title: 'Treatment Session (Predictions shown)',
              mode: 'treatment',
              datasetId: Number(treatmentDatasetId),
              description: 'Annotate transcripts with visible model predictions.'
            }
          ]
    };

    const firstPart = studyFlow.parts[0];

    navigate(`/gloss/${firstPart.datasetId}/1`, {
      state: {
        studyFlow,
        datasetId: Number(firstPart.datasetId),
        exampleLimit: numericLimit,
        mode: firstPart.mode
      }
    });
  };

  return (
    <section className="study-page">
      <div className="study-card">
        <h2>User Study Mode</h2>
        <p>
          Pick independent datasets for control and treatment, then choose whether to run
          two sequential sessions or a single shuffled mixed session.
        </p>

        {error && <p className="status-error">{error}</p>}

        <div className="data-controls" style={{ marginBottom: '1rem' }}>
          <label htmlFor="controlDataset">Control Dataset (predictions hidden)</label>
          <select
            id="controlDataset"
            value={controlDatasetId}
            onChange={(event) => setControlDatasetId(event.target.value)}
          >
            <option value="">--Select a dataset--</option>
            {datasets.map((dataset) => (
              <option key={dataset.dataset_id} value={dataset.dataset_id}>
                {dataset.dataset_name} ({dataset.language})
              </option>
            ))}
          </select>

          <label htmlFor="treatmentDataset">Treatment Dataset (predictions shown)</label>
          <select
            id="treatmentDataset"
            value={treatmentDatasetId}
            onChange={(event) => setTreatmentDatasetId(event.target.value)}
          >
            <option value="">--Select a dataset--</option>
            {datasets.map((dataset) => (
              <option key={dataset.dataset_id} value={dataset.dataset_id}>
                {dataset.dataset_name} ({dataset.language})
              </option>
            ))}
          </select>

          <label htmlFor="studyLimit">Examples Per Session</label>
          <input
            id="studyLimit"
            type="number"
            min="1"
            value={exampleLimit}
            onChange={(event) => setExampleLimit(event.target.value)}
          />

          <label htmlFor="studyShuffle">Shuffle Control and Treatment Into One Session</label>
          <select
            id="studyShuffle"
            value={shuffleEnabled ? 'yes' : 'no'}
            onChange={(event) => setShuffleEnabled(event.target.value === 'yes')}
          >
            <option value="no">No (run control then treatment)</option>
            <option value="yes">Yes (mixed single session)</option>
          </select>
        </div>

        <ol className="study-list">
          <li>
            <strong>Control</strong>
            <p>Transcript only. Segmentation and gloss start empty even if dataset includes predictions.</p>
          </li>
          <li>
            <strong>Treatment</strong>
            <p>Transcript with segmentation and gloss pre-populated from the treatment dataset.</p>
          </li>
          <li>
            <strong>Shuffle Option</strong>
            <p>Mixes control and treatment examples in one timeline and saves a single comparison-ready session.</p>
          </li>
        </ol>

        <button className="btn-solid" onClick={startStudy}>Start Study</button>
      </div>
    </section>
  );
}

export default StudyModePage;
