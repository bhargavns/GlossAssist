import GlossTableUpload from '../components/GlossTableUpload';

const DataUpload = () => {
  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Upload Dataset</h2>
        <p>
          Upload a CSV with transcript, segmentation, gloss, translation, and source columns.
          Every dataset is owned by the uploader. Other users can request access from the dataset owner.
        </p>
      </div>
      <GlossTableUpload />
    </section>
  );
};

export default DataUpload;