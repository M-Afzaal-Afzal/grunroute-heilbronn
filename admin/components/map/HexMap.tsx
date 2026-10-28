"use client";
// One H3 layer on a Leaflet map, plus optional outline overlays. Two of these
// can be kept in step with `onReady` (compare mode).
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import { cellToBoundary } from "h3-js";
import { useLeaflet, type LeafletNS } from "./useLeaflet";

export type HexCell = { id: string; color: string; title: string };
export type Overlay = (map: Leaflet.Map, L: LeafletNS) => Leaflet.Layer;

type Props = {
  cells: HexCell[];
  overlays: Overlay[];
  selected: string;
  onPick: (id: string) => void;
  onReady?: (map: Leaflet.Map | null) => void;
  label: string;
  height?: number | string;
};

export function HexMap({ cells, overlays, selected, onPick, onReady, label, height = 600 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref, { zoom: 12.5 });
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!ctx) return;
    onReady?.(ctx.map);
    return () => onReady?.(null);
  }, [ctx, onReady]);

  useEffect(() => {
    if (!ctx) return;
    const { map, L } = ctx;
    const renderer = L.canvas({ padding: 0.3 });
    const g = L.layerGroup().addTo(map);
    for (const c of cells) {
      const poly = L.polygon(cellToBoundary(c.id), { renderer, color: "#0f2a23", weight: 0.5, opacity: 0.5, fillColor: c.color, fillOpacity: 0.72 });
      poly.bindTooltip(c.title, { sticky: true });
      poly.on("click", () => pick.current(c.id));
      g.addLayer(poly);
    }
    return () => {
      g.remove();
    };
  }, [ctx, cells]);

  useEffect(() => {
    if (!ctx) return;
    const layers = overlays.map((o) => o(ctx.map, ctx.L).addTo(ctx.map));
    return () => layers.forEach((l) => l.remove());
  }, [ctx, overlays]);

  useEffect(() => {
    if (!ctx || !selected) return;
    let ring: [number, number][];
    try {
      ring = cellToBoundary(selected);
    } catch {
      return;
    }
    const outline = ctx.L.polygon(ring, { color: "#8ee6a8", weight: 4, fill: false, interactive: false }).addTo(ctx.map);
    return () => {
      outline.remove();
    };
  }, [ctx, selected]);

  return <div ref={ref} className="pl-map" style={{ height }} role="region" aria-label={label} />;
}

/** Keeps two maps on the same centre and zoom. Returns a cleanup. */
export function syncMaps(a: Leaflet.Map, b: Leaflet.Map) {
  let busy = false;
  const follow = (from: Leaflet.Map, to: Leaflet.Map) => () => {
    if (busy) return;
    busy = true;
    to.setView(from.getCenter(), from.getZoom(), { animate: false });
    busy = false;
  };
  const ab = follow(a, b), ba = follow(b, a);
  a.on("move", ab);
  b.on("move", ba);
  b.setView(a.getCenter(), a.getZoom(), { animate: false });
  return () => {
    a.off("move", ab);
    b.off("move", ba);
  };
}
