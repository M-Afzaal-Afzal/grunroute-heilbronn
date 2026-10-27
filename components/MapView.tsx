"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTER, PLACES, STREETS, type PlaceKey } from "../lib/data";

export type Layers = { heat: boolean; dust: boolean; close: boolean };

type Props = {
  view: "city" | "people";
  activeRank: number;
  layers: Layers;
  start: PlaceKey;
  end: PlaceKey;
  resetKey: number;
  onStreetSelect: (rank: number) => void;
};

function pinIcon(letter: string) {
  return L.divIcon({
    className: "gr-pin-wrap",
    html: `<div class="gr-pin-label">${letter}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function MapView({ view, activeRank, layers, start, end, resetKey, onStreetSelect }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const cityRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.LayerGroup | null>(null);
  const dustRef = useRef<L.LayerGroup | null>(null);
  const closeRef = useRef<L.LayerGroup | null>(null);
  const propsRef = useRef({ view, activeRank, layers, start, end, onStreetSelect });
  propsRef.current = { view, activeRank, layers, start, end, onStreetSelect };

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false }).setView(CENTER, 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "Map data: OpenStreetMap contributors",
    }).addTo(map);
    const city = L.layerGroup().addTo(map);
    const route = L.layerGroup();
    const heat = L.layerGroup().addTo(map);
    const dust = L.layerGroup().addTo(map);
    const close = L.layerGroup().addTo(map);
    mapRef.current = map;
    cityRef.current = city;
    routeRef.current = route;
    heatRef.current = heat;
    dustRef.current = dust;
    closeRef.current = close;

    STREETS.forEach((s) => {
      const line = L.polyline(s.coords, { color: s.color, weight: 7, opacity: 0.9 });
      line.on("click", () => propsRef.current.onStreetSelect(s.rank));
      line.addTo(city);
      L.circleMarker(s.coords[1], { radius: 7, color: "#ffffff", weight: 2, fillColor: s.color, fillOpacity: 1 })
        .bindPopup(`<b>#${s.rank} ${s.name}</b><br>Score ${s.score} / 100`)
        .addTo(city);
      const mid = s.coords[1];
      if (s.heat) {
        L.circleMarker([mid[0] + 0.0006, mid[1] - 0.0006], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#C2410C", fillOpacity: 1 })
          .bindPopup(`<b>Heat point</b><br>${s.name}`)
          .addTo(heat);
      }
      if (s.dust) {
        L.circleMarker([mid[0] - 0.0006, mid[1] + 0.0006], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#64748b", fillOpacity: 1 })
          .bindPopup(`<b>Dust point</b><br>${s.name}`)
          .addTo(dust);
      }
      if (s.close) {
        L.circleMarker([mid[0] + 0.0003, mid[1] + 0.001], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#991B1B", fillOpacity: 1 })
          .bindPopup(`<b>Close pass risk</b><br>${s.name}`)
          .addTo(close);
      }
    });
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const city = cityRef.current;
    const route = routeRef.current;
    const heat = heatRef.current;
    const dust = dustRef.current;
    const close = closeRef.current;
    if (!city || !route || !heat || !dust || !close) return;

    if (view === "city") {
      if (map.hasLayer(route)) map.removeLayer(route);
      if (!map.hasLayer(city)) city.addTo(map);
      if (layers.heat && !map.hasLayer(heat)) heat.addTo(map);
      if (!layers.heat && map.hasLayer(heat)) map.removeLayer(heat);
      if (layers.dust && !map.hasLayer(dust)) dust.addTo(map);
      if (!layers.dust && map.hasLayer(dust)) map.removeLayer(dust);
      if (layers.close && !map.hasLayer(close)) close.addTo(map);
      if (!layers.close && map.hasLayer(close)) map.removeLayer(close);
      const active = STREETS.find((s) => s.rank === activeRank);
      if (active) map.flyTo(active.coords[1], 15, { duration: 0.6 });
    } else {
      if (map.hasLayer(city)) map.removeLayer(city);
      if (map.hasLayer(heat)) map.removeLayer(heat);
      if (map.hasLayer(dust)) map.removeLayer(dust);
      if (map.hasLayer(close)) map.removeLayer(close);
      route.clearLayers();
      const s = PLACES[start];
      const e = PLACES[end];
      const A: [number, number] = [s.lat, s.lng];
      const B: [number, number] = [e.lat, e.lng];
      const mid = (t: number): [number, number] => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const px = -dy;
      const py = dx;
      const fast: [number, number][] = [A, [mid(0.33)[0] + px * 0.08, mid(0.33)[1] + py * 0.08], [mid(0.66)[0] + px * 0.05, mid(0.66)[1] + py * 0.05], B];
      const green: [number, number][] = [
        A,
        [mid(0.22)[0] + px * 0.55 + 0.0012, mid(0.22)[1] + py * 0.55],
        [mid(0.5)[0] + px * 0.5 + 0.001, mid(0.5)[1] + py * 0.5],
        [mid(0.78)[0] + px * 0.45, mid(0.78)[1] + py * 0.45 - 0.001],
        B,
      ];
      L.polyline(fast, { color: "#C2410C", weight: 6, opacity: 0.95, dashArray: "8 6" })
        .bindPopup("<b>Fastest route</b><br>Shortest, but hotter and busier")
        .addTo(route);
      L.polyline(green, { color: "#2E9E5B", weight: 7, opacity: 0.95 })
        .bindPopup("<b>GrünRoute</b><br>Via shaded and quieter streets")
        .addTo(route);
      L.marker(A, { icon: pinIcon("A") }).bindPopup(`<b>Start:</b> ${s.name}`).addTo(route);
      L.marker(B, { icon: pinIcon("B") }).bindPopup(`<b>End:</b> ${e.name}`).addTo(route);
      if (!map.hasLayer(route)) route.addTo(map);
      map.flyToBounds(L.latLngBounds([A, B]).pad(0.3), { duration: 0.6 });
    }
    setTimeout(() => map.invalidateSize(), 250);
  }, [view, activeRank, layers, start, end]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetKey === 0) return;
    if (view === "city") {
      map.flyTo(CENTER, 14, { duration: 0.6 });
    } else {
      const s = PLACES[start];
      const e = PLACES[end];
      map.flyToBounds(L.latLngBounds([[s.lat, s.lng], [e.lat, e.lng]]).pad(0.3), { duration: 0.6 });
    }
  }, [resetKey, view, start, end]);

  return <div ref={divRef} className="map" aria-label="Map of Heilbronn" role="application" />;
}
