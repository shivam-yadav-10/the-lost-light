import { Link } from 'react-router-dom';
import { DiyaLamp } from '../components/DiyaLamp';
import { Layout } from '../components/Layout';
import { useTeam } from '../store/team';

export function LandingPage() {
  const { session } = useTeam();

  return (
    <Layout bare>
      <section className="flex min-h-dvh flex-col items-center justify-center py-24 text-center">
        <div className="animate-rise">
          <DiyaLamp state="SOLVED" size={150} igniteDelay={300} className="mx-auto drop-shadow-[0_0_40px_rgba(251,191,36,0.45)]" />
        </div>

        <p className="eyebrow mt-10 animate-rise" style={{ animationDelay: '120ms' }}>
          GTCI &middot; Diwali &middot; 10 November
        </p>

        <div className="mt-6 animate-rise" style={{ animationDelay: '220ms' }}>
          <h1 className="text-shimmer text-6xl lg:text-8xl">The Lost Light</h1>
        </div>

        <p
          className="mt-10 max-w-xl text-lg font-light leading-relaxed text-parchment/70 lg:text-xl animate-rise"
          style={{ animationDelay: '320ms' }}
        >
          On the darkest night the light was scattered into six fragments and hidden across these halls.
        </p>
        <p
          className="mt-4 max-w-xl text-lg font-light leading-relaxed text-parchment/70 lg:text-xl animate-rise"
          style={{ animationDelay: '380ms' }}
        >
          Gather your team. Follow the glow. Bring it home before the day is done.
        </p>

        <div className="mt-16 animate-rise" style={{ animationDelay: '480ms' }}>
          <Link to={session ? '/dashboard' : '/login'} className="btn-ember">
            {session ? 'Continue with your team' : 'Enter with your team key'}
          </Link>
        </div>
      </section>
    </Layout>
  );
}
