"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BANDS, CENTER } from "../../lib/data";
import { HEAT, type DangerPoint } from "../../lib/geo";
import { fixScore, scoreBand, type Issue, type Priority, type Segment } from "../../lib/city";
import type { CityTrees } from "../../lib/cityTrees";

export type CityLayers = { issues: boolean; safety: boolean; density: boolean; surface: boolean; heat: boolean; trees: boolean; coverage: boolean };

type Props = {
  layers: CityLayers;
  overtaking: Segment[] | null;
  surface: Segment[] | null;
  danger: DangerPoint[] | null;
  cityTrees: CityTrees | null;
  issues: Issue[];
  focus: Issue | null;
  focusKey: number;
  onIssue: (id: string) => void;
};

export const PRIORITY_COLOR: Record<Priority, string> = { act: "#C8322B", check: "#0F2A23", plan: "#B86E00", watch: "#4E8C72" };
const BAND_COLOR = { high: BANDS[0].color, medium: BANDS[1].color, low: BANDS[2].color };

const KIND_SVG = {
  safety: '<path d="M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M5 17l4-8h6l4 8M9 9l3 8h2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  surface: '<path d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M3 9h18" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  heat: '<circle cx="12" cy="12" r="4" fill="#fff"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
};

function heatColor(a: number) {
  if (a >= 1.5) return "#C2410C";
  if (a >= 0.5) return "#EA8A3A";
  if (a <= -1.5) return "#2563A6";
  if (a <= -0.5) return "#6FA3D6";
  return "#B9C4BE";
}

function popupBox(title: string, lines: string[], action?: { label: string; fn: () => void }) {
  const box = document.createElement("div");
  box.className = "cp-pop";
  const b = document.createElement("b");
  b.textContent = title;
  box.appendChild(b);
  for (const t of lines) {
    const p = document.createElement("p");
    p.textContent = t;
    box.appendChild(p);
  }
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", action.fn);
    box.appendChild(btn);
  }
  return box;
}

// Density of close pass points, drawn per tile: soft dots summed, then coloured.
function densityLayer(map: L.Map, pts: DangerPoint[]) {
  const pal = document.createElement("canvas");
  pal.width = 256;
  pal.height = 1;
  const pctx = pal.getContext("2d")!;
  const grad = pctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "rgba(253,230,138,0)");
  grad.addColorStop(0.25, "#FDE68A");
  grad.addColorStop(0.5, "#F59E0B");
  grad.addColorStop(0.75, "#DC2626");
  grad.addColorStop(1, "#7F1D1D");
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, 256, 1);
  const palette = pctx.getImageData(0, 0, 256, 1).data;
  const brushes = new Map<number, HTMLCanvasElement>();
  const brush = (r: number) => {
    let b = brushes.get(r);
    if (b) return b;
    b = document.createElement("canvas");
    b.width = b.height = r * 2;
    const c = b.getContext("2d")!;
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, r * 2, r * 2);
    brushes.set(r, b);
    return b;
  };
  const layer = new L.GridLayer({ tileSize: 256, pane: "densityPane", updateWhenZooming: false });
  (layer as unknown as { createTile: (c: L.Coords) => HTMLElement }).createTile = (coords: L.Coords) => {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 256;
    const ctx = tile.getContext("2d");
    if (!ctx) return tile;
    const z = coords.z;
    const nwPx = coords.scaleBy(L.point(256, 256));
    const nw = map.unproject(nwPx, z);
    const mpp = (40075016.686 * Math.cos((nw.lat * Math.PI) / 180)) / 2 ** (z + 8);
    const r = Math.round(Math.max(6, Math.min(40, 40 / mpp)));
    const se = map.unproject(nwPx.add([256 + r, 256 + r]), z);
    const nw2 = map.unproject(nwPx.subtract([r, r]), z);
    const b = brush(r);
    const k = z >= 16 ? 0.35 : z >= 14 ? 0.18 : 0.1;
    for (const p of pts) {
      if (p.lat > nw2.lat || p.lat < se.lat || p.lng < nw2.lng || p.lng > se.lng) continue;
      const q = map.project([p.lat, p.lng], z).subtract(nwPx);
      ctx.globalAlpha = Math.min(1, k * (0.4 + p.risk));
      ctx.drawImage(b, q.x - r, q.y - r);
    }
    const img = ctx.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      const j = a * 4;
      d[i] = palette[j];
      d[i + 1] = palette[j + 1];
      d[i + 2] = palette[j + 2];
      d[i + 3] = Math.min(230, a * 1.6);
    }
    ctx.putImageData(img, 0, 0);
    return tile;
  };
  return layer;
}

