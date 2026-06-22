import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';

import './styles/GlosserPage.css';
import HomePage from './pages/HomePage';
import ViewData from './pages/ViewData';
import DataUpload from './pages/DataUpload';
import Dashboard from './pages/Dashboard';
import GlossingPage from './pages/GlossingPage';
import TestPage from './pages/TestPage';
import LiveGlossingPage from "./pages/LiveGlossingPage";
import AuthPage from './pages/AuthPage';
import StudyModePage from './pages/StudyModePage';
import AdminConsolePage from './pages/AdminConsolePage';
import CompletedSessionsPage from './pages/CompletedSessionsPage';
import { fetchCurrentUser } from './utils/api';
import { clearStoredAuth, getStoredAuth } from './utils/auth';

function ProtectedRoute({ isAuthed, children }) {
  if (!isAuthed) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => getStoredAuth()?.user || null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const auth = getStoredAuth();
      if (!auth?.token) {
        setAuthLoading(false);
        return;
      }

      try {
        const user = await fetchCurrentUser();
        setCurrentUser(user);
      } catch {
        clearStoredAuth();
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    validateSession();
  }, []);

  const handleLogout = () => {
    clearStoredAuth();
    setCurrentUser(null);
  };

  if (authLoading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-spinner" />
        <p>Checking session...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-brand">
            <span className="app-brand-mark" />
            <div>
              <h1>GlossAssist</h1>
              <p>Linguistic Annotation Workspace</p>
            </div>
          </div>

          {currentUser && (
            <div className="app-user-panel">
              <span>
                Signed in as <strong>{currentUser.username}</strong>
              </span>
              <button className="btn-inline" onClick={handleLogout}>Log out</button>
            </div>
          )}

          <nav className="app-nav">
            {currentUser ? (
              <>
                <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Home</NavLink>
                <NavLink to="/glossing" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Glossing</NavLink>
                <NavLink to="/view_data" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>View Data</NavLink>
                <NavLink to="/data_upload" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Upload Data</NavLink>
                <NavLink to="/study_mode" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>User Study</NavLink>
                <NavLink to="/completed_sessions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Completed Sessions</NavLink>
                {currentUser?.role === 'admin' && (
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Admin Console</NavLink>
                )}
              </>
            ) : (
              <NavLink to="/auth" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Sign In</NavLink>
            )}
          </nav>
        </header>

        <main className="app-main-content">
          <Routes>
            <Route
              path="/auth"
              element={
                currentUser
                  ? <Navigate to="/glossing" replace />
                  : <AuthPage onAuthenticated={setCurrentUser} />
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/glossing"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/glossing" replace />} />
            <Route
              path="/gloss/:language/:example_num"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <GlossingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/data_upload"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <DataUpload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/view_data"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <ViewData />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test_page"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <TestPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gloss-live/:language/:model/:example_num"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <LiveGlossingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/study_mode"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <StudyModePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/completed_sessions"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  <CompletedSessionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute isAuthed={!!currentUser}>
                  {currentUser?.role === 'admin' ? <AdminConsolePage /> : <Navigate to="/glossing" replace />}
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={currentUser ? '/glossing' : '/auth'} replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;