"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTER, STREETS, bandFor } from "../lib/data";
import { HEAT, TREES, TREE_ROWS, WATER, type DangerPoint, type LatLng } from "../lib/geo";
import type { Selection } from "../lib/insights";
import type { RouteOption } from "../lib/routing";
import type { CityTrees } from "../lib/cityTrees";

export type Layers = { trees: boolean; heat: boolean; danger: boolean };
export type MapPlace = { name: string; lat: number; lng: number };

type Props = {
  view: "city" | "people";
  activeRank: number;
  focusRank: number | null;
  resetKey: number;
  layers: Layers;
  danger: DangerPoint[] | null;
  cityTrees: CityTrees | null;
  start: MapPlace;
  end: MapPlace;
  routes: RouteOption[];
  selectedRouteId: string | null;
  selection: Selection | null;
  selectionAt: LatLng | null;
  onStreetSelect: (rank: number) => void;
  onSelect: (sel: Selection) => void;
  onRouteSelect: (id: string) => void;
  onPick: (which: "start" | "end", lat: number, lng: number) => void;
};

const INK = "#0F2A23";
const GRUEN = "#12A150";
const TREE = "#2E8B57";
const COOL = "#2563A6";
const HEAT_C = "#C2410C";

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
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const ringIcon = L.divIcon({ className: "gr-pin-wrap", html: '<div class="gr-ring"></div>', iconSize: [34, 34], iconAnchor: [17, 17] });

// Leave room for the layer bar at the top and the legend at the bottom.
// The legend sits bottom left, so the bottom pad grows with the map height.
function fitOpts(map: L.Map): L.FitBoundsOptions {
  const h = map.getSize().y;
  return { paddingTopLeft: [32, 80], paddingBottomRight: [64, Math.round(Math.min(220, Math.max(90, h * 0.28)))] };
}

function allStreetBounds() {
  return L.latLngBounds(STREETS.flatMap((s) => s.coords));
}

function midpoint(coords: [number, number][]): [number, number] {
  return coords[Math.floor((coords.length - 1) / 2)];
}

function heatColor(a: number) {
  if (a >= 1.5) return HEAT_C;
  if (a >= 0.5) return "#EA8A3A";
  if (a <= -1.5) return COOL;
  if (a <= -0.5) return "#6FA3D6";
  return "#B9C4BE";
}

function routeStyle(r: RouteOption, selected: boolean): L.PolylineOptions {
  const green = r.label === "green" || r.label === "both";
  const color = green ? GRUEN : r.label === "fastest" ? INK : "#5B7A6E";
  return selected
    ? { color, weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }
    : { color, weight: 4, opacity: 0.55, lineCap: "round", lineJoin: "round", dashArray: green ? undefined : "2 9" };
}

// Where a selected point should land on screen, so the info card does not
// cover it: left of the card on desktop, top part of the map on phones.
function targetPoint(map: L.Map) {
  const size = map.getSize();
  const wide = window.innerWidth >= 1024 && size.x >= 700;
  return wide ? L.point((size.x - 400) / 2, size.y / 2) : L.point(size.x / 2, size.y * 0.24);
}
function centerFor(map: L.Map, at: L.LatLngExpression, zoom: number) {
  const size = map.getSize();
  const offset = targetPoint(map).subtract(size.divideBy(2));
  return map.unproject(map.project(at, zoom).subtract(offset), zoom);
}

