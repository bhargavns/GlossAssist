import React, { useEffect, useState } from "react";
import {
  fetchSavedStudySessions,
  fetchStudyComparisonReport,
  fetchStudySessionExport
} from "../utils/api";

function CompletedSessionsPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");

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
                      <button className="btn-inline" onClick={() => downloadSessionCsv(session.session_id)}>
                        All Changes CSV
                      </button>{" "}
                      <button className="btn-inline" onClick={() => downloadExampleCsv(session.session_id)}>
                        Example CSV
                      </button>{" "}
                      <button className="btn-inline" onClick={() => downloadComparisonCsv(session.session_id)}>
                        Comparison CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default CompletedSessionsPage;
