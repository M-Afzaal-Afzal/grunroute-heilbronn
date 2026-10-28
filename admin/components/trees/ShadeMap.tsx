"use client";
// Shade map for the Kernstadt: building shadows for the chosen hour on
// 21 July, register tree crowns (approximate discs), and the measured street
// segments coloured by their share in shade at that hour.
import { useEffect, useMemo, useRef } from "react";
import type * as Leaflet from "leaflet";
import { useLeaflet } from "@/components/map/useLeaflet";
import { shadeDate, shadowOffset, sunPosition } from "@/lib/shared/sun";
import { ramp } from "@/lib/colors";

export type BuildingsFile = {
  osmBase: string | null;
  bbox: [number, number, number, number];
  day: string;
  hours: number[];
  heightRule: string;
  heightSource: { height: number; levels: number; default: number };
  buildings: number;
  base: [number, number];
  b: number[][];
};
export type ShadeLine = { id: number; lines: [number, number][][]; shade: number[]; title: string };
type Building = { h: number; ll: [number, number][] };

const KY = 111200;
const KX = 111320 * Math.cos((49.14 * Math.PI) / 180);
export const SHADE_COLOR = "#1f2a6b";
export const BUILDING_COLOR = "#d9d4ce";

// Panes keep the order fixed: shadows, then buildings on top, then crowns.
function pane(map: Leaflet.Map, name: string, z: number) {
  if (!map.getPane(name)) map.createPane(name).style.zIndex = String(z);
  return name;
}
export const CROWN_COLOR = "#009E73";

export function decodeBuildings(f: BuildingsFile): Building[] {
  return f.b.map((row) => {
    const ll: [number, number][] = [];
    let a = 0, g = 0;
    for (let i = 1; i < row.length; i += 2) {
      a += row[i];
      g += row[i + 1];
      ll.push([f.base[0] + a / 1e5, f.base[1] + g / 1e5]);
    }
    return { h: row[0], ll };
  });
}

// Monotone chain convex hull, counter-clockwise, so all shadow rings wind the
// same way and a nonzero fill draws their union in one even tone.
function hull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Shadow outlines for one hour: hull of the footprint and the footprint moved by the shadow. Approximate for L-shaped blocks. */
export function shadows(buildings: Building[], hour: number, centre: [number, number]): [number, number][][] {
  const sun = sunPosition(shadeDate(hour), centre[0], centre[1]);
  const unit = shadowOffset(1, sun);
  if (!unit) return [];
  return buildings.map((b) => {
    const dLat = (unit[1] * b.h) / KY, dLng = (unit[0] * b.h) / KX;
    return hull([...b.ll, ...b.ll.map(([la, lo]) => [la + dLat, lo + dLng] as [number, number])]);
  });
}

type Props = {
  file: BuildingsFile;
  hourIdx: number;
  lines: ShadeLine[];
  crowns: { lat: number; lng: number; r: number }[];
  focus?: number | null;
  onPick?: (id: number) => void;
  height?: number;
};

export function ShadeMap({ file, hourIdx, lines, crowns, focus, onPick, height = 560 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref, { zoom: 15, center: [(file.bbox[0] + file.bbox[2]) / 2, (file.bbox[1] + file.bbox[3]) / 2] });
  const buildings = useMemo(() => decodeBuildings(file), [file]);
  const centre = useMemo<[number, number]>(() => [(file.bbox[0] + file.bbox[2]) / 2, (file.bbox[1] + file.bbox[3]) / 2], [file]);
  const hour = file.hours[hourIdx];

  // Static layers: building outlines and crowns.
  useEffect(() => {
    if (!ctx) return;
    const { map, L } = ctx;
    const bRenderer = L.canvas({ padding: 0.3, pane: pane(map, "pl-buildings", 360) });
    const cRenderer = L.canvas({ padding: 0.3, pane: pane(map, "pl-crowns", 370) });
    const rings = crowns.map((c) => {
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * 2 * Math.PI;
        pts.push([c.lat + (Math.sin(a) * c.r) / KY, c.lng + (Math.cos(a) * c.r) / KX]);
      }
      return [pts];
    });
    const crownLayer = L.polygon(rings, { renderer: cRenderer, stroke: false, fillColor: CROWN_COLOR, fillOpacity: 0.45, fillRule: "nonzero", interactive: false }).addTo(map);
    const outline = L.polygon(buildings.map((b) => [b.ll]), { renderer: bRenderer, color: "#8a847d", weight: 0.6, fillColor: BUILDING_COLOR, fillOpacity: 1, interactive: false }).addTo(map);
    return () => {
      crownLayer.remove();
      outline.remove();
    };
  }, [ctx, buildings, crowns]);

  // Shadows for the hour, one path so overlaps do not get darker.
  useEffect(() => {
    if (!ctx) return;
    const { map, L } = ctx;
    const renderer = L.canvas({ padding: 0.3, pane: pane(map, "pl-shadows", 350) });
    const layer = L.polygon(
      shadows(buildings, hour, centre).map((r) => [r]),
      { renderer, stroke: false, fillColor: SHADE_COLOR, fillOpacity: 0.45, fillRule: "nonzero", interactive: false },
    ).addTo(map);
    return () => {
      layer.remove();
    };
  }, [ctx, buildings, hour, centre]);

  // Street segments coloured by shade share at the hour.
  useEffect(() => {
    if (!ctx) return;
    const { map, L } = ctx;
    const renderer = L.canvas({ padding: 0.3, tolerance: 6 });
    const g = L.layerGroup().addTo(map);
    for (const s of lines) {
      const v = s.shade[hourIdx];
      const casing = L.polyline(s.lines, { renderer, color: "#111", weight: s.id === focus ? 9 : 6, opacity: 0.55, interactive: false });
      const l = L.polyline(s.lines, { renderer, color: ramp(v), weight: s.id === focus ? 6 : 3.5 });
      l.bindTooltip(`${s.title}: ${Math.round(v * 100)}% in shade at ${hour}:00`);
      if (onPick) l.on("click", () => onPick(s.id));
      g.addLayer(casing).addLayer(l);
    }
    return () => {
      g.remove();
    };
  }, [ctx, lines, hourIdx, hour, focus, onPick]);

  useEffect(() => {
    if (!ctx || focus == null) return;
    const s = lines.find((x) => x.id === focus);
    if (s) ctx.map.fitBounds(s.lines.flat() as Leaflet.LatLngExpression[] as never, { maxZoom: 17, padding: [40, 40] });
  }, [ctx, focus, lines]);

  return <div ref={ref} className="pl-map" style={{ height }} role="region" aria-label={`Shade map of the Kernstadt at ${hour}:00 on 21 July`} />;
}
