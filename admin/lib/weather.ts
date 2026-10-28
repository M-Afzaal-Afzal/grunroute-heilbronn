// Today's temperature from DWD via Bright Sky (MIT licensed API, DWD open
// data). Station 15547 Heilbronn/Neckar comes first. In Bright Sky it has no
// temperature (wind only, checked 28 Oct 2026), so the nearest station with
// temperature, 03734 Obersulm-Willsbach, is used and named on the page.
export const HOT_DAY_C = 30;
export const STATIONS = [
  { id: "15547", name: "Heilbronn/Neckar" },
  { id: "03734", name: "Obersulm-Willsbach" },
] as const;

export type HourTemp = { hour: string; observed: number | null; forecast: number | null };
export type DayWeather = { station: (typeof STATIONS)[number]; tried: string[]; hours: HourTemp[]; max: number | null; maxObserved: number | null };

type BrightSky = {
  weather?: { timestamp: string; source_id: number; temperature: number | null }[];
  sources?: { id: number; observation_type: string }[];
};

export function berlinDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function fetchToday(signal?: AbortSignal): Promise<DayWeather | null> {
  const date = berlinDate();
  const tried: string[] = [];
  for (const station of STATIONS) {
    tried.push(station.id);
    const r = await fetch(`https://api.brightsky.dev/weather?dwd_station_id=${station.id}&date=${date}&tz=Europe/Berlin`, { signal });
    if (!r.ok) continue;
    const j = (await r.json()) as BrightSky;
    const kind = new Map((j.sources ?? []).map((s) => [s.id, s.observation_type]));
    const hours = (j.weather ?? [])
      .filter((w) => w.timestamp.startsWith(date))
      .map((w) => {
        const fc = kind.get(w.source_id) === "forecast";
        return { hour: w.timestamp.slice(11, 16), observed: fc ? null : w.temperature, forecast: fc ? w.temperature : null };
      });
    const vals = hours.flatMap((h) => [h.observed, h.forecast]).filter((v): v is number => v != null);
    if (!vals.length) continue;
    const obs = hours.map((h) => h.observed).filter((v): v is number => v != null);
    return { station, tried, hours, max: Math.max(...vals), maxObserved: obs.length ? Math.max(...obs) : null };
  }
  return null;
}
