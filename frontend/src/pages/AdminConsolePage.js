import React, { useEffect, useState } from 'react';
import {
  createRegistrationCode,
  fetchCodeRequests,
  fetchRegistrationCodes,
  updateCodeRequestStatus
} from '../utils/api';

function AdminConsolePage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newCode, setNewCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const loadAdminData = async () => {
    setLoading(true);
    setError('');

    try {
      const [requestsData, codeData] = await Promise.all([
        fetchCodeRequests(),
        fetchRegistrationCodes()
      ]);
      setRequests(requestsData || []);
      setCodes(codeData || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleStatusUpdate = async (requestId, status) => {
    setError('');
    setSuccess('');

    try {
      await updateCodeRequestStatus(requestId, status);
      setSuccess(`Request #${requestId} marked as ${status}.`);
      await loadAdminData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateCode = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await createRegistrationCode({
        code: newCode || undefined,
        expiresAt: expiresAt || null
      });
      setSuccess(`Created registration code: ${response.code}`);
      setNewCode('');
      setExpiresAt('');
      await loadAdminData();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Admin Console</h2>
        <p>Review code requests, issue registration codes, and track code usage.</p>
      </div>

      {error && <p className="status-error">{error}</p>}
      {success && <p className="status-success">{success}</p>}

      <div className="data-panel">
        <h3>Create Registration Code</h3>
        <form className="data-controls data-controls-inline" onSubmit={handleCreateCode}>
          <div>
            <label htmlFor="newCode">Code (optional)</label>
            <input
              id="newCode"
              type="text"
              placeholder="Auto-generated if blank"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value.toUpperCase())}
            />
          </div>

          <div>
            <label htmlFor="expiresAt">Expires At (optional)</label>
            <input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>

          <button className="btn-solid" type="submit">Create Code</button>
          <button className="btn-inline" type="button" onClick={loadAdminData}>Refresh</button>
        </form>
      </div>

      <div className="data-panel" style={{ marginTop: '12px' }}>
        <h3>Code Requests</h3>
        {loading ? (
          <p className="status-muted">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="status-muted">No code requests yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.request_id}>
                    <td>{request.request_id}</td>
                    <td>{request.requester_name || '-'}</td>
                    <td>{request.requester_email}</td>
                    <td>{request.message || '-'}</td>
                    <td>{request.status}</td>
                    <td>
                      <button
                        className="btn-inline"
                        type="button"
                        onClick={() => handleStatusUpdate(request.request_id, 'approved')}
                      >
                        Approve
                      </button>
                      {' '}
                      <button
                        className="btn-inline"
                        type="button"
                        onClick={() => handleStatusUpdate(request.request_id, 'rejected')}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="data-panel" style={{ marginTop: '12px' }}>
        <h3>Recent Registration Codes</h3>
        {loading ? (
          <p className="status-muted">Loading codes...</p>
        ) : codes.length === 0 ? (
          <p className="status-muted">No registration codes found.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Used</th>
                  <th>Used By</th>
                  <th>Created</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>{code.code}</td>
                    <td>{code.is_used ? 'Yes' : 'No'}</td>
                    <td>{code.used_by_username || '-'}</td>
                    <td>{new Date(code.created_at).toLocaleString()}</td>
                    <td>{code.expires_at ? new Date(code.expires_at).toLocaleString() : 'Never'}</td>
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

export default AdminConsolePage;
