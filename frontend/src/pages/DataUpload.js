import React, { useState, useEffect } from 'react';
import axios from 'axios';

import GlossTableUpload from '../components/GlossTableUpload';

const DataUpload = () => {
  return (
    <div>
      <h2> Upload your data here </h2>
      <p> Data needs to be a .csv file with 5 columns - transcript, segmentation, gloss, translation, and source (train/dev/test) </p>
      <GlossTableUpload />
    </div>
  );
};

export default DataUpload;