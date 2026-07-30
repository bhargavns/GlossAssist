import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  fetchCorrectionsAPI,
  fetchGlosses,
  fetchStudyComparisonReport,
  fetchStudySessionExport,
  saveStudySession,
  submitStudySessionFeedback,
  updateDatasetRow,
  submitCorrections
} from "../utils/api";
import { getCurrentUsername } from "../utils/auth";
import { interviewQuestions, surveyQuestionSections } from "../data/studyFeedbackQuestions";
import { selectBalancedStudyExamples } from "../utils/studyExamples";
import "../styles/GlossingPage.css";

function GlossInput({ value, modelPrediction, suggestions = [], onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const userSuggestions = suggestions.filter((item) => item.gloss !== modelPrediction);
  const hasOptions = Boolean(modelPrediction) || userSuggestions.length > 0;

  return (
    <div className="gloss-input-wrapper" ref={containerRef}>
      <div className="gloss-input-row">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => hasOptions && setOpen(true)}
          disabled={disabled}
        />
        {hasOptions && !disabled && (
          <button
            className="gloss-dropdown-toggle"
            tabIndex={-1}
            onMouseDown={(event) => {
              event.preventDefault();
              setOpen((current) => !current);
            }}
            aria-label="Show suggestions"
          >
            ▾
          </button>
        )}
      </div>

      {open && !disabled && (
        <ul className="gloss-suggestions">
          {modelPrediction && (
            <li
              className={`suggestion-item suggestion-model ${value === modelPrediction ? "active" : ""}`}
              onMouseDown={() => {
                onChange(modelPrediction);
                setOpen(false);
              }}
            >
              <span className="suggestion-label">Model</span>
              <span className="suggestion-gloss">{modelPrediction}</span>
            </li>
          )}

          {modelPrediction && userSuggestions.length > 0 && <li className="suggestion-divider" />}

          {userSuggestions.map(({ gloss, count }) => (
            <li
              key={gloss}
              className={`suggestion-item suggestion-user ${value === gloss ? "active" : ""}`}
              onMouseDown={() => {
                onChange(gloss);
                setOpen(false);
              }}
            >
              <span className="suggestion-gloss">{gloss}</span>
              <span className="suggestion-count">x{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  return String(err);
}

function buildWordData(example) {
  const transcriptWords = example.transcript ? example.transcript.trim().split(/\s+/) : [];
  const segWords = example.segmentation ? example.segmentation.split(/\s+/) : [];
  const glossWords = example.gloss ? example.gloss.split(/\s+/) : [];
  const maxLength = Math.max(transcriptWords.length, segWords.length, glossWords.length, 1);

  const wordData = {};
  for (let i = 0; i < maxLength; i += 1) {
    wordData[i] = {
      segmentation: segWords[i] || "",
      gloss: glossWords[i] || ""
    };
  }
  return wordData;
}

function GlossingPage() {
  const { language: datasetParam, example_num } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const studyFlow = location.state?.studyFlow || null;
  const isStudy = Boolean(studyFlow?.enabled);
  const isShuffleStudy = Boolean(studyFlow?.shuffle);
  const currentPart = studyFlow?.currentPart || 0;
  const activePart = studyFlow?.parts?.[currentPart] || null;

  const mode = (location.state?.mode || activePart?.mode || "treatment").toLowerCase();
  const datasetId = Number(location.state?.datasetId || activePart?.datasetId || datasetParam || 0);
  const exampleLimit = Number(location.state?.exampleLimit || studyFlow?.exampleLimit || 100);
  const randomSample = Boolean(location.state?.randomSample ?? studyFlow?.randomSample);

  const runId = studyFlow?.runId || null;
  const controlDatasetId = Number(studyFlow?.controlDatasetId || 0) || null;
  const treatmentDatasetId = Number(studyFlow?.treatmentDatasetId || 0) || null;

  const hasNextStudyPart = Boolean(
    isStudy && !isShuffleStudy && Array.isArray(studyFlow?.parts) && currentPart < studyFlow.parts.length - 1
  );
  const nextStudyPart = hasNextStudyPart ? studyFlow.parts[currentPart + 1] : null;

  const [datasetInfo, setDatasetInfo] = useState(null);
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [timers, setTimers] = useState({});
  const [isPaused, setIsPaused] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState("");
  const [comparisonReport, setComparisonReport] = useState(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [surveyAnswers, setSurveyAnswers] = useState({});
  const [interviewAnswers, setInterviewAnswers] = useState({});
  const [savingGlossRow, setSavingGlossRow] = useState(false);
  const [glossSaveError, setGlossSaveError] = useState("");
  const [glossSaveStatus, setGlossSaveStatus] = useState("");

  const [submittedIndices, setSubmittedIndices] = useState(new Set());
  const [allOriginalData, setAllOriginalData] = useState({});
  const [allEdits, setAllEdits] = useState({});

  const [wordEdits, setWordEdits] = useState({});
  const [editedTranslation, setEditedTranslation] = useState("");
  const [exampleUncertainByIndex, setExampleUncertainByIndex] = useState({});

  const [globalCorrectionsByMode, setGlobalCorrectionsByMode] = useState({
    control: {},
    treatment: {},
    mixed: {}
  });

  const [studyCorrectionsByMode, setStudyCorrectionsByMode] = useState({
    control: {},
    treatment: {},
    mixed: {}
  });

  const currentIndex = parseInt(example_num || "1", 10) - 1;
  const currentExample = examples[currentIndex];
  const currentExampleMode = (currentExample?.mode || mode || "treatment").toLowerCase();

  useEffect(() => {
    setSessionComplete(false);
    setSessionData(null);
    setSavingSession(false);
    setSessionSaveError("");
    setComparisonReport(null);
    setFeedbackModalOpen(false);
    setFeedbackSubmitting(false);
    setFeedbackError("");
    setFeedbackSubmitted(false);
    setSurveyAnswers({});
    setInterviewAnswers({});
    setSavingGlossRow(false);
    setGlossSaveError("");
    setGlossSaveStatus("");
    setSubmittedIndices(new Set());
    setAllOriginalData({});
    setAllEdits({});
    setWordEdits({});
    setEditedTranslation("");
    setExampleUncertainByIndex({});
    setGlobalCorrectionsByMode({ control: {}, treatment: {}, mixed: {} });
    setStudyCorrectionsByMode({ control: {}, treatment: {}, mixed: {} });
    setIsPaused(false);
  }, [datasetId, mode, exampleLimit, studyFlow?.currentPart, studyFlow?.runId, isShuffleStudy]);

  const fetchGlobalCorrections = useCallback(async (language, modeKey, segmentation) => {
    if (!language || !segmentation) return;
    try {
      const data = await fetchCorrectionsAPI(language, segmentation);
      setGlobalCorrectionsByMode((prev) => ({
        ...prev,
        [modeKey]: {
          ...(prev[modeKey] || {}),
          [segmentation]: data
        }
      }));
    } catch {
      // non-critical
    }
  }, []);

  const addStudyLocalCorrections = useCallback((modeKey, changedItems) => {
    setStudyCorrectionsByMode((prev) => {
      const scoped = { ...(prev[modeKey] || {}) };

      changedItems.forEach(({ segmentation, gloss }) => {
        if (!segmentation || !gloss) return;

        const current = [...(scoped[segmentation] || [])];
        const match = current.find((item) => item.gloss === gloss);
        if (match) {
          match.count += 1;
        } else {
          current.push({ gloss, count: 1 });
        }

        current.sort((a, b) => b.count - a.count);
        scoped[segmentation] = current;
      });

      return {
        ...prev,
        [modeKey]: scoped
      };
    });
  }, []);

  useEffect(() => {
    const loadExamples = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isStudy && isShuffleStudy) {
          if (!controlDatasetId || !treatmentDatasetId) {
            throw new Error("Control and treatment datasets are required for shuffled studies.");
          }

          const [controlResponse, treatmentResponse] = await Promise.all([
            fetchGlosses({ datasetId: controlDatasetId, mode: "control" }),
            fetchGlosses({ datasetId: treatmentDatasetId, mode: "treatment" })
          ]);

          const controlRows = selectBalancedStudyExamples(controlResponse.data || [], exampleLimit, randomSample).map((row, idx) => ({
            ...row,
            mode: "control",
            originDatasetId: controlDatasetId,
            originDatasetName: controlResponse.dataset?.dataset_name || `Dataset ${controlDatasetId}`,
            localExampleId: `control-${idx + 1}`
          }));

          const treatmentRows = selectBalancedStudyExamples(treatmentResponse.data || [], exampleLimit, randomSample).map((row, idx) => ({
            ...row,
            mode: "treatment",
            originDatasetId: treatmentDatasetId,
            originDatasetName: treatmentResponse.dataset?.dataset_name || `Dataset ${treatmentDatasetId}`,
            localExampleId: `treatment-${idx + 1}`
          }));

          const mixedRows = shuffleArray([...controlRows, ...treatmentRows]);
          setExamples(mixedRows);
          setDatasetInfo({
            dataset_name: `${studyFlow?.controlDatasetName || controlRows[0]?.originDatasetName || "Control"} + ${
              studyFlow?.treatmentDatasetName || treatmentRows[0]?.originDatasetName || "Treatment"
            }`,
            language: treatmentResponse.dataset?.language || controlResponse.dataset?.language || null
          });

          const initialTimers = {};
          const initialOriginal = {};
          mixedRows.forEach((row, idx) => {
            initialTimers[idx] = 0;
            initialOriginal[idx] = {
              words: buildWordData(row),
              translation: row.translation || "",
              source: row.source || "Unknown",
              mode: row.mode,
              datasetId: row.originDatasetId,
              datasetName: row.originDatasetName
            };
          });
          setTimers(initialTimers);
          setAllOriginalData(initialOriginal);
          return;
        }

        const response = await fetchGlosses({
          datasetId,
          mode
        });
        const sourceRows = response.data || [];
        const selectedRows = isStudy
          ? selectBalancedStudyExamples(sourceRows, exampleLimit, randomSample)
          : sourceRows.slice(0, exampleLimit);
        const rows = selectedRows.map((row, idx) => ({
          ...row,
          mode,
          originDatasetId: datasetId,
          originDatasetName: response.dataset?.dataset_name || `Dataset ${datasetId}`,
          localExampleId: `${mode}-${idx + 1}`
        }));

        setExamples(rows);
        setDatasetInfo(response.dataset || null);

        const initialTimers = {};
        const initialOriginal = {};
        rows.forEach((row, idx) => {
          initialTimers[idx] = 0;
          initialOriginal[idx] = {
            words: buildWordData(row),
            translation: row.translation || "",
            source: row.source || "Unknown",
            mode,
            datasetId,
            datasetName: response.dataset?.dataset_name || `Dataset ${datasetId}`
          };
        });
        setTimers(initialTimers);
        setAllOriginalData(initialOriginal);
      } catch (err) {
        setError(new Error(normalizeError(err)));
      } finally {
        setLoading(false);
      }
    };

    if (datasetId || (isStudy && isShuffleStudy)) {
      loadExamples();
    }
  }, [
    datasetId,
    mode,
    exampleLimit,
    randomSample,
    isStudy,
    isShuffleStudy,
    controlDatasetId,
    treatmentDatasetId,
    studyFlow?.controlDatasetName,
    studyFlow?.treatmentDatasetName
  ]);

  useEffect(() => {
    if (!currentExample) return;

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

    if (!loading && !isStudy) {
      const segs = currentExample.segmentation ? currentExample.segmentation.split(/\s+/) : [];
      const correctionLanguage = currentExample.language || datasetInfo?.language;
      segs.forEach((seg) => {
        if (seg) {
          fetchGlobalCorrections(correctionLanguage, currentExampleMode, seg);
        }
      });
    }
  }, [
    currentExample,
    currentIndex,
    allEdits,
    allOriginalData,
    submittedIndices,
    loading,
    isStudy,
    datasetInfo,
    fetchGlobalCorrections,
    currentExampleMode
  ]);

  useEffect(() => {
    let interval;
    if (isStudy && !isPaused && !loading && !submittedIndices.has(currentIndex)) {
      interval = setInterval(() => {
        setTimers((prev) => ({ ...prev, [currentIndex]: (prev[currentIndex] || 0) + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStudy, isPaused, loading, currentIndex, submittedIndices]);

  const formatTime = (seconds) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleWordEdit = (wordIndex, field, value) => {
    if (isPaused) setIsPaused(false);
    setWordEdits((prev) => ({
      ...prev,
      [wordIndex]: { ...prev[wordIndex], [field]: value }
    }));
  };

  const moveToExample = (nextIdx) => {
    navigate(`/gloss/${datasetId}/${nextIdx + 1}`, {
      state: {
        ...location.state,
        datasetId,
        exampleLimit,
        mode
      }
    });
  };

  const handleSubmitExample = async () => {
    const updatedEdits = {
      ...allEdits,
      [currentIndex]: {
        words: wordEdits,
        translation: editedTranslation,
        source: currentExample?.source || "Unknown",
        mode: currentExampleMode,
        datasetId: currentExample?.originDatasetId || datasetId,
        datasetName: currentExample?.originDatasetName || datasetInfo?.dataset_name || `Dataset ${datasetId}`
      }
    };
    setAllEdits(updatedEdits);

    const updatedSubmitted = new Set(submittedIndices);
    updatedSubmitted.add(currentIndex);
    setSubmittedIndices(updatedSubmitted);
    setIsPaused(true);
    setExampleUncertainByIndex((prev) => ({
      ...prev,
      [currentIndex]: Boolean(prev[currentIndex])
    }));

    const original = allOriginalData[currentIndex];
    const changed = [];
    if (original) {
      Object.entries(wordEdits).forEach(([wIdx, wordData]) => {
        const originalGloss = original.words[wIdx]?.gloss;
        if (wordData.gloss && wordData.gloss !== originalGloss) {
          changed.push({ segmentation: wordData.segmentation, gloss: wordData.gloss });
        }
      });
    }

    if (changed.length > 0) {
      if (isStudy) {
        // Study corrections are local to this in-memory session and mode only.
        addStudyLocalCorrections(currentExampleMode, changed);
      } else if (currentExampleMode === "treatment") {
        try {
          const language = currentExample?.language || datasetInfo?.language;
          if (language) {
            await submitCorrections(language, changed);
            await Promise.all(
              changed.map((item) => fetchGlobalCorrections(language, "treatment", item.segmentation))
            );
          }
        } catch {
          // non-critical
        }
      }
    }

    if (currentIndex < examples.length - 1) {
      moveToExample(currentIndex + 1);
    }
  };

  const handleSaveGlossingExample = async () => {
    if (isStudy || !currentExample) return;

    setSavingGlossRow(true);
    setGlossSaveError("");
    setGlossSaveStatus("");

    const rowIndex = Number(currentExample.row_index || currentIndex + 1);
    const orderedWords = Object.entries(wordEdits)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, word]) => word || { segmentation: "", gloss: "" });

    const segmentation = orderedWords.map((word) => (word.segmentation || "").trim()).join(" ").trim();
    const gloss = orderedWords.map((word) => (word.gloss || "").trim()).join(" ").trim();
    const translation = editedTranslation || "";
    const source = currentExample?.source || allOriginalData[currentIndex]?.source || "Unknown";

    try {
      await updateDatasetRow({
        datasetId,
        rowIndex,
        segmentation,
        gloss,
        translation,
        source
      });

      const original = allOriginalData[currentIndex] || { words: {}, translation: "" };
      const changed = [];
      Object.entries(wordEdits).forEach(([wIdx, wordData]) => {
        const originalGloss = original.words?.[wIdx]?.gloss;
        if (wordData.gloss && wordData.gloss !== originalGloss) {
          changed.push({ segmentation: wordData.segmentation, gloss: wordData.gloss });
        }
      });

      if (changed.length > 0 && currentExampleMode === "treatment") {
        const language = currentExample?.language || datasetInfo?.language;
        if (language) {
          await submitCorrections(language, changed);
          await Promise.all(
            changed.map((item) => fetchGlobalCorrections(language, "treatment", item.segmentation))
          );
        }
      }

      const updatedOriginal = {
        ...allOriginalData,
        [currentIndex]: {
          words: buildWordData({ segmentation, gloss, transcript: currentExample.transcript || "" }),
          translation,
          source,
          mode: currentExampleMode,
          datasetId,
          datasetName: currentExample?.originDatasetName || datasetInfo?.dataset_name || `Dataset ${datasetId}`
        }
      };
      setAllOriginalData(updatedOriginal);

      setAllEdits((prev) => ({
        ...prev,
        [currentIndex]: {
          words: buildWordData({ segmentation, gloss, transcript: currentExample.transcript || "" }),
          translation,
          source,
          mode: currentExampleMode,
          datasetId,
          datasetName: currentExample?.originDatasetName || datasetInfo?.dataset_name || `Dataset ${datasetId}`
        }
      }));

      setExamples((prev) => prev.map((row, idx) => (
        idx === currentIndex
          ? { ...row, segmentation, gloss, translation, source }
          : row
      )));

      setGlossSaveStatus("Saved to dataset.");
    } catch (err) {
      setGlossSaveError(normalizeError(err));
    } finally {
      setSavingGlossRow(false);
    }
  };

  const sessionComputation = useMemo(() => {
    const exampleEdits = {};
    const finalData = {};
    const exampleModes = {};
    const exampleDatasetIds = {};

    examples.forEach((row, idx) => {
      const finalState = allEdits[idx] || allOriginalData[idx] || {
        words: {},
        translation: "",
        source: row.source || ""
      };
      const originalState = allOriginalData[idx] || { words: {}, translation: "" };

      finalData[idx] = {
        ...finalState,
        transcript: row.transcript || "",
        previousWords: originalState.words || {},
        source: row.source || finalState.source || "Unknown",
        mode: row.mode || mode,
        datasetId: row.originDatasetId || datasetId,
        sourceRowIndex: Number(row.row_index || 0) || null,
        datasetName: row.originDatasetName || datasetInfo?.dataset_name || `Dataset ${datasetId}`
      };

      exampleModes[idx] = row.mode || mode;
      exampleDatasetIds[idx] = row.originDatasetId || datasetId;

      let editCount = 0;
      Object.keys(finalState.words || {}).forEach((wordIdx) => {
        const finalWord = finalState.words[wordIdx];
        const originalWord = originalState.words?.[wordIdx] || { segmentation: "", gloss: "" };
        if (finalWord?.segmentation !== originalWord.segmentation) editCount += 1;
        if (finalWord?.gloss !== originalWord.gloss) editCount += 1;
      });
      if (finalState.translation !== originalState.translation) {
        editCount += 1;
      }
      exampleEdits[idx] = editCount;
    });

    return { exampleEdits, finalData, exampleModes, exampleDatasetIds };
  }, [examples, allEdits, allOriginalData, mode, datasetId, datasetInfo]);

  const handleFinishSession = async () => {
    if (submittedIndices.size !== examples.length) {
      alert("Please submit all examples before finishing.");
      return;
    }

    const payload = {
      username: getCurrentUsername(),
      runId,
      studyType: isStudy ? (isShuffleStudy ? "shuffle" : "split") : "single",
      controlDatasetId,
      treatmentDatasetId,
      datasetId,
      datasetName: datasetInfo?.dataset_name || `Dataset ${datasetId}`,
      mode: isShuffleStudy ? "mixed" : mode,
      totalExamples: examples.length,
      exampleLimit,
      exampleTimes: timers,
      exampleEdits: sessionComputation.exampleEdits,
      exampleUncertain: exampleUncertainByIndex,
      exampleModes: sessionComputation.exampleModes,
      exampleDatasetIds: sessionComputation.exampleDatasetIds,
      finalData: sessionComputation.finalData,
      totalTime: Object.values(timers).reduce((acc, value) => acc + value, 0),
      totalEdits: Object.values(sessionComputation.exampleEdits).reduce((acc, value) => acc + value, 0),
      startedAt: location.state?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    setSavingSession(true);
    setSessionSaveError("");

    try {
      const response = await saveStudySession(payload);
      setSessionData({ ...payload, sessionId: response.sessionId });
      if (isStudy && response.sessionId) {
        setFeedbackModalOpen(true);
      }

      try {
        const report = await fetchStudyComparisonReport(response.sessionId);
        setComparisonReport(report);
      } catch {
        setComparisonReport(null);
      }
    } catch (err) {
      setSessionSaveError(normalizeError(err));
      setSessionData(payload);
    } finally {
      setSavingSession(false);
    }

    setSessionComplete(true);
  };

  const handleSubmitFeedback = async () => {
    if (!sessionData?.sessionId) {
      setFeedbackError("Session was not saved, so feedback cannot be linked yet.");
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackError("");
    try {
      await submitStudySessionFeedback(sessionData.sessionId, {
        surveyAnswers,
        interviewAnswers
      });
      setFeedbackSubmitted(true);
      setFeedbackModalOpen(false);
    } catch (err) {
      setFeedbackError(normalizeError(err));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleContinueStudy = () => {
    if (!nextStudyPart) return;

    navigate(`/gloss/${nextStudyPart.datasetId}/1`, {
      state: {
        ...location.state,
        datasetId: nextStudyPart.datasetId,
        exampleLimit,
        mode: nextStudyPart.mode,
        studyFlow: {
          ...studyFlow,
          currentPart: currentPart + 1
        }
      }
    });
  };

  const downloadCurrentSessionCSV = async () => {
    if (!sessionData) return;
    if (sessionData.sessionId) {
      const saved = await fetchStudySessionExport(sessionData.sessionId);
      const summary = saved.session.summary_json || {};
      const exampleUncertain = summary.exampleUncertain || {};

      let csv = "data:text/csv;charset=utf-8,";
      csv += "Username,Run_ID,Study_Type,Dataset,Mode,Example_ID,Word_Index,Segmentation,Gloss,Translation,Source,Time_Spent_Sec,Certainty\n";

      (saved.rows || []).forEach((row) => {
        const cleanUser = saved.session.username ? `"${String(saved.session.username).replace(/"/g, '""')}"` : "anonymous";
        const cleanDataset = `"${String(saved.session.dataset_name || "").replace(/"/g, '""')}"`;
        const cleanTranslation = row.translation ? `"${String(row.translation).replace(/"/g, '""')}"` : "";
        const certainty = exampleUncertain?.[Number(row.example_order) - 1] ? "uncertain" : "certain";

        csv += [
          cleanUser,
          saved.session.run_id || "",
          saved.session.study_type || "single",
          cleanDataset,
          row.row_mode || saved.session.mode,
          row.example_order,
          row.word_index,
          row.segmentation || "",
          row.gloss || "",
          cleanTranslation,
          row.source || "",
          row.time_spent_sec || 0,
          certainty
        ].join(",") + "\n";
      });

      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csv));
      link.setAttribute("download", `all_changes_${saved.session.session_id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const summary = {
      exampleTimes: sessionData.exampleTimes || {},
      exampleUncertain: sessionData.exampleUncertain || {},
      exampleModes: sessionData.exampleModes || {},
      finalData: sessionData.finalData || {}
    };

    let csv = "data:text/csv;charset=utf-8,";
    csv += "Username,Run_ID,Study_Type,Dataset,Mode,Example_ID,Word_Index,Segmentation,Gloss,Translation,Source,Time_Spent_Sec,Certainty\n";

    Object.entries(summary.finalData).forEach(([idx, data]) => {
      const exampleOrder = Number(idx) + 1;
      const certainty = summary.exampleUncertain?.[idx] ? "uncertain" : "certain";
      const modeValue = summary.exampleModes?.[idx] || data.mode || sessionData.mode;
      Object.entries(data.words || {}).forEach(([wordIdx, word]) => {
        const cleanUser = sessionData.username ? `"${String(sessionData.username).replace(/"/g, '""')}"` : "anonymous";
        const cleanDataset = `"${String(data.datasetName || sessionData.datasetName || "").replace(/"/g, '""')}"`;
        const cleanTranslation = data.translation ? `"${String(data.translation).replace(/"/g, '""')}"` : "";
        csv += [
          cleanUser,
          sessionData.runId || "",
          sessionData.studyType || "single",
          cleanDataset,
          modeValue,
          exampleOrder,
          Number(wordIdx) + 1,
          word.segmentation || "",
          word.gloss || "",
          cleanTranslation,
          data.source || "",
          Number(summary.exampleTimes?.[idx] || 0),
          certainty
        ].join(",") + "\n";
      });
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "all_changes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExampleLevelCsv = async () => {
    if (!sessionData) return;

    if (sessionData.sessionId) {
      const saved = await fetchStudySessionExport(sessionData.sessionId);
      const summary = saved.session.summary_json || {};
      const exampleTimes = summary.exampleTimes || {};
      const exampleEdits = summary.exampleEdits || {};
      const exampleUncertain = summary.exampleUncertain || {};
      const exampleModes = summary.exampleModes || {};
      const exampleDatasetIds = summary.exampleDatasetIds || {};

      const exampleIds = Array.from(new Set((saved.rows || []).map((row) => Number(row.example_order) - 1))).sort((a, b) => a - b);

      let csv = "data:text/csv;charset=utf-8,";
      csv += "Session_ID,Run_ID,Example_ID,Mode,Dataset_ID,Time_Spent_Sec,Edit_Count,Certainty\n";
      exampleIds.forEach((idx) => {
        const certainty = exampleUncertain?.[idx] ? "uncertain" : "certain";
        csv += [
          saved.session.session_id,
          saved.session.run_id || "",
          idx + 1,
          exampleModes?.[idx] || saved.session.mode,
          exampleDatasetIds?.[idx] || saved.session.dataset_id,
          Number(exampleTimes?.[idx] || 0),
          Number(exampleEdits?.[idx] || 0),
          certainty
        ].join(",") + "\n";
      });

      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csv));
      link.setAttribute("download", `example_level_${saved.session.session_id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const summary = {
      exampleTimes: sessionData.exampleTimes || {},
      exampleEdits: sessionData.exampleEdits || {},
      exampleUncertain: sessionData.exampleUncertain || {},
      exampleModes: sessionData.exampleModes || {},
      exampleDatasetIds: sessionData.exampleDatasetIds || {}
    };

    const exampleIds = Object.keys(sessionData.finalData || {}).map((key) => Number(key)).sort((a, b) => a - b);
    let csv = "data:text/csv;charset=utf-8,";
    csv += "Session_ID,Run_ID,Example_ID,Mode,Dataset_ID,Time_Spent_Sec,Edit_Count,Certainty\n";
    exampleIds.forEach((idx) => {
      const certainty = summary.exampleUncertain?.[idx] ? "uncertain" : "certain";
      csv += [
        sessionData.sessionId || "",
        sessionData.runId || "",
        idx + 1,
        summary.exampleModes?.[idx] || sessionData.mode,
        summary.exampleDatasetIds?.[idx] || sessionData.datasetId,
        Number(summary.exampleTimes?.[idx] || 0),
        Number(summary.exampleEdits?.[idx] || 0),
        certainty
      ].join(",") + "\n";
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `example_level_${sessionData.sessionId || "current"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSentenceLevelChangesCsv = async () => {
    if (!sessionData?.sessionId) return;

    const saved = await fetchStudySessionExport(sessionData.sessionId);
    const summary = saved.session.summary_json || {};
    const rowsByExample = new Map();

    (saved.rows || []).forEach((row) => {
      const exampleRows = rowsByExample.get(row.example_order) || [];
      exampleRows.push(row);
      rowsByExample.set(row.example_order, exampleRows);
    });

    const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvRows = [[
      "Session_ID", "Run_ID", "Username", "Study_Type", "Example_ID", "Mode", "Dataset_ID",
      "Source_Row_Index", "Transcript", "Previous_Segmentation", "Previous_Gloss",
      "Updated_Segmentation", "Updated_Gloss", "Translation", "Source", "Time_Spent_Sec",
      "Edit_Count", "Certainty"
    ]];

    [...rowsByExample.entries()]
      .sort(([left], [right]) => Number(left) - Number(right))
      .forEach(([exampleOrder, exampleRows]) => {
        const orderedRows = exampleRows.sort((left, right) => Number(left.word_index) - Number(right.word_index));
        const exampleIndex = Number(exampleOrder) - 1;
        const firstRow = orderedRows[0];
        csvRows.push([
          saved.session.session_id,
          saved.session.run_id || "",
          saved.session.username || "anonymous",
          saved.session.study_type || "single",
          exampleOrder,
          firstRow.row_mode || saved.session.mode,
          firstRow.row_dataset_id || saved.session.dataset_id,
          firstRow.source_row_index || "",
          firstRow.transcript || "",
          orderedRows.map((row) => row.previous_segmentation || "").join(" "),
          orderedRows.map((row) => row.previous_gloss || "").join(" "),
          orderedRows.map((row) => row.segmentation || "").join(" "),
          orderedRows.map((row) => row.gloss || "").join(" "),
          firstRow.translation || "",
          firstRow.source || "",
          firstRow.time_spent_sec || 0,
          Number(summary.exampleEdits?.[exampleIndex] || 0),
          summary.exampleUncertain?.[exampleIndex] ? "uncertain" : "certain"
        ]);
      });

    const csv = `data:text/csv;charset=utf-8,${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `sentence_level_changes_${saved.session.session_id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadComparisonReport = () => {
    if (!comparisonReport) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Mode,Total_Time_Sec,Example_Count,Avg_Time_Per_Example_Sec,Uncertainty_Count\n";

    (comparisonReport.byMode || []).forEach((row) => {
      csvContent += [
        row.mode,
        row.totalTimeSec,
        row.exampleCount,
        row.avgTimePerExampleSec,
        row.uncertaintyCount || 0
      ].join(",") + "\n";
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `comparison_report_${sessionData?.sessionId || "session"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="loading-container">Loading glosses...</div>;
  if (error) return <div className="error-container">Error: {error.message}</div>;
  if (!currentExample) return <div className="error-container">No examples available for this session.</div>;

  if (sessionComplete && sessionData) {
    return (
      <div className="session-complete-container">
        <div className="session-complete-card">
          <h2>Session Complete</h2>
          <p>{isShuffleStudy ? "Shuffled Mixed Session" : (activePart?.title || mode)}</p>
          <div className="session-stats">
            <p><strong>Total Edits:</strong> {sessionData.totalEdits}</p>
            <p><strong>Total Time:</strong> {formatTime(sessionData.totalTime)}</p>
          </div>

          {savingSession && <p className="status-muted">Saving session to database...</p>}
          {sessionSaveError && <p className="status-error">{sessionSaveError}</p>}

          {comparisonReport && (
            <div className="status-ok-box" style={{ marginBottom: "12px", textAlign: "left" }}>
              <p><strong>Comparison Report</strong></p>
              {(comparisonReport.byMode || []).map((item) => (
                <p key={item.mode}>
                  {item.mode}: total {item.totalTimeSec}s, avg {item.avgTimePerExampleSec}s/example
                </p>
              ))}
            </div>
          )}

          <div className="session-actions">
            <button className="btn btn-secondary" onClick={downloadCurrentSessionCSV}>All Changes CSV</button>
            <button className="btn btn-secondary" onClick={downloadExampleLevelCsv}>Example CSV</button>
            {sessionData?.sessionId && (
              <button className="btn btn-secondary" onClick={downloadSentenceLevelChangesCsv}>Sentence-Level Changes CSV</button>
            )}
            {comparisonReport && (
              <button className="btn btn-secondary" onClick={downloadComparisonReport}>Comparison CSV</button>
            )}
            {isStudy && sessionData?.sessionId && (
              <button className="btn btn-secondary" onClick={() => setFeedbackModalOpen(true)}>
                {feedbackSubmitted ? "View/Edit Feedback" : "Complete Feedback"}
              </button>
            )}
            {hasNextStudyPart ? (
              <button className="btn btn-primary" onClick={handleContinueStudy}>
                Continue to {nextStudyPart?.title || "next part"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/completed_sessions")}>View Completed Sessions</button>
            )}
          </div>

          {hasNextStudyPart && (
            <p style={{ marginTop: "15px" }}>
              Break time: pause when ready, then choose Continue to move to the next study part.
            </p>
          )}

          <div style={{ marginTop: "20px" }}>
            <Link to="/glossing" className="link-simple">Back to Glossing</Link>
          </div>
        </div>

        {feedbackModalOpen && isStudy && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.55)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1200,
              padding: "20px"
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                width: "min(980px, 96vw)",
                maxHeight: "92vh",
                overflowY: "auto",
                padding: "20px"
              }}
            >
              <h3 style={{ marginTop: 0 }}>Post-Session Survey and Interview</h3>
              <p>Please complete this form for the session you just finished. Responses are tied to your user and session.</p>

              {surveyQuestionSections.map((section) => (
                <div key={section.title} style={{ marginBottom: "18px" }}>
                  <h4>{section.title}</h4>
                  {section.questions.map((question) => (
                    <div key={question.id} style={{ marginBottom: "12px" }}>
                      <label htmlFor={question.id} style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
                        {question.prompt}
                      </label>
                      {question.type === "scale" ? (
                        <>
                          <select
                            id={question.id}
                            value={surveyAnswers[question.id] || ""}
                            onChange={(event) => setSurveyAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value
                            }))}
                            style={{ width: "100%" }}
                          >
                            <option value="">
                              Select a score ({question.min} = {question.minLabel}; {question.max} = {question.maxLabel})
                            </option>
                            {Array.from({ length: question.max - question.min + 1 }, (_, idx) => idx + question.min).map((value) => (
                              <option key={value} value={value}>
                                {value === question.min
                                  ? `${value} — ${question.minLabel}`
                                  : value === question.max
                                    ? `${value} — ${question.maxLabel}`
                                    : value}
                              </option>
                            ))}
                          </select>
                          <small>
                            {question.min} = {question.minLabel}; {question.max} = {question.maxLabel}
                          </small>
                        </>
                      ) : (
                        <textarea
                          id={question.id}
                          rows={3}
                          value={surveyAnswers[question.id] || ""}
                          onChange={(event) => setSurveyAnswers((prev) => ({
                            ...prev,
                            [question.id]: event.target.value
                          }))}
                          style={{ width: "100%" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}

              <div style={{ marginBottom: "18px" }}>
                <h4>Interview Questions</h4>
                {interviewQuestions.map((question, idx) => {
                  const key = `interview_${idx + 1}`;
                  return (
                    <div key={key} style={{ marginBottom: "14px" }}>
                      <label htmlFor={key} style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
                        {question}
                      </label>
                      <textarea
                        id={key}
                        rows={7}
                        value={interviewAnswers[key] || ""}
                        onChange={(event) => setInterviewAnswers((prev) => ({
                          ...prev,
                          [key]: event.target.value
                        }))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  );
                })}
              </div>

              {feedbackError && <p className="status-error">{feedbackError}</p>}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setFeedbackModalOpen(false)}
                  disabled={feedbackSubmitting}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSubmitting}
                >
                  {feedbackSubmitting ? "Saving..." : "Submit Feedback"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isCurrentSubmitted = submittedIndices.has(currentIndex);
  const allSubmitted = submittedIndices.size === examples.length;
  const activeCorrections = isStudy
    ? (studyCorrectionsByMode[currentExampleMode] || {})
    : (globalCorrectionsByMode[currentExampleMode] || {});
  const isCurrentUncertain = Boolean(exampleUncertainByIndex[currentIndex]);

  return (
    <div className="glossing-page">
      <div className="glossing-header">
        <button onClick={() => navigate("/glossing")} className="btn-exit">← Exit Session</button>
        <h2>
          {isShuffleStudy
            ? `${studyFlow?.controlDatasetName || "Control"} + ${studyFlow?.treatmentDatasetName || "Treatment"}`
            : (currentExample.originDatasetName || datasetInfo?.dataset_name || `Dataset ${datasetId}`)}
          <span className="model-badge">{currentExampleMode}</span>
        </h2>
        {isStudy && (
          <div className="timer-display">
            {formatTime(timers[currentIndex] || 0)}
            <button
              onClick={() => setIsPaused((current) => !current)}
              className="btn-icon"
              disabled={isCurrentSubmitted}
            >
              {isPaused || isCurrentSubmitted ? "▶" : "⏸"}
            </button>
          </div>
        )}
      </div>

      <div className="progress-bar-container">
        <div className="progress-segments">
          {examples.map((item, idx) => (
            <div
              key={item.localExampleId || idx}
              className={`progress-segment ${submittedIndices.has(idx) ? "completed" : ""} ${idx === currentIndex ? "active" : ""}`}
              onClick={() => moveToExample(idx)}
              title={`Example ${idx + 1} (${item.mode || mode})`}
            />
          ))}
        </div>
      </div>

      <section className="example-context" aria-label="Example context">
        <div>
          <span className="input-label">Source</span>
          <span className="source-badge">{(currentExample.source || "unknown").toUpperCase()}</span>
        </div>
        <div>
          <span className="input-label">Transcript</span>
          <div className="transcript-box">{currentExample.transcript}</div>
        </div>
      </section>

      <div className="glossing-container">
        <div className="glossing-side">
          <h3>
            Work Area
            {isCurrentSubmitted && <span className="badge-submitted">Submitted</span>}
          </h3>

          <div className="word-breakdown">
            {Object.entries(wordEdits).map(([key, data]) => {
              const modelGloss = allOriginalData[currentIndex]?.words?.[key]?.gloss || "";
              const suggestions = activeCorrections[data.segmentation] || [];
              const transcriptToken = (currentExample?.transcript || "").trim().split(/\s+/)[Number(key)] || data.segmentation || "-";
              return (
                <div key={key} className="word-card">
                  <div className="word-card-header">{transcriptToken} (Word {Number(key) + 1})</div>

                  <div className="input-group">
                    <span className="input-label label-seg">Segmentation</span>
                    <input
                      value={data.segmentation}
                      onChange={(event) => handleWordEdit(key, "segmentation", event.target.value)}
                      disabled={isCurrentSubmitted}
                    />
                  </div>

                  <div className="input-group">
                    <span className="input-label label-gloss">Gloss</span>
                    <GlossInput
                      value={data.gloss}
                      modelPrediction={currentExampleMode === "control" ? "" : modelGloss}
                      suggestions={suggestions}
                      onChange={(newValue) => handleWordEdit(key, "gloss", newValue)}
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
              onChange={(event) => {
                if (isPaused) setIsPaused(false);
                setEditedTranslation(event.target.value);
              }}
              disabled={isCurrentSubmitted}
            />
          </div>
        </div>

        <div className="action-side">
          <div className="nav-controls">
            <button disabled={currentIndex === 0} onClick={() => moveToExample(currentIndex - 1)}>
              ← Prev
            </button>
            <button disabled={currentIndex === examples.length - 1} onClick={() => moveToExample(currentIndex + 1)}>
              Next →
            </button>
          </div>

          <hr />

          {isCurrentSubmitted ? (
            <button
              className="btn btn-warning"
              onClick={() => {
                const updated = new Set(submittedIndices);
                updated.delete(currentIndex);
                setSubmittedIndices(updated);
                setIsPaused(false);
              }}
            >
              Edit Again
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={isStudy ? handleSubmitExample : handleSaveGlossingExample}
              disabled={!isStudy && savingGlossRow}
            >
              {isStudy ? "Submit Example" : (savingGlossRow ? "Saving..." : "Save Changes")}
            </button>
          )}

          {isStudy && (
            <div style={{ marginTop: "12px", textAlign: "left" }}>
              <label htmlFor="uncertainFlag" className="input-label">Example Flag</label>
              <select
                id="uncertainFlag"
                value={isCurrentUncertain ? "uncertain" : "certain"}
                onChange={(event) => {
                  const uncertain = event.target.value === "uncertain";
                  setExampleUncertainByIndex((prev) => ({
                    ...prev,
                    [currentIndex]: uncertain
                  }));
                }}
                disabled={isCurrentSubmitted}
                style={{ width: "100%", marginTop: "4px" }}
              >
                <option value="certain">Certain</option>
                <option value="uncertain">Uncertain</option>
              </select>
            </div>
          )}

          {isStudy ? (
            <div className="submit-area">
              <p>Submitted: {submittedIndices.size} / {examples.length}</p>
              <button className="btn btn-finish" disabled={!allSubmitted} onClick={handleFinishSession}>
                Finish Session
              </button>
            </div>
          ) : (
            <div className="submit-area">
              {glossSaveError && <p className="status-error">{glossSaveError}</p>}
              {glossSaveStatus && <p className="status-ok">{glossSaveStatus}</p>}
              <p>You can save and exit at any time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GlossingPage;
