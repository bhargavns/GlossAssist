import React, { useEffect, useState } from "react";
import {
  fetchStudySessionFeedback,
  fetchSavedStudySessions,
  fetchStudyComparisonReport,
  fetchStudySessionExport
} from "../utils/api";

function CompletedSessionsPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchSavedStudySessions();
        setSessions(data || []);
        setError("");
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const downloadSessionCsv = async (sessionId) => {
    const saved = await fetchStudySessionExport(sessionId);
    const summary = saved.session.summary_json || {};
    const exampleUncertain = summary.exampleUncertain || {};

    let csv = "data:text/csv;charset=utf-8,";
    csv += "Username,Run_ID,Study_Type,Dataset,Mode,Example_ID,Word_Index,Segmentation,Gloss,Translation,Source,Time_Spent_Sec,Certainty\n";

    (saved.rows || []).forEach((row) => {
      const cleanDataset = `"${String(saved.session.dataset_name).replace(/"/g, '""')}"`;
      const cleanUser = saved.session.username
        ? `"${String(saved.session.username).replace(/"/g, '""')}"`
        : "anonymous";
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
    link.setAttribute("download", `all_changes_${sessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExampleCsv = async (sessionId) => {
    const saved = await fetchStudySessionExport(sessionId);
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
    link.setAttribute("download", `example_level_${sessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSentenceLevelChangesCsv = async (sessionId) => {
    const saved = await fetchStudySessionExport(sessionId);
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
    link.setAttribute("download", `sentence_level_changes_${sessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadComparisonCsv = async (sessionId) => {
    const selectedReport = await fetchStudyComparisonReport(sessionId);

    let csv = "data:text/csv;charset=utf-8,";
    csv += "Mode,Total_Time_Sec,Example_Count,Avg_Time_Per_Example_Sec,Uncertainty_Count\n";
    (selectedReport.byMode || []).forEach((modeItem) => {
      csv += [
        modeItem.mode,
        modeItem.totalTimeSec,
        modeItem.exampleCount,
        modeItem.avgTimePerExampleSec,
        modeItem.uncertaintyCount || 0
      ].join(",") + "\n";
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `comparison_${selectedReport.runId || "session"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openSurveyDetails = async (sessionId) => {
    try {
      setFeedbackLoading(true);
      setError("");
      const feedback = await fetchStudySessionFeedback(sessionId);
      setSelectedFeedback({ sessionId, feedback });
    } catch (err) {
      setError(String(err));
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Completed Sessions</h2>
        <p>Review completed study sessions, download saved rows, and compare timing metrics by mode.</p>
      </div>

      {error && <p className="status-error">{error}</p>}

      <div className="data-panel">
        {loading ? (
          <p className="status-muted">Loading completed sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="status-muted">No completed sessions found.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Run ID</th>
                  <th>User</th>
                  <th>Study Type</th>
                  <th>Mode</th>
                  <th>Dataset</th>
                  <th>Total Time</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.session_id}>
                    <td>{session.session_id}</td>
                    <td>{session.run_id || "-"}</td>
                    <td>{session.username}</td>
                    <td>{session.study_type || "single"}</td>
                    <td>{session.mode}</td>
                    <td>{session.dataset_name}</td>
                    <td>{session.total_time_sec}s</td>
                    <td>{new Date(session.completed_at).toLocaleString()}</td>
                    <td>
                      <div className="row-actions completed-session-actions">
                        <button className="btn-inline" onClick={() => downloadSessionCsv(session.session_id)}>
                          All Changes CSV
                        </button>
                        <button className="btn-inline" onClick={() => downloadExampleCsv(session.session_id)}>
                          Example CSV
                        </button>
                        <button className="btn-inline" onClick={() => downloadSentenceLevelChangesCsv(session.session_id)}>
                          Sentence-Level Changes CSV
                        </button>
                        <button className="btn-inline" onClick={() => downloadComparisonCsv(session.session_id)}>
                          Comparison CSV
                        </button>
                        <button className="btn-inline" onClick={() => openSurveyDetails(session.session_id)}>
                          Survey Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(feedbackLoading || selectedFeedback) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
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
              width: "min(920px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "20px"
            }}
          >
            <h3 style={{ marginTop: 0 }}>Survey Details</h3>
            {feedbackLoading ? (
              <p>Loading survey responses...</p>
            ) : !selectedFeedback?.feedback ? (
              <p>No feedback has been submitted for this session yet.</p>
            ) : (
              <>
                <p><strong>Session:</strong> {selectedFeedback.sessionId}</p>
                <p><strong>Last Updated:</strong> {new Date(selectedFeedback.feedback.updated_at).toLocaleString()}</p>

                <h4>Survey Answers</h4>
                {Object.keys(selectedFeedback.feedback.survey_answers || {}).length === 0 ? (
                  <p>No survey answers submitted.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Question ID</th>
                        <th>Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedFeedback.feedback.survey_answers || {}).map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h4 style={{ marginTop: "14px" }}>Interview Answers</h4>
                {Object.keys(selectedFeedback.feedback.interview_answers || {}).length === 0 ? (
                  <p>No interview answers submitted.</p>
                ) : (
                  Object.entries(selectedFeedback.feedback.interview_answers || {}).map(([key, value]) => (
                    <div key={key} style={{ marginBottom: "12px" }}>
                      <p style={{ marginBottom: "4px" }}><strong>{key}</strong></p>
                      <textarea readOnly value={String(value || "")} rows={7} style={{ width: "100%" }} />
                    </div>
                  ))
                )}
              </>
            )}

            <div style={{ marginTop: "12px", textAlign: "right" }}>
              <button className="btn-inline" onClick={() => setSelectedFeedback(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CompletedSessionsPage;
