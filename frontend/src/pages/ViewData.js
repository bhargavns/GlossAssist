import GlossTableDisplay from '../components/GlossTableDisplay';

const ViewData = () => {
  return (
    <section className="data-page">
      <div className="data-page-header">
        <h2>Explore Uploaded Data</h2>
        <p>Preview accessible datasets (your private uploads plus admin-shared datasets) before annotation.</p>
      </div>
      <GlossTableDisplay />
    </section>
  );
};

export default ViewData;