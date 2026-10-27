import Link from "next/link";

// GrünRoute logo, "Fix Point" mark.
// The u of Grün drawn as a street route: it runs down, bends, and comes up
// under a target point, the street to fix first. Drawn on a 120 grid.
// Source files and all variants live in the brand kit, logo folder.

const ROUTE = "M36 34 V64 A24 24 0 0 0 84 64 V56";

type Tone = "ink" | "green";

const TONES: Record<Tone, { tile: string; route: string; target: string; dot: string }> = {
  ink: { tile: "#0F2A23", route: "#12A150", target: "#8EE6A8", dot: "#0F2A23" },
  green: { tile: "#12A150", route: "#FFFFFF", target: "#0F2A23", dot: "#12A150" },
};

export function LogoMark({ size = 28, tone = "ink", title }: { size?: number; tone?: Tone; title?: string }) {
  const t = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect className="lm-tile" width="120" height="120" rx="28" fill={t.tile} />
      <g transform="translate(-1.5 2.5)">
        <path className="lm-route" d={ROUTE} fill="none" stroke={t.route} strokeWidth="18" strokeLinecap="round" />
        <circle className="lm-target" cx="84" cy="30" r="12" fill={t.target} />
        <circle className="lm-dot" cx="84" cy="30" r="4.5" fill={t.dot} />
      </g>
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link className="wordmark" href={href} aria-label="GrünRoute Heilbronn, home">
      <LogoMark size={28} />
      <span className="wordmark-text">
        <b>GrünRoute</b>
        <span>Heilbronn</span>
      </span>
    </Link>
  );
}
