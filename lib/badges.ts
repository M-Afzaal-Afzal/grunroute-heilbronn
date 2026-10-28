// Help measure badges, worked out from the missions this browser adopted.
// Adopting is a promise to ride, not proof of a ride, so badges say "adopted".
import type { Mission, TimeBandId } from "./missions";

export type Adopted = { id: string; district: string; timeBand: TimeBandId; school: boolean; at: string };
export type Badge = { id: "first" | "bands" | "school"; label: string; text: string; earned: boolean };

export function adoptedFrom(m: Mission, at = new Date().toISOString()): Adopted {
  return { id: m.id, district: m.district, timeBand: m.timeBand, school: m.streets.some((s) => s.role === "school"), at };
}

export function badges(list: Adopted[]): Badge[] {
  const bands = new Set(list.map((a) => a.timeBand));
  return [
    { id: "first", label: "First mission", text: "You adopted your first data mission.", earned: list.length >= 1 },
    { id: "bands", label: "3 time bands", text: "Missions in the morning, at midday, and in the afternoon.", earned: bands.size >= 3 },
    { id: "school", label: "School street helper", text: "A mission with a school street. Adults collect the data.", earned: list.some((a) => a.school) },
  ];
}

export function toggleAdopt(list: Adopted[], m: Mission): Adopted[] {
  return list.some((a) => a.id === m.id) ? list.filter((a) => a.id !== m.id) : [...list, adoptedFrom(m)];
}
