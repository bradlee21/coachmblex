const LINES = Array.from({ length: 12 }, (_, index) => index + 1);

export default function PlaceholderSectionPage({ title }) {
  return (
    <section>
      <h1>{title}</h1>
      {LINES.map((line) => (
        <p key={line}>{title} placeholder line {line}.</p>
      ))}
    </section>
  );
}
