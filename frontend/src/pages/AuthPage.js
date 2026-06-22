import React, { useState } from 'react';
import { login, register, requestAccessCode } from '../utils/api';
import { storeAuth } from '../utils/auth';

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    password: '',
    code: ''
  });
  const [requestForm, setRequestForm] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await login(loginForm.identifier, loginForm.password);
      storeAuth({ token: response.token, user: response.user });
      onAuthenticated(response.user);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await register(registerForm);
      storeAuth({ token: response.token, user: response.user });
      onAuthenticated(response.user);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await requestAccessCode(requestForm);
      const detail = response.emailSent
        ? 'Your request has been sent to the admin.'
        : 'Your request was recorded. Admin email delivery is not configured yet.';
      setSuccessMessage(detail);
      setRequestForm({ name: '', email: '', message: '' });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h2>Access GlossAssist</h2>
        <p className="auth-subtitle">Sign in, register with an access code, or request one from the admin team.</p>

        <div className="auth-tabs">
          <button className="auth-tab" onClick={() => setMode('login')} disabled={loading || mode === 'login'}>
            Login
          </button>
          <button className="auth-tab" onClick={() => setMode('register')} disabled={loading || mode === 'register'}>
            Register
          </button>
          <button className="auth-tab" onClick={() => setMode('request-code')} disabled={loading || mode === 'request-code'}>
            Request code
          </button>
        </div>

        {error && <p className="status-error">{error}</p>}
        {successMessage && <p className="status-success">{successMessage}</p>}

        {mode === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <label htmlFor="loginIdentifier">Username or email</label>
            <input
              id="loginIdentifier"
              type="text"
              value={loginForm.identifier}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, identifier: event.target.value }))}
              required
            />

            <label htmlFor="loginPassword">Password</label>
            <input
              id="loginPassword"
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />

            <button className="btn-solid" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <label htmlFor="registerUsername">Username</label>
            <input
              id="registerUsername"
              type="text"
              value={registerForm.username}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />

            <label htmlFor="registerEmail">Email</label>
            <input
              id="registerEmail"
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />

            <label htmlFor="registerPassword">Password</label>
            <input
              id="registerPassword"
              type="password"
              value={registerForm.password}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={8}
            />

            <label htmlFor="registerCode">Registration code</label>
            <input
              id="registerCode"
              type="text"
              value={registerForm.code}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, code: event.target.value }))}
              required
            />

            <button className="btn-solid" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}

        {mode === 'request-code' && (
          <form className="auth-form" onSubmit={handleRequestCode}>
            <label htmlFor="requestName">Name (optional)</label>
            <input
              id="requestName"
              type="text"
              value={requestForm.name}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, name: event.target.value }))}
            />

            <label htmlFor="requestEmail">Email</label>
            <input
              id="requestEmail"
              type="email"
              value={requestForm.email}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />

            <label htmlFor="requestMessage">Why do you need access? (optional)</label>
            <textarea
              id="requestMessage"
              value={requestForm.message}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, message: event.target.value }))}
              rows={4}
            />

            <button className="btn-solid" type="submit" disabled={loading}>
              {loading ? 'Submitting...' : 'Request code'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default AuthPage;
