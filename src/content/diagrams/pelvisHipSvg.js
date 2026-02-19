export default function PelvisHipSvg() {
  return (
    <svg viewBox="0 0 900 560" role="img" aria-label="Pelvis and hip landmarks diagram">
      <g fill="none" stroke="#111827" strokeWidth="3">
        <path d="M160 220 C210 130, 320 90, 450 130 C580 90, 690 130, 740 220" />
        <path d="M160 220 C150 290, 200 370, 280 400" />
        <path d="M740 220 C750 290, 700 370, 620 400" />
        <path d="M280 400 C330 430, 390 430, 450 390 C510 430, 570 430, 620 400" />
        <path d="M430 180 L470 180 L490 340 L410 340 Z" />
      </g>

      <g fill="#dbeafe" stroke="#1d4ed8" strokeWidth="2">
        <circle id="iliac_crest" cx="450" cy="118" r="18" />
        <circle id="asis" cx="300" cy="210" r="14" />
        <circle id="aiis" cx="320" cy="250" r="14" />
        <circle id="psis" cx="590" cy="210" r="14" />
        <circle id="ischial_tuberosity" cx="500" cy="405" r="14" />
        <circle id="pubic_symphysis" cx="450" cy="350" r="14" />
        <circle id="acetabulum" cx="360" cy="325" r="14" />
        <circle id="greater_trochanter" cx="320" cy="365" r="14" />
        <circle id="sacrum" cx="450" cy="250" r="16" />
      </g>
    </svg>
  );
}
