import React, { useState } from "react";
import Papa from "papaparse";
import { uploadGlosses } from "../utils/api";

const GlossTableUpload = () => {
  const [data, setData] = useState([]);
  const [languageCode, setLanguageCode] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const [status, setStatus] = useState('');

  //   useEffect(() => {
  //     console.log('Fetching CSV...');
  //     fetch('/data.csv')
  //       .then(response => {
  //         console.log('Response:', response);
  //         return response.text();
  //       })
  //       .then(csvText => {
  //         console.log('CSV text:', csvText);
  //         Papa.parse(csvText, {
  //           header: true,
  //           skipEmptyLines: true,
  //           complete: (results) => {
  //             console.log('Parsed data:', results.data);
  //             setData(results.data);
  //           }
  //         });
  //       })
  //       .catch(error => console.error('Error:', error));
  //   }, []);

  //   console.log('Current data state:', data);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("File selected: ", file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("Parsed data:", results.data);
        setData(results.data);
      },
      error: (error) => {
        console.error("Parse error:", error);
      },
    });
  };

  const saveToDatabase = async () => {
    if (!languageCode.trim()) {
      setStatus('Please provide a language before saving.');
      return;
    }

    if (!datasetName.trim()) {
      setStatus('Please provide a dataset name before saving.');
      return;
    }

    setStatus('Saving dataset...');

    try {
      const result = await uploadGlosses({
        language: languageCode.trim(),
        datasetName: datasetName.trim(),
        data
      });
      setStatus(`Data saved successfully. ${result.count} rows inserted into dataset #${result.dataset_id}.`);
    } catch (error) {
      console.error("Error saving:", error);
      setStatus(`Failed to save data: ${error}`);
    }
  };

  return (
    <div className="data-panel">
      <div className="data-controls">
        <label htmlFor="uploadLanguage">Language code</label>
        <input
          id="uploadLanguage"
          type="text"
          value={languageCode}
          onChange={(event) => setLanguageCode(event.target.value)}
          placeholder="e.g., Swahili, Yao"
        />

        <label htmlFor="datasetName">Dataset name</label>
        <input
          id="datasetName"
          type="text"
          value={datasetName}
          onChange={(event) => setDatasetName(event.target.value)}
          placeholder="e.g., Pilot_Study_A"
        />
        <label htmlFor="csvInput">Dataset CSV</label>
        <input id="csvInput" type="file" accept=".csv" onChange={handleFileUpload} />
      </div>

      {data.length > 0 && (
        <button className="btn-solid" onClick={saveToDatabase}>Save to Database</button>
      )}

      {status && <p className="status-muted">{status}</p>}

      {data.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
          <thead>
            <tr>
              <th>Transcript</th>
              <th>Segmentation</th>
              <th>Gloss</th>
              <th>Translation</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                <td>{row.transcript}</td>
                <td>{row.segmentation}</td>
                <td>{row.gloss}</td>
                <td>{row.translation}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GlossTableUpload;
