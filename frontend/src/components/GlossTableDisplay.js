import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDatasets,
  fetchGlosses,
  fetchDatasetAccessGrants,
  fetchIncomingDatasetAccessRequests,
  fetchOutgoingDatasetAccessRequests,
  revokeDatasetAccessGrant,
  requestDatasetAccess,
  updateDatasetAccessRequestStatus
} from "../utils/api";

function GlossTableDisplay() {
  const [data, setData] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [grants, setGrants] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [limit, setLimit] = useState(10);
  const [mode, setMode] = useState('treatment');
  const [loading, setLoading] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState('');
  const [error, setError] = useState(null);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, grantRows, incoming, outgoing] = await Promise.all([
        fetchDatasets(),
        fetchDatasetAccessGrants(),
        fetchIncomingDatasetAccessRequests(),
        fetchOutgoingDatasetAccessRequests()
      ]);
      setDatasets(rows);
      setGrants(grantRows);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const selectedDatasetRecord = useMemo(
    () => datasets.find((item) => String(item.dataset_id) === String(selectedDataset)),
    [datasets, selectedDataset]
  );

  const hasSelectedAccess = Boolean(selectedDatasetRecord?.can_access_data);

  const statusLabel = (value) => {
    const key = String(value || 'none').toLowerCase();
    if (key === 'owner') return 'Owner';
    if (key === 'admin') return 'Admin access';
    if (key === 'granted' || key === 'approved') return 'Access granted';
    if (key === 'pending') return 'Pending';
    if (key === 'rejected') return 'Rejected';
    return 'No access';
  };

  const retrieveFromDb = async () => {
    if (!selectedDataset) {
      setError('Please choose a dataset.');
      return;
    }

    if (!hasSelectedAccess) {
      setError('You do not have access to this dataset yet. Send an access request first.');
      return;
    }

    setRowsLoading(true);
    setError(null);
    setStatus('');

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
      setRowsLoading(false);
    }
  };

  const handleRequestAccess = async (datasetId) => {
    setError(null);
    setStatus('');
    const busyKey = `request-${datasetId}`;
    setActionBusyKey(busyKey);

    try {
      await requestDatasetAccess(datasetId);
      setStatus('Access request sent. The dataset owner can now approve or reject it.');
      await loadPageData();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionBusyKey('');
    }
  };

  const handleUpdateRequest = async (requestId, nextStatus) => {
    setError(null);
    setStatus('');
    const busyKey = `manage-${requestId}-${nextStatus}`;
    setActionBusyKey(busyKey);

    try {
      await updateDatasetAccessRequestStatus(requestId, nextStatus);
      setStatus(`Request ${nextStatus}.`);
      await loadPageData();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionBusyKey('');
    }
  };

  const handleRevokeGrant = async (grantId) => {
    setError(null);
    setStatus('');
    const busyKey = `revoke-${grantId}`;
    setActionBusyKey(busyKey);

    try {
      await revokeDatasetAccessGrant(grantId);
      setStatus('Access grant revoked.');
      await loadPageData();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionBusyKey('');
    }
  };

  const handleDownload = async (dataset) => {
    const busyKey = `download-${dataset.dataset_id}`;
    setActionBusyKey(busyKey);
    setError(null);
    setStatus('');

    try {
      const response = await fetchGlosses({
        datasetId: Number(dataset.dataset_id),
        mode: 'treatment'
      });
      const rows = response.data || [];
      const header = ['row_index', 'transcript', 'segmentation', 'gloss', 'translation', 'source'];
      const escapeCsv = (value) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };

      const csv = [
        header.join(','),
        ...rows.map((row) => [
          row.row_index,
          row.transcript,
          row.segmentation,
          row.gloss,
          row.translation,
          row.source
        ].map(escapeCsv).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${dataset.dataset_name || 'dataset'}_${dataset.dataset_id}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatus('Dataset download started.');
    } catch (err) {
      setError(String(err));
    } finally {
      setActionBusyKey('');
    }
  };

  return (
    <div className="data-panel">
      <div className="data-controls data-controls-inline">
        <button className="btn-inline" onClick={loadPageData} disabled={loading}>
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
          disabled={rowsLoading || !hasSelectedAccess}
        >
          {rowsLoading ? "Loading..." : "Retrieve Rows"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Language</th>
              <th>Entries</th>
              <th>Owner</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((dataset) => {
              const canAccess = Boolean(dataset.can_access_data);
              const canRequest = !dataset.is_owner && !canAccess && ['none', 'rejected'].includes(String(dataset.access_status || '').toLowerCase());
              const pending = String(dataset.access_status || '').toLowerCase() === 'pending';

              return (
                <tr key={dataset.dataset_id}>
                  <td>{dataset.dataset_name}</td>
                  <td>{dataset.description || 'No description'}</td>
                  <td>{dataset.language}</td>
                  <td>{dataset.row_count}</td>
                  <td>{dataset.owner_username}</td>
                  <td>{statusLabel(dataset.access_status)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn-inline"
                        onClick={() => setSelectedDataset(String(dataset.dataset_id))}
                      >
                        Select
                      </button>
                      {canAccess && (
                        <button
                          className="btn-inline"
                          onClick={() => handleDownload(dataset)}
                          disabled={actionBusyKey === `download-${dataset.dataset_id}`}
                        >
                          Download
                        </button>
                      )}
                      {canRequest && (
                        <button
                          className="btn-inline"
                          onClick={() => handleRequestAccess(dataset.dataset_id)}
                          disabled={actionBusyKey === `request-${dataset.dataset_id}`}
                        >
                          Request Access
                        </button>
                      )}
                      {pending && <span className="status-muted">Pending</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Incoming Access Requests</h3>
      {incomingRequests.length === 0 ? (
        <p className="status-muted">No requests yet for datasets you own.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Requester</th>
                <th>Email</th>
                <th>Status</th>
                <th>Requested At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incomingRequests.map((request) => {
                const pending = request.status === 'pending';
                return (
                  <tr key={request.request_id}>
                    <td>{request.dataset_name}</td>
                    <td>{request.requester_username}</td>
                    <td>{request.requester_email}</td>
                    <td>{statusLabel(request.status)}</td>
                    <td>{new Date(request.requested_at).toLocaleString()}</td>
                    <td>
                      {pending ? (
                        <div className="row-actions">
                          <button
                            className="btn-inline"
                            onClick={() => handleUpdateRequest(request.request_id, 'approved')}
                            disabled={actionBusyKey === `manage-${request.request_id}-approved`}
                          >
                            Approve
                          </button>
                          <button
                            className="btn-inline"
                            onClick={() => handleUpdateRequest(request.request_id, 'rejected')}
                            disabled={actionBusyKey === `manage-${request.request_id}-rejected`}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="status-muted">Handled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3>Current Access Grants</h3>
      {grants.length === 0 ? (
        <p className="status-muted">No active grants yet for datasets you manage.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>User</th>
                <th>Email</th>
                <th>Granted By</th>
                <th>Granted At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.grant_id}>
                  <td>{grant.dataset_name}</td>
                  <td>{grant.grantee_username}</td>
                  <td>{grant.grantee_email}</td>
                  <td>{grant.granted_by_username}</td>
                  <td>{new Date(grant.granted_at).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn-inline"
                      onClick={() => handleRevokeGrant(grant.grant_id)}
                      disabled={actionBusyKey === `revoke-${grant.grant_id}`}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Your Access Requests</h3>
      {outgoingRequests.length === 0 ? (
        <p className="status-muted">You have not requested access to any datasets yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Requested At</th>
              </tr>
            </thead>
            <tbody>
              {outgoingRequests.map((request) => (
                <tr key={request.request_id}>
                  <td>{request.dataset_name}</td>
                  <td>{request.owner_username}</td>
                  <td>{statusLabel(request.status)}</td>
                  <td>{new Date(request.requested_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status && <p className="status-success">{status}</p>}
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

      {data.length === 0 && !rowsLoading && !error && (
        <p className="status-muted">Choose a dataset with granted access, then retrieve rows.</p>
      )}
    </div>
  );
}

export default GlossTableDisplay;