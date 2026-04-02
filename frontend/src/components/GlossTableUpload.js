import React, { useState, useEffect } from "react";
import Papa from "papaparse";

const GlossTableUpload = () => {
  const [data, setData] = useState([]);

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

  const saveToDatabase = () => {
    const lang = prompt('Enter language code (e.g., "en", "es"):');
    if (!lang) return;

    console.log("Saving to database:", data);

    fetch("http://localhost:5001/api/upload_glosses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lang: lang, data: data }),
    })
      .then((response) => response.json())
      .then((result) => {
        console.log("Saved:", result);
        alert(`Data saved! ${result.count} rows inserted.`);
      })
      .catch((error) => {
        console.error("Error saving:", error);
        alert("Error saving to database");
      });
  };

  return (
    <div>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
      {data.length > 0 && (
        <button onClick={saveToDatabase}>Save to Database</button>
      )}

      {data.length > 0 && (
        <table border="1">
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
      )}
    </div>
  );
};

export default GlossTableUpload;
