import GlossTableDisplay from '../components/GlossTableDisplay';

const ViewData = () => {
  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Explore Uploaded Data</h2>
        <p>Browse all dataset metadata, request access when needed, and manage requests for datasets you own.</p>
      </div>
      <GlossTableDisplay />
    </section>
  );
};

export default ViewData;