function treeLayer(map: L.Map, ct: CityTrees) {
  const COLORS: Record<string, string> = { Laubbaum: "#2E8B57", Nadelbaum: "#1F5E3B", Obstbaum: "#7BA63A", Baumgruppe: "#3E9C8F" };
  const layer = new L.GridLayer({ pane: "treePane", tileSize: 256, minZoom: 12, updateWhenZooming: false });
  (layer as unknown as { createTile: (c: L.Coords) => HTMLElement }).createTile = (coords: L.Coords) => {
    const tile = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    tile.width = tile.height = 256 * dpr;
    const ctx = tile.getContext("2d");
    if (!ctx || coords.z < 12) return tile;
    ctx.scale(dpr, dpr);
    const z = coords.z;
    const nwPx = coords.scaleBy(L.point(256, 256));
    const nw = map.unproject(nwPx, z);
    const se = map.unproject(nwPx.add([256, 256]), z);
    const pad = 0.0003;
    const mpp = (40075016.686 * Math.cos((nw.lat * Math.PI) / 180)) / 2 ** (z + 8);
    const minR = z >= 16 ? 2.5 : z >= 14 ? 1.6 : 1;
    ctx.globalAlpha = z >= 15 ? 0.42 : 0.6;
    for (const i of ct.inBox(se.lat - pad, nw.lng - pad, nw.lat + pad, se.lng + pad)) {
      const p = map.project([ct.lat[i], ct.lng[i]], z).subtract(nwPx);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(minR, (ct.crown[i] || 2) / 2 / mpp), 0, Math.PI * 2);
      ctx.fillStyle = COLORS[ct.typeName(i)] || "#2E8B57";
      ctx.fill();
    }
    return tile;
  };
  return layer;
}

