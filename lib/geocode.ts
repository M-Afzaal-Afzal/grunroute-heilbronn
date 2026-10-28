// Place search for the trip planner, through Nominatim on OpenStreetMap.
// The usage policy asks for no search as you type, so this runs only when the
// user taps Search. Only the typed text is sent, never the location.
import type { LatLng } from "./geo";

export type Place = { label: string; detail: string; at: LatLng };

// A box around Heilbronn and its neighbours. Results inside it come first,
// results outside are still allowed.
const VIEWBOX = "8.95,49.30,9.45,49.00";

type NominatimHit = { lat: string; lon: string; name?: string; display_name: string };

export async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const text = q.trim();
  if (text.length < 3) return [];
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=de&accept-language=de,en" +
    `&viewbox=${VIEWBOX}&bounded=0&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const hits = (await res.json()) as NominatimHit[];
  return hits.map((h) => {
    const parts = h.display_name.split(", ");
    const label = h.name || parts[0];
    return { label, detail: parts.filter((p) => p !== label).slice(0, 3).join(", "), at: [Number(h.lat), Number(h.lon)] as LatLng };
  });
}
