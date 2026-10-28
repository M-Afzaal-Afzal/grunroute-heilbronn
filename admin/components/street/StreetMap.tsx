"use client";
// Map for one street: the street itself, register tree crowns, heat walk
// spots, close-pass points, crashes and schools near it. Used on the dossier
// and on the print pages (static, no controls).
import { useEffect, useRef } from "react";
import { useLeaflet } from "@/components/map/useLeaflet";
import { HEAT_DOT } from "@/lib/colors";

export type Pt = { lat: number; lng: number; title: string };
export type StreetMapLayers = {
  lines: [number, number][][];
  color: string;
  crowns: (Pt & { r: number })[];
  heat: (Pt & { warm: boolean })[];
  passes: Pt[];
  crashes: (Pt & { category: number })[];
  schools: Pt[];
};

// Okabe-Ito colours for points, so they stay apart for colour-blind readers.
export const MAP_COLORS = { crown: "#009E73", pass: "#CC79A7", crash: "#000000", school: "#E69F00", cool: "#0072B2", heat: HEAT_DOT };

export function StreetMap({ layers, height = 460, label, still = false }: { layers: StreetMapLayers; height?: number; label: string; still?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref, { zoom: 16 });

  useEffect(() => {
    if (!ctx) return;
    const { map, L } = ctx;
    if (still) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.zoomControl.remove();
    }
    const renderer = L.canvas({ padding: 0.5 });
    const g = L.layerGroup().addTo(map);
    const tip = (l: { bindTooltip: (t: string) => unknown }, t: string) => !still && l.bindTooltip(t);
    for (const c of layers.crowns) {
      const l = L.circle([c.lat, c.lng], { renderer, radius: Math.max(1, c.r), color: MAP_COLORS.crown, weight: 1, fillOpacity: 0.25 });
      tip(l, c.title);
      g.addLayer(l);
    }
    for (const line of layers.lines) {
      g.addLayer(L.polyline(line, { renderer, color: "#0f2a23", weight: 11, opacity: 0.55 }));
      g.addLayer(L.polyline(line, { renderer, color: layers.color, weight: 7 }));
    }
    for (const h of layers.heat) {
      const l = L.circleMarker([h.lat, h.lng], { renderer, radius: 7, color: "#fff", weight: 1.5, fillColor: h.warm ? MAP_COLORS.heat : MAP_COLORS.cool, fillOpacity: 0.9 });
      tip(l, h.title);
      g.addLayer(l);
    }
    for (const p of layers.passes) {
      const l = L.circleMarker([p.lat, p.lng], { renderer, radius: 4, color: MAP_COLORS.pass, weight: 1, fillColor: MAP_COLORS.pass, fillOpacity: 0.8 });
      tip(l, p.title);
      g.addLayer(l);
    }
    for (const c of layers.crashes) {
      const l = L.circleMarker([c.lat, c.lng], { renderer, radius: 9 - c.category * 1.5, color: "#fff", weight: 2, fillColor: MAP_COLORS.crash, fillOpacity: 1 });
      tip(l, c.title);
      g.addLayer(l);
    }
    for (const s of layers.schools) {
      const l = L.circleMarker([s.lat, s.lng], { renderer, radius: 8, color: "#000", weight: 1.5, fillColor: MAP_COLORS.school, fillOpacity: 1 });
      tip(l, s.title);
      g.addLayer(l);
    }
    const pts = layers.lines.flat();
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17, animate: false });
    return () => {
      g.remove();
    };
  }, [ctx, layers, still]);

  return <div ref={ref} className="pl-map" style={{ height }} role="region" aria-label={label} />;
}

export function StreetMapLegend({ counts }: { counts: { crowns: number; heat: number; passes: number | null; crashes: number; schools: number } }) {
  const i = (c: string, round = true) => <i style={{ background: c, borderRadius: round ? "50%" : 3 }} aria-hidden="true" />;
  return (
    <div className="pl-legend" style={{ marginTop: 8 }}>
      <span>{i(MAP_COLORS.crown)}Tree crowns, register ({counts.crowns})</span>
      <span>
        {i(MAP_COLORS.heat)}warmer / {i(MAP_COLORS.cool)}cooler heat walk spots ({counts.heat})
      </span>
      <span>
        {i(MAP_COLORS.pass)}Close-pass points ({counts.passes == null ? "not loaded" : counts.passes})
      </span>
      <span>{i(MAP_COLORS.crash)}Crashes, bigger is more severe ({counts.crashes})</span>
      <span>{i(MAP_COLORS.school)}Schools and kindergartens ({counts.schools})</span>
    </div>
  );
}
