"use client";
// Street network map: coloured lines (and optional polygons), one canvas
// layer. Clicking a line or polygon calls onPick. `focus` flies to a feature
// and outlines it.
import { useEffect, useRef, type ReactNode } from "react";
import type * as Leaflet from "leaflet";
import { useLeaflet, type LeafletNS } from "./useLeaflet";

export type MapLine = { id: number | string; lines: [number, number][][]; color: string; weight?: number; title?: string; opacity?: number; dash?: string };
export type MapPoly = { id: number | string; rings: [number, number][][]; color: string; opacity?: number; title?: string };
export type Focus = { id: number | string; lines?: [number, number][][]; rings?: [number, number][][] } | null;

type Props = {
  lines?: MapLine[];
  polys?: MapPoly[];
  focus?: Focus;
  onPick?: (id: number | string) => void;
  height?: number | string;
  label: string;
  /** Extra layers drawn by the page. Return a cleanup. */
  extra?: (map: Leaflet.Map, L: LeafletNS) => (() => void) | void;
  children?: ReactNode;
};

export function NetworkMap({ lines, polys, focus, onPick, height = 560, label, extra, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!ctx || !polys?.length) return;
    const { map, L } = ctx;
    const g = L.layerGroup().addTo(map);
    for (const p of polys) {
      const layer = L.polygon(p.rings, { color: "#0f2a23", weight: 1, fillColor: p.color, fillOpacity: p.opacity ?? 0.6 });
      if (p.title) layer.bindTooltip(p.title, { sticky: true });
      layer.on("click", () => pick.current?.(p.id));
      g.addLayer(layer);
    }
    return () => {
      g.remove();
    };
  }, [ctx, polys]);

  useEffect(() => {
    if (!ctx || !lines?.length) return;
    const { map, L } = ctx;
    const renderer = L.canvas({ tolerance: 6 });
    const g = L.layerGroup().addTo(map);
    for (const l of lines) {
      const layer = L.polyline(l.lines, { color: l.color, weight: l.weight ?? 3, opacity: l.opacity ?? 0.9, dashArray: l.dash, lineCap: l.dash ? "butt" : "round", renderer, interactive: !!pick.current });
      if (l.title) layer.bindTooltip(l.title, { sticky: true });
      layer.on("click", () => pick.current?.(l.id));
      g.addLayer(layer);
    }
    return () => {
      g.remove();
    };
  }, [ctx, lines]);

  useEffect(() => {
    if (!ctx || !focus) return;
    const { map, L } = ctx;
    const g = L.layerGroup().addTo(map);
    let bounds: Leaflet.LatLngBounds | null = null;
    if (focus.lines?.length) {
      const halo = L.polyline(focus.lines, { color: "#0f2a23", weight: 10, opacity: 0.85, interactive: false });
      const core = L.polyline(focus.lines, { color: "#8ee6a8", weight: 4, opacity: 1, interactive: false });
      g.addLayer(halo).addLayer(core);
      bounds = halo.getBounds();
    } else if (focus.rings?.length) {
      const poly = L.polygon(focus.rings, { color: "#0f2a23", weight: 4, fill: false, interactive: false });
      g.addLayer(poly);
      bounds = poly.getBounds();
    }
    if (bounds?.isValid()) map.flyToBounds(bounds, { maxZoom: 17, padding: [40, 40], duration: 0.6 });
    return () => {
      g.remove();
    };
  }, [ctx, focus]);

  useEffect(() => {
    if (!ctx || !extra) return;
    const off = extra(ctx.map, ctx.L);
    return () => {
      off?.();
    };
  }, [ctx, extra]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} className="pl-map" style={{ height }} role="region" aria-label={label} />
      {children}
    </div>
  );
}
