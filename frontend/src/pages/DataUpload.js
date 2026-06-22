import GlossTableUpload from '../components/GlossTableUpload';

const DataUpload = () => {
  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Upload Dataset</h2>
        <p>
          Upload a CSV with transcript, segmentation, gloss, translation, and source columns.
          Datasets uploaded by admins are shared; datasets uploaded by standard users are private.
        </p>
      </div>
      <GlossTableUpload />
    </section>
  );
};

export default DataUpload;