export default function MapView(props: Props) {
  const { view, activeRank, focusRank, resetKey, layers, danger, cityTrees, start, end, routes, selectedRouteId, selectionAt } = props;
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<L.Canvas | null>(null);
  const groups = useRef<Record<string, L.LayerGroup>>({});
  const treeTiles = useRef<L.GridLayer | null>(null);
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  // Streets and routes always sit above the green layers on the shared canvas.
  function bringMainToFront() {
    const map = mapRef.current;
    if (!map) return;
    for (const k of ["city", "route"]) {
      const g = groups.current[k];
      if (g && map.hasLayer(g)) g.eachLayer((l) => (l as L.Path).bringToFront?.());
    }
  }

  // Create the map once.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    // One shared canvas for every vector layer, so taps reach the right shape.
    const renderer = L.canvas({ padding: 0.5, tolerance: 6 });
    canvasRef.current = renderer;
    const map = L.map(divRef.current, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, renderer }).setView(CENTER, 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    for (const k of ["heat", "trees", "danger", "water", "city", "route", "mark"]) groups.current[k] = L.layerGroup();
    // City tree register tiles sit under the vector canvas, above the base map.
    map.createPane("treePane").style.zIndex = "350";
    groups.current.mark.addTo(map);
    mapRef.current = map;

    // In the people view, tap the map to set a start or end point.
    map.on("click", (e: L.LeafletMouseEvent) => {
      const ct = cb.current.cityTrees;
      let hit: number | null = null;
      if (ct && cb.current.layers.trees && map.getZoom() >= 14) {
        const mpp = (40075016.686 * Math.cos((e.latlng.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
        hit = ct.hit(e.latlng.lat, e.latlng.lng, 9 * mpp);
      }
      // City view: a tap on a crown opens the tree.
      if (cb.current.view !== "people") {
        if (hit !== null) cb.current.onSelect({ kind: "ctree", id: hit });
        return;
      }
      // People view: always offer start and end, plus the tree if one was tapped.
      const box = document.createElement("div");
      box.className = "gr-pick";
      const title = document.createElement("p");
      title.textContent = "Use this point as";
      box.appendChild(title);
      const row = document.createElement("div");
      const add = (label: string, fn: () => void, quiet = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        if (quiet) b.className = "is-quiet";
        b.addEventListener("click", () => {
          fn();
          map.closePopup();
        });
        row.appendChild(b);
      };
      add("Start (A)", () => cb.current.onPick("start", e.latlng.lat, e.latlng.lng));
      add("End (B)", () => cb.current.onPick("end", e.latlng.lat, e.latlng.lng));
      box.appendChild(row);
      if (hit !== null) {
        const id = hit;
        const more = document.createElement("div");
        more.className = "gr-pick-more";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "is-link";
        b.textContent = `About this tree: ${ct!.get(id).name}`;
        b.addEventListener("click", () => {
          cb.current.onSelect({ kind: "ctree", id });
          map.closePopup();
        });
        more.appendChild(b);
        box.appendChild(more);
      }
      L.popup({ closeButton: true, autoPan: true, className: "gr-pick-popup" }).setLatLng(e.latlng).setContent(box).openOn(map);
    });

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Static green layers, drawn once on the canvas.
  useEffect(() => {
    const map = mapRef.current;
    const renderer = canvasRef.current;
    if (!map || !renderer) return;
    const g = groups.current;
    g.trees.clearLayers();
    TREE_ROWS.forEach((r) => {
      L.polyline(r.coords, { color: TREE, weight: 5, opacity: 0.8, lineCap: "round" })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "row", id: r.id });
        })
        .addTo(g.trees);
    });
    TREES.forEach((t) => {
      L.circleMarker([t.lat, t.lng], { radius: t.landmark ? 6 : 4, color: "#ffffff", weight: 1, fillColor: TREE, fillOpacity: 0.9 })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "tree", id: t.id });
        })
        .addTo(g.trees);
    });
    g.heat.clearLayers();
    HEAT.forEach((c, i) => {
      const plain = Math.abs(c[2]) < 0.5;
      L.circle([c[0], c[1]], { radius: plain ? 16 : 24, stroke: false, fillColor: heatColor(c[2]), fillOpacity: plain ? 0.35 : 0.65 })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "heat", index: i });
        })
        .addTo(g.heat);
    });
    g.water.clearLayers();
    WATER.forEach((w) => {
      L.circleMarker([w.lat, w.lng], { radius: 6, color: "#ffffff", weight: 2, fillColor: COOL, fillOpacity: 1 })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "water", id: w.id });
        })
        .addTo(g.water);
    });
  }, []);

  // Toggle layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const g = groups.current;
    const show = (layer: L.LayerGroup, on: boolean) => {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    };
    show(g.heat, layers.heat);
    show(g.trees, layers.trees && !cityTrees);
    if (treeTiles.current) {
      if (layers.trees && !map.hasLayer(treeTiles.current)) treeTiles.current.addTo(map);
      if (!layers.trees && map.hasLayer(treeTiles.current)) map.removeLayer(treeTiles.current);
    }
    show(g.water, layers.heat || layers.trees);
    show(g.danger, layers.danger);
    bringMainToFront();
  }, [layers, cityTrees]);

  // City tree register: canvas tiles, each crown drawn at its real width.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cityTrees) return;
    const ct = cityTrees;
    const COLORS: Record<string, string> = { Laubbaum: "#2E8B57", Nadelbaum: "#1F5E3B", Obstbaum: "#7BA63A", Baumgruppe: "#3E9C8F" };
    const layer = new L.GridLayer({ pane: "treePane", tileSize: 256, minZoom: 12, maxZoom: 19, updateWhenZooming: false });
    (layer as unknown as { createTile: (c: L.Coords) => HTMLElement }).createTile = (coords: L.Coords) => {
      const tile = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tile.width = 256 * dpr;
      tile.height = 256 * dpr;
      const ctx = tile.getContext("2d");
      if (!ctx || coords.z < 12) return tile;
      ctx.scale(dpr, dpr);
      const z = coords.z;
      const nwPx = coords.scaleBy(L.point(256, 256));
      const nw = map.unproject(nwPx, z);
      const se = map.unproject(nwPx.add([256, 256]), z);
      const pad = 0.0003;
      const ids = ct.inBox(se.lat - pad, nw.lng - pad, nw.lat + pad, se.lng + pad);
      const mpp = (40075016.686 * Math.cos((nw.lat * Math.PI) / 180)) / 2 ** (z + 8);
      const minR = z >= 16 ? 2.5 : z >= 14 ? 1.6 : 1;
      for (const i of ids) {
        const p = map.project([ct.lat[i], ct.lng[i]], z).subtract(nwPx);
        const r = Math.max(minR, (ct.crown[i] || 2) / 2 / mpp);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[ct.typeName(i)] || "#2E8B57";
        ctx.globalAlpha = z >= 15 ? 0.42 : 0.6;
        ctx.fill();
        if (r >= 5) {
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1;
          ctx.strokeStyle = "#1F5E3B";
          ctx.stroke();
        }
      }
      return tile;
    };
    treeTiles.current = layer;
    if (cb.current.layers.trees) layer.addTo(map);
    return () => {
      map.removeLayer(layer);
      treeTiles.current = null;
    };
  }, [cityTrees]);

  // Close pass points arrive later from the ATRAI API.
  useEffect(() => {
    const renderer = canvasRef.current;
    const g = groups.current.danger;
    if (!renderer || !g) return;
    g.clearLayers();
    (danger || []).forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 3.5,
        stroke: false,
        fillColor: p.risk >= 0.8 ? "#C8322B" : "#B86E00",
        fillOpacity: 0.7,
      })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "danger", point: p });
        })
        .addTo(g);
    });
    bringMainToFront();
  }, [danger]);

  // City view: ranked streets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const city = groups.current.city;
    if (view !== "city") {
      if (map.hasLayer(city)) map.removeLayer(city);
      return;
    }
    city.clearLayers();
    const ordered = [...STREETS].sort((a, b) => (a.rank === activeRank ? 1 : 0) - (b.rank === activeRank ? 1 : 0));
    ordered.forEach((s) => {
      const color = bandFor(s.score).color;
      const active = s.rank === activeRank;
      L.polyline(s.coords, { color: "#ffffff", weight: active ? 15 : 12, opacity: 1, lineCap: "round", interactive: false }).addTo(city);
      L.polyline(s.coords, { color, weight: active ? 9 : 7, opacity: 1, lineCap: "round" })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onStreetSelect(s.rank);
        })
        .addTo(city);
      L.marker(midpoint(s.coords), {
        icon: rankIcon(s.rank, color, active),
        keyboard: true,
        title: `${s.rank}. ${s.name}, fix score ${s.score}`,
        zIndexOffset: active ? 1000 : 0,
      })
        .on("click", () => cb.current.onStreetSelect(s.rank))
        .addTo(city);
    });
    if (!map.hasLayer(city)) city.addTo(map);
    const focus = STREETS.find((s) => s.rank === focusRank);
    if (focus) map.flyTo(centerFor(map, midpoint(focus.coords), 16), 16, { duration: 0.6 });
    else map.fitBounds(allStreetBounds(), fitOpts(map));
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [view, activeRank, focusRank]);

  // People view: routes and A / B pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const route = groups.current.route;
    if (view !== "people") {
      if (map.hasLayer(route)) map.removeLayer(route);
      return;
    }
    route.clearLayers();
    const sorted = [...routes].sort((a, b) => (a.id === selectedRouteId ? 1 : 0) - (b.id === selectedRouteId ? 1 : 0));
    sorted.forEach((r) => {
      const sel = r.id === selectedRouteId;
      if (sel) L.polyline(r.coords, { color: "#ffffff", weight: 12, opacity: 1, lineCap: "round", interactive: false }).addTo(route);
      // A wide invisible line makes thin routes easy to tap.
      L.polyline(r.coords, { color: "#000", weight: 22, opacity: 0, lineCap: "round" })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onRouteSelect(r.id);
        })
        .addTo(route);
      L.polyline(r.coords, { ...routeStyle(r, sel), interactive: false }).addTo(route);
    });
    L.marker([start.lat, start.lng], { icon: placeIcon("A"), title: `Start: ${start.name}` }).addTo(route);
    L.marker([end.lat, end.lng], { icon: placeIcon("B"), title: `End: ${end.name}` }).addTo(route);
    if (!map.hasLayer(route)) route.addTo(map);
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [view, routes, selectedRouteId, start, end]);

  // Fit the trip when the trip or its routes change, not on every selection.
  const routeKey = routes.map((r) => r.id + r.distance).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || view !== "people") return;
    const pts: LatLng[] = [[start.lat, start.lng], [end.lat, end.lng], ...routes.flatMap((r) => r.coords)];
    map.flyToBounds(L.latLngBounds(pts).pad(routes.length ? 0.05 : 0.5), { ...fitOpts(map), duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, routeKey, start.lat, start.lng, end.lat, end.lng]);

  // Ring around the selected tree, heat spot, or close pass point.
  useEffect(() => {
    const map = mapRef.current;
    const mark = groups.current.mark;
    if (!map || !mark) return;
    mark.clearLayers();
    if (selectionAt && props.selection && props.selection.kind !== "street") {
      L.marker(selectionAt, { icon: ringIcon, interactive: false, keyboard: false }).addTo(mark);
      const p = map.latLngToContainerPoint(selectionAt);
      const shift = p.subtract(targetPoint(map));
      if (Math.abs(shift.x) > 40 || Math.abs(shift.y) > 40) map.panBy(shift, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionAt?.[0], selectionAt?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetKey === 0) return;
    if (cb.current.view === "city") map.flyToBounds(allStreetBounds(), { ...fitOpts(map), duration: 0.6 });
    else {
      const { start: s, end: e, routes: rs } = cb.current;
      map.flyToBounds(L.latLngBounds([[s.lat, s.lng], [e.lat, e.lng], ...rs.flatMap((r) => r.coords)]).pad(0.05), { ...fitOpts(map), duration: 0.6 });
    }
  }, [resetKey]);

  return <div ref={divRef} className="map" aria-label="Map of Heilbronn with ranked streets, trees, heat walk spots and routes" role="region" tabIndex={0} />;
}
