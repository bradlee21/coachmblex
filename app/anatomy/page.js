import Link from 'next/link';

export default function AnatomyPage() {
  return (
    <section data-testid="anatomy-root">
      <h1>Anatomy</h1>
      <p>Visual study packs mapped to the MBLEx blueprint.</p>
      <div className="runner">
        <h2>Pelvis / Hip Landmarks</h2>
        <p>Blueprint code: 2.D</p>
        <Link className="nav-link active" href="/anatomy/pelvis-hip" data-testid="anatomy-pack-0">
          Open Diagram Quiz
        </Link>
      </div>
    </section>
  );
}
