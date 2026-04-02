import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchGlosses } from "../utils/api";
import "../styles/GlossingPage.css";

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
  
  const currentIndex = parseInt(example_num) - 1;
  const currentGloss = glosses[currentIndex];

  const formatTime = (seconds) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
            source: gloss.source || 'Unknown' // Track source
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

  // 2. Initialize View
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
      
      if (submittedIndices.has(currentIndex)) {
        setIsPaused(true);
      } else {
        setIsPaused(false);
      }
    }
  }, [currentIndex, glosses.length, currentGloss, allOriginalData, allEdits, submittedIndices]);

  // 3. Timer Logic
  useEffect(() => {
    let interval;
    const isSubmitted = submittedIndices.has(currentIndex);
    
    if (!isPaused && !loading && !isSubmitted) {
      interval = setInterval(() => {
        setTimers(prevTimers => ({
          ...prevTimers,
          [currentIndex]: (prevTimers[currentIndex] || 0) + 1
        }));
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

  const handleSubmitExample = () => {
    const newEdits = {
      ...allEdits,
      [currentIndex]: {
        words: wordEdits,
        translation: editedTranslation,
        source: currentGloss.source // Ensure source is saved with edits
      }
    };
    setAllEdits(newEdits);

    const newSubmitted = new Set(submittedIndices);
    newSubmitted.add(currentIndex);
    setSubmittedIndices(newSubmitted);
    setIsPaused(true);

    if (currentIndex < glosses.length - 1) {
      navigate(`/gloss/${language}/${currentIndex + 2}`);
    }
  };

  // --- CSV Export Logic ---
  const downloadCSV = () => {
    if (!sessionData) return;

    // Define CSV Headers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Example_ID,Source,Word_Index,Segmentation,Gloss,Translation,Time_Spent_Sec\n";

    // Iterate through all submitted data
    Object.entries(sessionData.finalData).forEach(([idx, data]) => {
      const exampleId = parseInt(idx) + 1;
      const source = data.source || allOriginalData[idx]?.source || 'Unknown';
      const time = sessionData.exampleTimes[idx] || 0;
      // Escape quotes for CSV
      const cleanTrans = data.translation ? `"${data.translation.replace(/"/g, '""')}"` : "";

      // Add a row for each word
      Object.entries(data.words).forEach(([wIdx, wordData]) => {
        const row = [
          exampleId,
          source,
          parseInt(wIdx) + 1,
          wordData.segmentation,
          wordData.gloss,
          cleanTrans,
          time
        ];
        csvContent += row.join(",") + "\n";
      });
    });

    // Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${language}_glossing_session_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      
      // Ensure source is carried over to final data
      finalData[index] = {
        ...finalState,
        source: gloss.source || 'Unknown'
      };

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

    const results = {
      language,
      totalExamples: glosses.length,
      exampleTimes: timers,
      exampleEdits,
      finalData,
      totalTime: Object.values(timers).reduce((a, b) => a + b, 0),
      totalEdits: Object.values(exampleEdits).reduce((a, b) => a + b, 0),
      completedAt: new Date().toISOString()
    };
    
    setSessionData(results);
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
             <button className="btn btn-secondary" onClick={downloadCSV}>
               📥 Download CSV
             </button>
             <button 
                className="btn btn-primary"
                onClick={() => console.log(sessionData)}
             >
               Log to Console
             </button>
          </div>
          <div style={{marginTop: '20px'}}>
            <Link to="/dashboard" className="link-simple">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  const isCurrentSubmitted = submittedIndices.has(currentIndex);
  const allSubmitted = submittedIndices.size === glosses.length;
  const currentExampleTime = timers[currentIndex] || 0;

  return (
    <div className="glossing-page">
      <div className="glossing-header">
        <button onClick={() => navigate('/dashboard')} className="btn-exit">
          ← Exit Session
        </button>
        <h2>{language} Glossing</h2>
        
        <div className="timer-display">
          {formatTime(currentExampleTime)}
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
            {Object.entries(wordEdits).map(([key, data]) => (
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
                    <input 
                        value={data.gloss} 
                        onChange={(e) => handleWordEdit(key, 'gloss', e.target.value)}
                        disabled={isCurrentSubmitted}
                    />
                 </div>
              </div>
            ))}
          </div>

          <div className="translation-section">
            <span className="input-label">Full Translation</span>
            <textarea
              value={editedTranslation}
              onChange={(e) => {
                 if (isPaused) setIsPaused(false);
                 setEditedTranslation(e.target.value);
              }}
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
            <button 
                className="btn btn-success"
                onClick={handleSubmitExample}
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

export default GlossingPage;