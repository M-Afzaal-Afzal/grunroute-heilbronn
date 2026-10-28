"use client";
// Creates one Leaflet map in a div, with the shared tile layer. Leaflet is
// loaded in the browser only. Pages add their own layers once `map` is set.
import { useEffect, useState, type RefObject } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "@/lib/shared/tiles";
import { CENTER } from "@/lib/shared/data";

export type LeafletNS = typeof Leaflet;

export function useLeaflet(ref: RefObject<HTMLDivElement | null>, opts: { zoom?: number; center?: [number, number] } = {}) {
  const [state, setState] = useState<{ map: Leaflet.Map; L: LeafletNS } | null>(null);
  const zoom = opts.zoom ?? 13;
  const [lat, lng] = opts.center ?? CENTER;
  useEffect(() => {
    let map: Leaflet.Map | null = null;
    let cancelled = false;
    import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as LeafletNS;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { preferCanvas: true, zoomSnap: 0.5 }).setView([lat, lng], zoom);
      L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION, crossOrigin: "anonymous" }).addTo(map);
      setState({ map, L });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [ref, zoom, lat, lng]);
  return state;
}
