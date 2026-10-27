"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTER, PLACES, STREETS, bandFor, type PlaceKey } from "../lib/data";

type Props = {
  view: "city" | "people";
  activeRank: number;
  focusRank: number | null;
  start: PlaceKey;
  end: PlaceKey;
  resetKey: number;
  onStreetSelect: (rank: number) => void;
};

const INK = "#0F2A23";
const GRUEN = "#12A150";

function rankIcon(rank: number, color: string, active: boolean) {
  const size = active ? 34 : 28;
  return L.divIcon({
    className: "gr-pin-wrap",
    html: `<div class="gr-rank-pin${active ? " is-active" : ""}" style="--pin:${color}">${rank}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function placeIcon(letter: string) {
  return L.divIcon({
    className: "gr-pin-wrap",
    html: `<div class="gr-place-pin">${letter}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Leave room for the reset button at the top and the legend at the bottom.
const FIT: L.FitBoundsOptions = { paddingTopLeft: [32, 72], paddingBottomRight: [72, 120] };

function allStreetBounds() {
  return L.latLngBounds(STREETS.flatMap((s) => s.coords));
}

function midpoint(coords: [number, number][]): [number, number] {
  return coords[Math.floor((coords.length - 1) / 2)];
}

export default function MapView({ view, activeRank, focusRank, start, end, resetKey, onStreetSelect }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const cityRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onStreetSelect);
  useEffect(() => {
    selectRef.current = onStreetSelect;
  }, [onStreetSelect]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25 }).setView(CENTER, 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    cityRef.current = L.layerGroup().addTo(map);
    routeRef.current = L.layerGroup();
    mapRef.current = map;
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
    const city = cityRef.current;
    const route = routeRef.current;
    if (!map || !city || !route) return;

    if (view === "city") {
      if (map.hasLayer(route)) map.removeLayer(route);
      city.clearLayers();
      // Draw inactive streets first, so the active one sits on top.
      const ordered = [...STREETS].sort((a, b) => (a.rank === activeRank ? 1 : 0) - (b.rank === activeRank ? 1 : 0));
      ordered.forEach((s) => {
        const color = bandFor(s.score).color;
        const active = s.rank === activeRank;
        L.polyline(s.coords, { color: "#ffffff", weight: active ? 14 : 11, opacity: 1, lineCap: "round" }).addTo(city);
        const line = L.polyline(s.coords, { color, weight: active ? 8 : 6, opacity: 1, lineCap: "round" });
        line.on("click", () => selectRef.current(s.rank));
        line.addTo(city);
        const m = L.marker(midpoint(s.coords), {
          icon: rankIcon(s.rank, color, active),
          keyboard: true,
          title: `${s.rank}. ${s.name}, fix score ${s.score}`,
          zIndexOffset: active ? 1000 : 0,
        });
        m.on("click", () => selectRef.current(s.rank));
        m.addTo(city);
      });
      if (!map.hasLayer(city)) city.addTo(map);
      const focus = STREETS.find((s) => s.rank === focusRank);
      if (focus) map.flyTo(midpoint(focus.coords), 16, { duration: 0.6 });
      else map.fitBounds(allStreetBounds(), FIT);
    } else {
      if (map.hasLayer(city)) map.removeLayer(city);
      route.clearLayers();
      const s = PLACES[start];
      const e = PLACES[end];
      const A: [number, number] = [s.lat, s.lng];
      const B: [number, number] = [e.lat, e.lng];
      const mid = (t: number): [number, number] => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const px = -(B[1] - A[1]);
      const py = B[0] - A[0];
      // Demo geometry only, drawn to show how a route comparison will look.
      const fast: [number, number][] = [A, [mid(0.33)[0] - px * 0.06, mid(0.33)[1] - py * 0.06], [mid(0.66)[0] - px * 0.04, mid(0.66)[1] - py * 0.04], B];
      const green: [number, number][] = [
        A,
        [mid(0.2)[0] + px * 0.22, mid(0.2)[1] + py * 0.22],
        [mid(0.5)[0] + px * 0.26, mid(0.5)[1] + py * 0.26],
        [mid(0.8)[0] + px * 0.2, mid(0.8)[1] + py * 0.2],
        B,
      ];
      L.polyline(fast, { color: INK, weight: 5, opacity: 0.75, dashArray: "2 10", lineCap: "round" })
        .bindPopup("<b>Fastest route</b><br>Demo line")
        .addTo(route);
      L.polyline(green, { color: "#ffffff", weight: 12, opacity: 1, lineCap: "round" }).addTo(route);
      L.polyline(green, { color: GRUEN, weight: 7, opacity: 1, lineCap: "round" })
        .bindPopup("<b>GrünRoute</b><br>Demo line")
        .addTo(route);
      L.marker(A, { icon: placeIcon("A"), title: `Start: ${s.name}` }).addTo(route);
      L.marker(B, { icon: placeIcon("B"), title: `End: ${e.name}` }).addTo(route);
      if (!map.hasLayer(route)) route.addTo(map);
      map.flyToBounds(L.latLngBounds([...fast, ...green]), { ...FIT, duration: 0.6 });
    }
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [view, activeRank, focusRank, start, end]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetKey === 0) return;
    if (view === "city") {
      map.flyToBounds(allStreetBounds(), { ...FIT, duration: 0.6 });
    } else {
      const s = PLACES[start];
      const e = PLACES[end];
      map.flyToBounds(L.latLngBounds([[s.lat, s.lng], [e.lat, e.lng]]).pad(0.7), { duration: 0.6 });
    }
    // Only react to the reset button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return <div ref={divRef} className="map" aria-label="Map of Heilbronn with the ranked streets" role="region" tabIndex={0} />;
}
