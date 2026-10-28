"use client";
// Small map for one "Hot or not?" round: the two heat walk spots as A and B,
// coloured warm and cool after the answer.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "../lib/tiles";
import type { Round } from "../lib/play";

type Props = { round: Round; revealed: boolean; warmer: 0 | 1 };

function pin(letter: string, tone: "plain" | "warm" | "cool") {
  return L.divIcon({ className: "gr-pin-wrap", html: `<div class="spot-pin is-${tone}">${letter}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
}

export default function SpotMap({ round, revealed, warmer }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    round.forEach((s, i) => {
      const tone = !revealed ? "plain" : i === warmer ? "warm" : "cool";
      L.circle([s.lat, s.lng], { radius: 40, color: tone === "warm" ? "#C2410C" : tone === "cool" ? "#2563A6" : "#0F2A23", weight: 1.5, fillOpacity: 0.08, interactive: false }).addTo(g);
      L.marker([s.lat, s.lng], { icon: pin(i === 0 ? "A" : "B", tone), keyboard: false, interactive: false }).addTo(g);
    });
    m.fitBounds(L.latLngBounds(round.map((s) => [s.lat, s.lng] as [number, number])), { padding: [48, 48], maxZoom: 17 });
  }, [round, revealed, warmer]);

  return <div ref={box} className="spot-map" role="img" aria-label="Map with spot A and spot B" />;
}
