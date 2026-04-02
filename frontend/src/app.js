import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import './styles/GlosserPage.css';
import HomePage from './pages/HomePage';
import ViewData from './pages/ViewData';
import DataUpload from './pages/DataUpload';
import Dashboard from './pages/Dashboard';
import GlossingPage from './pages/GlossingPage';
import TestPage from './pages/TestPage';

function App() {
  return (
    <Router>
      <div className="App" style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <header className="App-header">
          <h1>Linguistic Glossing Application</h1>
          <nav style={{ margin: '20px 0' }}>
            <Link to="/" style={{ marginRight: '15px' }}>Home</Link>
            <Link to="/dashboard" style={{ marginRight: '15px' }}>Dashboard</Link>
            <Link to="/view_data" style={{ marginRight: '15px' }}>View Data</Link>
            <Link to="/data_upload" style={{ marginRight: '15px' }}>Upload Data</Link>
          </nav>

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/gloss/:language/:example_num" element={<GlossingPage />} />
            <Route path="/data_upload" element={<DataUpload />} />
            <Route path="/view_data" element={<ViewData />} />
            <Route path="/test_page" element={<TestPage />} />
          </Routes>
        </header>
      </div>
    </Router>
  );
}

export default App;