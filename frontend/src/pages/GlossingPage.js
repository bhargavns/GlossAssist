import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchGlosses, fetchCorrectionsAPI, submitCorrections } from "../utils/api";
import "../styles/GlossingPage.css";

// --- GlossInput: text input + correction dropdown for a single gloss cell ---
// suggestions come from parent cache — no internal fetching
function GlossInput({ value, segmentation, modelPrediction, suggestions = [], onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (gloss) => {
    onChange(gloss);
    setOpen(false);
  };

  // Deduplicate: user corrections that differ from model prediction
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
          >
            ▾
          </button>
        )}
      </div>

      {open && !disabled && (
        <ul className="gloss-suggestions">
          {/* Model prediction — always pinned at top */}
          {modelPrediction && (
            <li
              className={`suggestion-item suggestion-model ${value === modelPrediction ? 'active' : ''}`}
              onMouseDown={() => handleSelect(modelPrediction)}
            >
              <span className="suggestion-label">Model</span>
              <span className="suggestion-gloss">{modelPrediction}</span>
            </li>
          )}

          {/* Divider only if there are also user corrections */}
          {modelPrediction && userSuggestions.length > 0 && (
            <li className="suggestion-divider" />
          )}

          {/* User corrections sorted by frequency (desc from API) */}
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

// --- Main GlossingPage ---
function GlossingPage() {
  const { language, example_num } = useParams();
  const navigate = useNavigate();

  // --- Data States ---
  const [glosses, setGlosses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Session & Timer States ---
  const [timers, setTimers] = useState({});
  const [isPaused, setIsPaused] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  // --- Tracking States ---
  const [submittedIndices, setSubmittedIndices] = useState(new Set());
  const [allOriginalData, setAllOriginalData] = useState({});
  const [allEdits, setAllEdits] = useState({});

  // --- Current View States (Draft) ---
  const [wordEdits, setWordEdits] = useState({});
  const [editedTranslation, setEditedTranslation] = useState("");

  // --- Corrections Cache: { [segmentation]: [{gloss, count}] } ---
  const [correctionsCache, setCorrectionsCache] = useState({});

  const currentIndex = parseInt(example_num) - 1;
  const currentGloss = glosses[currentIndex];

  const formatTime = (seconds) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Fetch corrections for a single segmentation string and merge into cache ---
  const fetchCorrections = useCallback(async (segmentation) => {
    if (!segmentation || !language) return;
    try {
      const data = await fetchCorrectionsAPI(language, segmentation);
      setCorrectionsCache(prev => ({ ...prev, [segmentation]: data }));
    } catch {
      // silently fail — corrections are a UX enhancement, not critical
    }
  }, [language]);

  // 1. Load Glosses
  useEffect(() => {
    const loadGlosses = async () => {
      try {
        setLoading(true);
        const data = await fetchGlosses(language, 100);
        setGlosses(data);

        const initialTimers = {};
        const allOriginals = {};

        data.forEach((gloss, index) => {
          initialTimers[index] = 0;
          const segWords = gloss.segmentation ? gloss.segmentation.split(/\s+/) : [];
          const glossWords = gloss.gloss ? gloss.gloss.split(/\s+/) : [];
          const maxLength = Math.max(segWords.length, glossWords.length);

          const wordData = {};
          for (let i = 0; i < maxLength; i++) {
            wordData[i] = {
              segmentation: segWords[i] || '',
              gloss: glossWords[i] || ''
            };
          }

          allOriginals[index] = {
            words: wordData,
            translation: gloss.translation || '',
            source: gloss.source || 'Unknown'
          };
        });

        setTimers(initialTimers);
        setAllOriginalData(allOriginals);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    if (language) loadGlosses();
  }, [language]);

  // 2. Initialize View + pre-fetch corrections for current example's segments
  useEffect(() => {
    if (currentGloss) {
      const savedData = allEdits[currentIndex];
      const original = allOriginalData[currentIndex];

      if (savedData) {
        setWordEdits(savedData.words);
        setEditedTranslation(savedData.translation);
      } else if (original) {
        setWordEdits(original.words);
        setEditedTranslation(original.translation);
      }

      setIsPaused(submittedIndices.has(currentIndex));

      // Pre-fetch corrections for every segment in this example
      if (!loading) {
        const segs = currentGloss.segmentation ? currentGloss.segmentation.split(/\s+/) : [];
        segs.forEach(seg => { if (seg) fetchCorrections(seg); });
      }
    }
  }, [currentIndex, glosses.length, currentGloss, allOriginalData, allEdits, submittedIndices, loading, fetchCorrections]);

  // 3. Timer
  useEffect(() => {
    let interval;
    if (!isPaused && !loading && !submittedIndices.has(currentIndex)) {
      interval = setInterval(() => {
        setTimers(prev => ({ ...prev, [currentIndex]: (prev[currentIndex] || 0) + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPaused, loading, currentIndex, submittedIndices]);

  // 4. Input Handlers
  const handleWordEdit = (wordIndex, field, value) => {
    if (isPaused) setIsPaused(false);
    setWordEdits(prev => ({
      ...prev,
      [wordIndex]: { ...prev[wordIndex], [field]: value }
    }));
  };

  // 5. Submit — save edits locally AND post changed glosses to /api/corrections,
  //    then immediately refresh the cache for those segments so future examples see them
  const handleSubmitExample = async () => {
    const newEdits = {
      ...allEdits,
      [currentIndex]: {
        words: wordEdits,
        translation: editedTranslation,
        source: currentGloss.source
      }
    };
    setAllEdits(newEdits);

    const newSubmitted = new Set(submittedIndices);
    newSubmitted.add(currentIndex);
    setSubmittedIndices(newSubmitted);
    setIsPaused(true);

    // Collect changed glosses to record as corrections
    const original = allOriginalData[currentIndex];
    const changed = [];
    if (original) {
      Object.entries(wordEdits).forEach(([wIdx, wordData]) => {
        const origGloss = original.words[wIdx]?.gloss;
        if (wordData.gloss && wordData.gloss !== origGloss) {
          changed.push({
            segmentation: wordData.segmentation,
            gloss: wordData.gloss
          });
        }
      });
    }

    if (changed.length > 0) {
      try {
        await submitCorrections(language, changed);
        // Immediately refresh the cache for every corrected segment
        // so the next example that shares this morpheme sees it right away
        await Promise.all(changed.map(c => fetchCorrections(c.segmentation)));
      } catch (err) {
        console.warn('Failed to save corrections:', err);
      }
    }

    if (currentIndex < glosses.length - 1) {
      navigate(`/gloss/${language}/${currentIndex + 2}`);
    }
  };

  // 6. CSV Export
  const downloadCSV = () => {
    if (!sessionData) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Example_ID,Source,Word_Index,Segmentation,Gloss,Translation,Time_Spent_Sec\n";
    Object.entries(sessionData.finalData).forEach(([idx, data]) => {
      const exampleId = parseInt(idx) + 1;
      const source = data.source || 'Unknown';
      const time = sessionData.exampleTimes[idx] || 0;
      const cleanTrans = data.translation ? `"${data.translation.replace(/"/g, '""')}"` : "";
      Object.entries(data.words).forEach(([wIdx, wordData]) => {
        csvContent += [
          exampleId, source, parseInt(wIdx) + 1,
          wordData.segmentation, wordData.gloss, cleanTrans, time
        ].join(",") + "\n";
      });
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${language}_glossing_session_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 7. Finish Session
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
      language,
      totalExamples: glosses.length,
      exampleTimes: timers,
      exampleEdits,
      finalData,
      totalTime: Object.values(timers).reduce((a, b) => a + b, 0),
      totalEdits: Object.values(exampleEdits).reduce((a, b) => a + b, 0),
      completedAt: new Date().toISOString()
    });
    setSessionComplete(true);
  };

  if (loading) return <div className="loading-container">Loading glosses...</div>;
  if (error) return <div className="error-container">Error: {error.message}</div>;

  if (sessionComplete && sessionData) {
    return (
      <div className="session-complete-container">
        <div className="session-complete-card">
          <h2>✅ Session Complete!</h2>
          <div className="session-stats">
            <p><strong>Total Edits:</strong> {sessionData.totalEdits}</p>
            <p><strong>Total Time:</strong> {formatTime(sessionData.totalTime)}</p>
          </div>
          <div className="session-actions">
            <button className="btn btn-secondary" onClick={downloadCSV}>📥 Download CSV</button>
            <button className="btn btn-primary" onClick={() => console.log(sessionData)}>Log to Console</button>
          </div>
          <div style={{ marginTop: '20px' }}>
            <Link to="/dashboard" className="link-simple">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  const isCurrentSubmitted = submittedIndices.has(currentIndex);
  const allSubmitted = submittedIndices.size === glosses.length;

  return (
    <div className="glossing-page">
      <div className="glossing-header">
        <button onClick={() => navigate('/dashboard')} className="btn-exit">← Exit Session</button>
        <h2>{language} Glossing</h2>
        <div className="timer-display">
          {formatTime(timers[currentIndex] || 0)}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="btn-icon"
            disabled={isCurrentSubmitted}
          >
            {isPaused || isCurrentSubmitted ? "▶" : "⏸"}
          </button>
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-segments">
          {glosses.map((_, idx) => (
            <div
              key={idx}
              className={`progress-segment ${submittedIndices.has(idx) ? 'completed' : ''} ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => navigate(`/gloss/${language}/${idx + 1}`)}
              title={`Example ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="glossing-container">
        <div className="text-side">
          <h3>Source Info</h3>
          <div className="source-badge">
            {currentGloss?.source ? currentGloss.source.toUpperCase() : 'UNKNOWN'}
          </div>
          <h3>Transcript</h3>
          <div className="transcript-box">{currentGloss?.transcript}</div>
        </div>

        <div className="glossing-side">
          <h3>
            Work Area
            {isCurrentSubmitted && <span className="badge-submitted">Submitted</span>}
          </h3>

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
        </div>

        <div className="action-side">
          <div className="nav-controls">
            <button
              disabled={currentIndex === 0}
              onClick={() => navigate(`/gloss/${language}/${currentIndex}`)}
            >
              ← Prev
            </button>
            <button
              disabled={currentIndex === glosses.length - 1}
              onClick={() => navigate(`/gloss/${language}/${currentIndex + 2}`)}
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
            <button className="btn btn-success" onClick={handleSubmitExample}>
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

export default GlossingPage;