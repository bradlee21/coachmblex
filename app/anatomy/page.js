import Link from 'next/link';

export default function AnatomyPage() {
  return (
    <section>
      <h1>Anatomy</h1>
      <p>Visual study packs mapped to the MBLEx blueprint.</p>
      <div className="runner">
        <h2>Pelvis / Hip Landmarks</h2>
        <p>Blueprint code: 2.D</p>
        <Link className="nav-link active" href="/anatomy/pelvis-hip">
          Open Diagram Quiz
        </Link>
      </div>
    </section>
  );
}
