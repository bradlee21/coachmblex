const PRESET_NAMES = new Set(['mist', 'dawn', 'ocean', 'slate']);

export default function CalmBackground({
  preset = 'mist',
  blobs = true,
  noise = false,
  children,
}) {
  const normalizedPreset = PRESET_NAMES.has(preset) ? preset : 'mist';

  return (
    <div className={`calm-bg calm-bg--${normalizedPreset}`}>
      <div className="calm-bg__base" aria-hidden="true" />
      {blobs ? (
        <>
          <div className="calm-bg__blob calm-bg__blob--a" aria-hidden="true" />
          <div className="calm-bg__blob calm-bg__blob--b" aria-hidden="true" />
        </>
      ) : null}
      {noise ? <div className="calm-bg__noise" aria-hidden="true" /> : null}
      <div className="calm-bg__content">{children}</div>
    </div>
  );
}
