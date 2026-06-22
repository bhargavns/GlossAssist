import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchGlosses, fetchCorrectionsAPI, submitCorrections, predictGloss } from "../utils/api";
import { getCurrentUsername } from "../utils/auth";
import "../styles/GlossingPage.css";

// ─── GlossInput (unchanged from original) ────────────────────────────────────
function GlossInput({ value, segmentation, modelPrediction, suggestions = [], onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (gloss) => { onChange(gloss); setOpen(false); };

  const userSuggestions = suggestions.filter(s => s.gloss !== modelPrediction);
  const hasOptions = modelPrediction || userSuggestions.length > 0;

  return (
    <div className="gloss-input-wrapper" ref={containerRef}>
      <div className="gloss-input-row">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => hasOptions && setOpen(true)}
          disabled={disabled}
        />
        {hasOptions && !disabled && (
          <button
            className="gloss-dropdown-toggle"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
            aria-label="Show suggestions"
          >▾</button>
        )}
      </div>

      {open && !disabled && (
        <ul className="gloss-suggestions">
          {modelPrediction && (
            <li
              className={`suggestion-item suggestion-model ${value === modelPrediction ? 'active' : ''}`}
              onMouseDown={() => handleSelect(modelPrediction)}
            >
              <span className="suggestion-label">Model</span>
              <span className="suggestion-gloss">{modelPrediction}</span>
            </li>
          )}
          {modelPrediction && userSuggestions.length > 0 && <li className="suggestion-divider" />}
          {userSuggestions.map(({ gloss, count }) => (
            <li
              key={gloss}
              className={`suggestion-item suggestion-user ${value === gloss ? 'active' : ''}`}
              onMouseDown={() => handleSelect(gloss)}
            >
              <span className="suggestion-gloss">{gloss}</span>
              <span className="suggestion-count">×{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main LiveGlossingPage ───────────────────────────────────────────────────
function LiveGlossingPage() {
  const { language, model, example_num } = useParams();
  const navigate = useNavigate();

  // --- Data ---
  const [glosses, setGlosses] = useState([]);          // raw examples (transcript + source)
  const [loading, setLoading] = useState(true);         // initial fetch
  const [error, setError] = useState(null);

  // --- Per-example prediction state ---
  const [predicting, setPredicting] = useState(false);
  const [predictionError, setPredictionError] = useState(null);

  // --- Session & Timer ---
  const [timers, setTimers] = useState({});
  const [isPaused, setIsPaused] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  // --- Tracking ---
  const [submittedIndices, setSubmittedIndices] = useState(new Set());
  const [allOriginalData, setAllOriginalData] = useState({});
  const [allEdits, setAllEdits] = useState({});

  // --- Current View (Draft) ---
  const [wordEdits, setWordEdits] = useState({});
  const [editedTranslation, setEditedTranslation] = useState("");

  // --- Corrections Cache ---
  const [correctionsCache, setCorrectionsCache] = useState({});

  const currentIndex = parseInt(example_num) - 1;
  const currentGloss = glosses[currentIndex];

  const formatTime = (seconds) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Fetch corrections for a segment ──
  const fetchCorrections = useCallback(async (segmentation) => {
    if (!segmentation || !language) return;
    try {
      const data = await fetchCorrectionsAPI(language, segmentation);
      setCorrectionsCache(prev => ({ ...prev, [segmentation]: data }));
    } catch { /* non-critical */ }
  }, [language]);

  // ── Run prediction for a given example index ──
  const runPrediction = useCallback(async (index) => {
    const example = glosses[index];
    if (!example || !model) return;

    setPredicting(true);
    setPredictionError(null);

    try {
      const result = await predictGloss(model, example.transcript, language);
      // result: { segmentation: "mor-phe-me ...", gloss: "GLOSS1 GLOSS2 ..." }

      // Build word-level data from the prediction
      const segWords = result.segmentation ? result.segmentation.split(/\s+/) : [];
      const glossWords = result.gloss ? result.gloss.split(/\s+/) : [];
      const maxLength = Math.max(segWords.length, glossWords.length);

      const wordData = {};
      for (let i = 0; i < maxLength; i++) {
        wordData[i] = {
          segmentation: segWords[i] || '',
          gloss: glossWords[i] || '',
        };
      }

      // Store as "original" (model prediction baseline) for this example
      setAllOriginalData(prev => ({
        ...prev,
        [index]: {
          words: wordData,
          translation: example.translation || '',
          source: example.source || 'Unknown',
        },
      }));

      // If the user hasn't already edited this example, populate the work area
      setAllEdits(prev => {
        if (!prev[index]) {
          // First time — also set current view if this is the active example
          setWordEdits(wordData);
          setEditedTranslation(example.translation || '');
        }
        return prev;
      });

      // Pre-fetch corrections for every predicted segment
      segWords.forEach(seg => { if (seg) fetchCorrections(seg); });
    } catch (err) {
      setPredictionError(err.message || 'Prediction failed');
    } finally {
      setPredicting(false);
    }
  }, [glosses, model, language, fetchCorrections]);

  // ── 1. Load examples (transcripts only — no pre-computed glosses) ──
  useEffect(() => {
    const loadGlosses = async () => {
      try {
        setLoading(true);
        const response = await fetchGlosses({ datasetId: Number(language), limit: 100, mode: 'treatment' });
        const rows = response.data || [];
        setGlosses(rows);

        const initialTimers = {};
        rows.forEach((_, index) => { initialTimers[index] = 0; });
        setTimers(initialTimers);

        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    if (language) loadGlosses();
  }, [language]);

  // ── 2. On navigation to a new example: run prediction (unless already cached or edited) ──
  useEffect(() => {
    if (loading || !currentGloss) return;

    // Restore previously saved edits if they exist
    const savedEdits = allEdits[currentIndex];
    if (savedEdits) {
      setWordEdits(savedEdits.words);
      setEditedTranslation(savedEdits.translation);
      setIsPaused(submittedIndices.has(currentIndex));
      return; // already edited — no need to re-predict
    }

    // Restore from a cached prediction (user navigated back without editing)
    const cachedOriginal = allOriginalData[currentIndex];
    if (cachedOriginal) {
      setWordEdits(cachedOriginal.words);
      setEditedTranslation(cachedOriginal.translation);
      setIsPaused(submittedIndices.has(currentIndex));
      return;
    }

    // No data yet — run live inference
    runPrediction(currentIndex);
    setIsPaused(false);
  }, [
    currentIndex,
    loading,
    currentGloss,
    allEdits,
    allOriginalData,
    submittedIndices,
    runPrediction
  ]);

  // ── 3. Timer ──
  useEffect(() => {
    let interval;
    if (!isPaused && !loading && !predicting && !submittedIndices.has(currentIndex)) {
      interval = setInterval(() => {
        setTimers(prev => ({ ...prev, [currentIndex]: (prev[currentIndex] || 0) + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPaused, loading, predicting, currentIndex, submittedIndices]);

  // ── 4. Input handlers ──
  const handleWordEdit = (wordIndex, field, value) => {
    if (isPaused) setIsPaused(false);
    setWordEdits(prev => ({
      ...prev,
      [wordIndex]: { ...prev[wordIndex], [field]: value },
    }));
  };

  // ── 5. Submit — save edits, post corrections, then navigate ──
  const handleSubmitExample = async () => {
    const newEdits = {
      ...allEdits,
      [currentIndex]: {
        words: wordEdits,
        translation: editedTranslation,
        source: currentGloss.source,
      },
    };
    setAllEdits(newEdits);

    const newSubmitted = new Set(submittedIndices);
    newSubmitted.add(currentIndex);
    setSubmittedIndices(newSubmitted);
    setIsPaused(true);

    // Collect changed glosses for the corrections codebook
    const original = allOriginalData[currentIndex];
    const changed = [];
    if (original) {
      Object.entries(wordEdits).forEach(([wIdx, wordData]) => {
        const origGloss = original.words[wIdx]?.gloss;
        if (wordData.gloss && wordData.gloss !== origGloss) {
          changed.push({ segmentation: wordData.segmentation, gloss: wordData.gloss });
        }
      });
    }

    if (changed.length > 0) {
      try {
        await submitCorrections(language, changed);
        await Promise.all(changed.map(c => fetchCorrections(c.segmentation)));
      } catch (err) {
        console.warn('Failed to save corrections:', err);
      }
    }

    // Navigate to next example — this triggers a fresh prediction via the useEffect
    if (currentIndex < glosses.length - 1) {
      // Invalidate the cached prediction for the next example so we get a fresh one
      // that incorporates the corrections we just submitted
      const nextIndex = currentIndex + 1;
      if (!allEdits[nextIndex]) {
        // Clear cached original so the useEffect will re-run prediction
        setAllOriginalData(prev => {
          const copy = { ...prev };
          delete copy[nextIndex];
          return copy;
        });
      }

      navigate(`/gloss-live/${language}/${model}/${nextIndex + 1}`);
    }
  };

  // ── 6. CSV Export ──
  const downloadCSV = () => {
    if (!sessionData) return;
    const usernameCell = sessionData.username
      ? `"${sessionData.username.replace(/"/g, '""')}"`
      : 'anonymous';
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Username,Example_ID,Source,Word_Index,Segmentation,Gloss,Translation,Time_Spent_Sec\n";
    Object.entries(sessionData.finalData).forEach(([idx, data]) => {
      const exampleId = parseInt(idx) + 1;
      const source = data.source || 'Unknown';
      const time = sessionData.exampleTimes[idx] || 0;
      const cleanTrans = data.translation ? `"${data.translation.replace(/"/g, '""')}"` : "";
      Object.entries(data.words).forEach(([wIdx, wordData]) => {
        csvContent += [
          usernameCell, exampleId, source, parseInt(wIdx) + 1,
          wordData.segmentation, wordData.gloss, cleanTrans, time,
        ].join(",") + "\n";
      });
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${language}_${model}_live_session_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── 7. Finish Session ──
  const handleFinishSession = () => {
    if (submittedIndices.size !== glosses.length) {
      alert("Please submit all examples before finishing.");
      return;
    }
    const exampleEdits = {};
    const finalData = {};
    glosses.forEach((gloss, index) => {
      const finalState = allEdits[index] || allOriginalData[index];
      const originalState = allOriginalData[index];
      finalData[index] = { ...finalState, source: gloss.source || 'Unknown' };
      let editCount = 0;
      if (finalState && originalState) {
        Object.keys(finalState.words).forEach(wIdx => {
          const wFinal = finalState.words[wIdx];
          const wOrig = originalState.words[wIdx];
          if (!wOrig) return;
          if (wFinal.segmentation !== wOrig.segmentation) editCount++;
          if (wFinal.gloss !== wOrig.gloss) editCount++;
        });
        if (finalState.translation !== originalState.translation) editCount++;
      }
      exampleEdits[index] = editCount;
    });
    setSessionData({
      username: getCurrentUsername(),
      language,
      model,
      totalExamples: glosses.length,
      exampleTimes: timers,
      exampleEdits,
      finalData,
      totalTime: Object.values(timers).reduce((a, b) => a + b, 0),
      totalEdits: Object.values(exampleEdits).reduce((a, b) => a + b, 0),
      completedAt: new Date().toISOString(),
    });
    setSessionComplete(true);
  };

  // ── Render: Loading / Error / Session Complete ──
  if (loading) return <div className="loading-container">Loading examples...</div>;
  if (error) return <div className="error-container">Error: {error.message}</div>;

  if (sessionComplete && sessionData) {
    return (
      <div className="session-complete-container">
        <div className="session-complete-card">
          <h2>✅ Session Complete!</h2>
          <div className="session-stats">
            <p><strong>Model:</strong> {sessionData.model}</p>
            <p><strong>Total Edits:</strong> {sessionData.totalEdits}</p>
            <p><strong>Total Time:</strong> {formatTime(sessionData.totalTime)}</p>
          </div>
          <div className="session-actions">
            <button className="btn btn-secondary" onClick={downloadCSV}>📥 Download CSV</button>
            <button className="btn btn-primary" onClick={() => console.log(sessionData)}>Log to Console</button>
          </div>
          <div style={{ marginTop: '20px' }}>
            <Link to="/glossing" className="link-simple">Back to Glossing</Link>
          </div>
        </div>
      </div>
    );
  }

  const isCurrentSubmitted = submittedIndices.has(currentIndex);
  const allSubmitted = submittedIndices.size === glosses.length;

  return (
    <div className="glossing-page">
      {/* ── Header ── */}
      <div className="glossing-header">
        <button onClick={() => navigate('/glossing')} className="btn-exit">← Exit Session</button>
        <h2>
          {language} Glossing
          <span className="model-badge">{model}</span>
        </h2>
        <div className="timer-display">
          {formatTime(timers[currentIndex] || 0)}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="btn-icon"
            disabled={isCurrentSubmitted || predicting}
          >
            {isPaused || isCurrentSubmitted ? "▶" : "⏸"}
          </button>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      <div className="progress-bar-container">
        <div className="progress-segments">
          {glosses.map((_, idx) => (
            <div
              key={idx}
              className={`progress-segment ${submittedIndices.has(idx) ? 'completed' : ''} ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => navigate(`/gloss-live/${language}/${model}/${idx + 1}`)}
              title={`Example ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="glossing-container">
        {/* Left: Source Info */}
        <div className="text-side">
          <h3>Source Info</h3>
          <div className="source-badge">
            {currentGloss?.source ? currentGloss.source.toUpperCase() : 'UNKNOWN'}
          </div>
          <h3>Transcript</h3>
          <div className="transcript-box">{currentGloss?.transcript}</div>
        </div>

        {/* Center: Work Area */}
        <div className="glossing-side">
          <h3>
            Work Area
            {isCurrentSubmitted && <span className="badge-submitted">Submitted</span>}
            {predicting && <span className="badge-predicting">Predicting…</span>}
          </h3>

          {/* Prediction spinner overlay */}
          {predicting ? (
            <div className="prediction-loading">
              <div className="spinner" />
              <p>Running model inference…</p>
            </div>
          ) : predictionError && !allOriginalData[currentIndex] ? (
            <div className="prediction-error">
              <p>⚠ Prediction failed: {predictionError}</p>
              <button className="btn btn-secondary" onClick={() => runPrediction(currentIndex)}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="word-breakdown">
                {Object.entries(wordEdits).map(([key, data]) => {
                  const modelGloss = allOriginalData[currentIndex]?.words[key]?.gloss || '';
                  return (
                    <div key={key} className="word-card">
                      <div className="word-card-header">Word {parseInt(key) + 1}</div>

                      <div className="input-group">
                        <span className="input-label label-seg">Segmentation</span>
                        <input
                          value={data.segmentation}
                          onChange={(e) => handleWordEdit(key, 'segmentation', e.target.value)}
                          disabled={isCurrentSubmitted}
                        />
                      </div>

                      <div className="input-group">
                        <span className="input-label label-gloss">Gloss</span>
                        <GlossInput
                          value={data.gloss}
                          segmentation={data.segmentation}
                          modelPrediction={modelGloss}
                          suggestions={correctionsCache[data.segmentation] || []}
                          onChange={(val) => handleWordEdit(key, 'gloss', val)}
                          disabled={isCurrentSubmitted}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="translation-section">
                <span className="input-label">Full Translation</span>
                <textarea
                  value={editedTranslation}
                  onChange={(e) => { if (isPaused) setIsPaused(false); setEditedTranslation(e.target.value); }}
                  disabled={isCurrentSubmitted}
                />
              </div>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="action-side">
          <div className="nav-controls">
            <button
              disabled={currentIndex === 0}
              onClick={() => navigate(`/gloss-live/${language}/${model}/${currentIndex}`)}
            >
              ← Prev
            </button>
            <button
              disabled={currentIndex === glosses.length - 1}
              onClick={() => navigate(`/gloss-live/${language}/${model}/${currentIndex + 2}`)}
            >
              Next →
            </button>
          </div>

          <hr />

          {isCurrentSubmitted ? (
            <button
              className="btn btn-warning"
              onClick={() => {
                const newSet = new Set(submittedIndices);
                newSet.delete(currentIndex);
                setSubmittedIndices(newSet);
                setIsPaused(false);
              }}
            >
              Edit Again
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={handleSubmitExample}
              disabled={predicting}
            >
              Submit Example
            </button>
          )}

          <div className="submit-area">
            <p>Submitted: {submittedIndices.size} / {glosses.length}</p>
            <button
              className="btn btn-finish"
              disabled={!allSubmitted}
              onClick={handleFinishSession}
            >
              Finish Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveGlossingPage;