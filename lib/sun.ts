// Sun position for the shade estimate, written here instead of adding a
// library. Standard low precision solar formulas (Astronomical Almanac,
// about 0.01 degree), plenty for building shadows.
// No imports, so node scripts can load it directly.

const RAD = Math.PI / 180;

/** Sun azimuth (radians, 0 = north, clockwise) and altitude (radians above the horizon). */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const lst = (gmst * 15 + lng) * RAD;
  const H = lst - ra; // hour angle
  const phi = lat * RAD;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { azimuth: (azSouth + Math.PI) % (2 * Math.PI), altitude };
}

/**
 * Shadow offset in metres (east, north) for a height h at the given sun
 * position, or null when the sun is below the horizon.
 */
export function shadowOffset(h: number, sun: { azimuth: number; altitude: number }): [number, number] | null {
  if (sun.altitude <= 0.01) return null;
  const len = Math.min(h / Math.tan(sun.altitude), 300);
  // The shadow points away from the sun.
  return [-Math.sin(sun.azimuth) * len, -Math.cos(sun.azimuth) * len];
}

/** Hours used for the shade estimate, local time on 21 July 2026 (CEST, UTC+2). */
export const SHADE_DAY = "2026-07-21";
export const SHADE_HOURS = [9, 12, 15, 18] as const;
export const shadeDate = (hour: number) => new Date(`${SHADE_DAY}T${String(hour).padStart(2, "0")}:00:00+02:00`);
