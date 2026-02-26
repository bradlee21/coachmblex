 'use client';

import { usePathname } from 'next/navigation';

const PRESET_NAMES = new Set(['mist', 'dawn', 'ocean', 'slate']);

export default function CalmBackground({
  preset = 'mist',
  blobs = true,
  noise = false,
  children,
}) {
  const normalizedPreset = PRESET_NAMES.has(preset) ? preset : 'mist';
  const pathname = usePathname() || '';
  const isLandingRoute = pathname === '/';

  return (
    <div
      className={`calm-bg calm-bg--${normalizedPreset}${isLandingRoute ? ' calm-bg--route-landing' : ''}`}
    >
      {!isLandingRoute ? <div className="calm-bg__base" aria-hidden="true" /> : null}
      {!isLandingRoute && blobs ? (
        <>
          <div className="calm-bg__blob calm-bg__blob--a" aria-hidden="true" />
          <div className="calm-bg__blob calm-bg__blob--b" aria-hidden="true" />
        </>
      ) : null}
      {!isLandingRoute && noise ? <div className="calm-bg__noise" aria-hidden="true" /> : null}
      {!isLandingRoute ? (
        <div className="calm-bg__watermark" aria-hidden="true">
          <span>COACH MBLEX</span>
          <span>COACH MBLEX</span>
        </div>
      ) : null}
      <div className="calm-bg__content">{children}</div>
    </div>
  );
}