export default function CityMap(props: Props) {
  const { layers, overtaking, surface, danger, cityTrees, issues, focus, focusKey } = props;
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groups = useRef<Record<string, L.Layer>>({});
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  const segCut = useMemo(() => {
    if (!surface) return { p75: Infinity, p90: Infinity };
    const v = surface.map((s) => s.rough!).sort((a, b) => a - b);
    return { p75: v[Math.floor(v.length * 0.75)], p90: v[Math.floor(v.length * 0.9)] };
  }, [surface]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const renderer = L.canvas({ padding: 0.5, tolerance: 6 });
    const map = L.map(divRef.current, { zoomControl: false, zoomSnap: 0.5, renderer }).setView(CENTER, 13);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.createPane("treePane").style.zIndex = "340";
    map.createPane("densityPane").style.zIndex = "360";
    mapRef.current = map;
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(divRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      groups.current = {};
    };
  }, []);

  function setLayer(key: string, make: (() => L.Layer) | null, on: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const old = groups.current[key];
    if (old && map.hasLayer(old)) map.removeLayer(old);
    delete groups.current[key];
    if (!make) return;
    const layer = make();
    groups.current[key] = layer;
    if (on) layer.addTo(map);
  }

  function toggle(key: string, on: boolean) {
    const map = mapRef.current;
    const l = groups.current[key];
    if (!map || !l) return;
    if (on && !map.hasLayer(l)) l.addTo(map);
    if (!on && map.hasLayer(l)) map.removeLayer(l);
  }

  // Ride coverage and close pass segments.
  useEffect(() => {
    const map = mapRef.current;
    setLayer(
      "coverage",
      surface
        ? () => {
            const g = L.layerGroup();
            for (const s of surface) for (const l of s.lines) L.polyline(l, { color: "#5B7A6E", weight: 2, opacity: 0.45, interactive: false }).addTo(g);
            return g;
          }
        : null,
      cb.current.layers.coverage
    );
    setLayer(
      "safety",
      overtaking && map
        ? () => {
            const g = L.layerGroup();
            for (const s of overtaking) {
              const score = fixScore(s.avgCm!);
              for (const l of s.lines)
                L.polyline(l, { color: BAND_COLOR[scoreBand(score)], weight: 5, opacity: 0.9, lineCap: "round" })
                  .on("click", (e) => {
                    L.popup()
                      .setLatLng(e.latlng)
                      .setContent(popupBox(s.name || "Unnamed path", [`Fix score ${score}, average passing gap ${Math.round(s.avgCm!)} cm`, `${s.points} overtaking ${s.points === 1 ? "point" : "points"}, ${s.boxes} ${s.boxes === 1 ? "sensor" : "sensors"}`, `Bike lane in OpenStreetMap: ${s.cycleway ? s.cycleway.replace(/_/g, " ") : "none mapped"}`], s.name ? { label: "Open issue", fn: () => cb.current.onIssue(`safety:${s.name}`) } : undefined))
                      .openOn(map);
                  })
                  .addTo(g);
            }
            return g;
          }
        : null,
      cb.current.layers.safety
    );
  }, [overtaking, surface]);

  useEffect(() => {
    const map = mapRef.current;
    setLayer(
      "surface",
      surface && map
        ? () => {
            const g = L.layerGroup();
            for (const s of surface) {
              if (s.rough! < segCut.p75) continue;
              const top = s.rough! >= segCut.p90;
              for (const l of s.lines)
                L.polyline(l, { color: top ? "#6B2A0E" : "#C2410C", weight: top ? 5 : 3.5, opacity: 0.9, lineCap: "round" })
                  .on("click", (e) => {
                    L.popup()
                      .setLatLng(e.latlng)
                      .setContent(popupBox(s.name || "Unnamed path", [`Roughness ${s.rough!.toFixed(1)}, ${top ? "roughest 10%" : "roughest 25%"} of measured segments`, `${Math.round(s.len)} m, ${s.boxes} ${s.boxes === 1 ? "sensor" : "sensors"}`], s.name ? { label: "Open issue", fn: () => cb.current.onIssue(`surface:${s.name}`) } : undefined))
                      .openOn(map);
                  })
                  .addTo(g);
            }
            return g;
          }
        : null,
      cb.current.layers.surface
    );
  }, [surface, segCut]);

  useEffect(() => {
    const map = mapRef.current;
    setLayer("density", danger && map ? () => densityLayer(map, danger) : null, cb.current.layers.density);
  }, [danger]);

  useEffect(() => {
    const map = mapRef.current;
    setLayer("trees", cityTrees && map ? () => treeLayer(map, cityTrees) : null, cb.current.layers.trees);
  }, [cityTrees]);

  useEffect(() => {
    const map = mapRef.current;
    setLayer(
      "heat",
      map
        ? () => {
            const g = L.layerGroup();
            HEAT.forEach((c) => {
              L.circle([c[0], c[1]], { radius: 24, stroke: false, fillColor: heatColor(c[2]), fillOpacity: Math.abs(c[2]) < 0.5 ? 0.35 : 0.7 })
                .on("click", (e) => {
                  L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupBox(`${c[2] > 0 ? "+" : ""}${c[2].toFixed(1)} °C against its own walk`, [`${c[4]} readings, heat walks 1 to 3 Sep 2026`, "Not a raw temperature. One summer snapshot."]))
                    .openOn(map);
                })
                .addTo(g);
            });
            return g;
          }
        : null,
      cb.current.layers.heat
    );
  }, []);

  // Issue pins, coloured by priority.
  useEffect(() => {
    setLayer(
      "issues",
      () => {
        const g = L.layerGroup();
        const order = { watch: 0, plan: 1, check: 2, act: 3 };
        for (const is of [...issues].sort((a, b) => order[a.priority] - order[b.priority])) {
          L.marker(is.at, {
            icon: L.divIcon({
              className: "cp-pin-wrap",
              html: `<div class="cp-pin" style="--pin:${PRIORITY_COLOR[is.priority]}"><svg viewBox="0 0 24 24" width="16" height="16">${KIND_SVG[is.kind]}</svg></div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
            title: `${is.title}, ${is.metricText}`,
            keyboard: true,
            zIndexOffset: order[is.priority] * 100,
          })
            .on("click", () => cb.current.onIssue(is.id))
            .addTo(g);
        }
        return g;
      },
      cb.current.layers.issues
    );
  }, [issues]);

  useEffect(() => {
    toggle("coverage", layers.coverage);
    toggle("trees", layers.trees);
    toggle("heat", layers.heat);
    toggle("density", layers.density);
    toggle("surface", layers.surface);
    toggle("safety", layers.safety);
    toggle("issues", layers.issues);
    // Keep the drawing order fixed: issue pins and selection on top.
    const map = mapRef.current;
    for (const k of ["surface", "safety", "focus"]) {
      const l = groups.current[k] as L.LayerGroup | undefined;
      if (l && map?.hasLayer(l)) l.eachLayer((x) => (x as L.Path).bringToFront?.());
    }
  }, [layers]);

  // Selected issue: highlight and fly there.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setLayer(
      "focus",
      focus
        ? () => {
            const g = L.layerGroup();
            for (const l of focus.lines) {
              L.polyline(l, { color: "#0F2A23", weight: 12, opacity: 0.9, lineCap: "round", interactive: false }).addTo(g);
              L.polyline(l, { color: "#8EE6A8", weight: 5, opacity: 1, lineCap: "round", interactive: false }).addTo(g);
            }
            L.marker(focus.at, { icon: L.divIcon({ className: "cp-pin-wrap", html: '<div class="cp-ring"></div>', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false, keyboard: false }).addTo(g);
            return g;
          }
        : null,
      true
    );
    if (!focus) return;
    const pts = focus.lines.flat();
    if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 17, duration: 0.6, paddingBottomRight: window.innerWidth >= 1024 ? [420, 0] : [0, 0] });
    else map.flyTo(focus.at, 17, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return <div ref={divRef} className="cp-mapdiv" role="region" aria-label="Planning map of Heilbronn" tabIndex={0} />;
}
