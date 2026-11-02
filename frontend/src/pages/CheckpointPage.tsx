import { Link, useParams } from 'react-router-dom';
import { CheckpointForm } from '../components/CheckpointForm';
import { Layout } from '../components/Layout';

/** Reached via the header "Enter code" button, or by scanning a QR that links to /checkpoint/:code. */
export function CheckpointPage() {
  const { code } = useParams();

  return (
    <Layout>
      <Link to="/dashboard" className="text-xs text-parchment/60 hover:text-ember-glow">
        ← Back to the diyas
      </Link>
      <section className="mx-auto mt-10 max-w-2xl animate-rise">
        <p className="eyebrow">Physical marker</p>
        <h1 className="mt-4 text-5xl text-ember-glow">A diya in the real world</h1>
        <p className="mt-6 text-lg font-light text-parchment/65">
          Markers are hidden around the office. Each carries a short code. Enter it here to claim it.
        </p>
        <div className="card mt-10 border-ember/40 shadow-ember">
          <CheckpointForm initialCode={code} autoFocus={!code} />
        </div>
      </section>
    </Layout>
  );
}
