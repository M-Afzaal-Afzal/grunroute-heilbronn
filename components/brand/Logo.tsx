// GrunRoute winning logo, Flow Leaf: one smooth white route curve
// sweeping from bottom left to top right on a rounded deep forest green
// square, ending in a bright leaf, with a small bright dot at the start.
// Matches the brand kit winner in
// ~/workspace/projects/grunroute-brand/logos/winner/logo-symbol.svg.
// The bright keyline keeps the square edge readable on dark backgrounds.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="GrünRoute logo: a smooth route sweeping up to a leaf" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#0B4D2E" stroke="#4ADE80" strokeWidth="1.5" />
      <path
        d="M11 35 Q24 30 37 13"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path d="M37 13 C37 8.5 41.5 6 45 8 C45 12 41 14.5 37 13 Z" fill="#4ADE80" />
      <circle cx="11" cy="35" r="2.6" fill="#4ADE80" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={36} />
      <span className="wordmark-text">
        <strong>GrünRoute Heilbronn</strong>
      </span>
    </span>
  );
}
