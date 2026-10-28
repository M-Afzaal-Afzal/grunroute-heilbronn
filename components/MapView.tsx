"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTER } from "../lib/data";
import { HEAT, TREES, TREE_ROWS, WATER, type DangerPoint, type LatLng } from "../lib/geo";
import type { Selection } from "../lib/insights";
import type { RouteOption } from "../lib/routing";
import type { CityTrees } from "../lib/cityTrees";
import type { NavPos } from "../lib/useNavigation";
import { cumulative, splitAt } from "../lib/nav";
import { ICON_COLOR, ICON_GLYPH, type IconKind, type RouteIcon } from "../lib/routeIcons";
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from "../lib/tiles";
import { useLang } from "./LangProvider";

const EN = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  useAs: "Use this point as",
  startAB: "Start (A)",
  endAB: "End (B)",
  aboutTree: (name: string) => `About this tree: ${name}`,
  start: (name: string) => `Start: ${name}`,
  end: (name: string) => `End: ${name}`,
  sensorNote: "Public openSenseMap box. Not used for routes.",
  map: "Map of Heilbronn with routes, trees, heat walk spots and close passes",
};
const DE: typeof EN = {
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  useAs: "Diesen Punkt nutzen als",
  startAB: "Start (A)",
  endAB: "Ziel (B)",
  aboutTree: (name: string) => `Über diesen Baum: ${name}`,
  start: (name: string) => `Start: ${name}`,
  end: (name: string) => `Ziel: ${name}`,
  sensorNote: "Öffentliche openSenseMap-Box. Nicht für Routen genutzt.",
  map: "Karte von Heilbronn mit Routen, Bäumen, Hitze-Spots und engen Überholungen",
};
const T = { en: EN, de: DE };

export type Layers = { trees: boolean; heat: boolean; danger: boolean };
export type MapPlace = { name: string; lat: number; lng: number };
/** Live directions: the route being followed, the phone's spot, whether the map follows it, and metres already covered. */
export type NavView = { route: LatLng[]; pos: NavPos | null; follow: boolean; covered: number };

type Props = {
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
  nav: NavView | null;
  /** Fires once, when the first base map tiles have loaded. */
  onMapReady: () => void;
  onSelect: (sel: Selection) => void;
  onRouteSelect: (id: string) => void;
  onPick: (which: "start" | "end", lat: number, lng: number) => void;
  /** After "Choose on the map", the next tap sets this point straight away. */
  pickFor?: "start" | "end" | null;
  /** The user dragged the map during directions, so stop following. */
  onUserPan: () => void;
  /** Icons along the chosen route, from our own data. Shown at close zoom only. */
  icons: RouteIcon[];
};

const INK = "#0F2A23";
const GRUEN = "#12A150";
const TREE = "#2E8B57";
const COOL = "#2563A6";
const HEAT_C = "#C2410C";

function placeIcon(letter: string) {
  return L.divIcon({
    className: "gr-pin-wrap",
    html: `<div class="gr-place-pin">${letter}</div>`,
    // 44 px tap area around the 30 px pin.
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const ringIcon = L.divIcon({ className: "gr-pin-wrap", html: '<div class="gr-ring"></div>', iconSize: [34, 34], iconAnchor: [17, 17] });
// The phone's dot, with an arrow on its edge that turns to the heading (hidden until we have one).
const meIcon = L.divIcon({
  className: "gr-pin-wrap",
  html: '<div class="gr-me-wrap" data-heading="none" aria-hidden="true"><div class="gr-me-dir"></div><div class="gr-me"></div></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});
/** The covered part of the route, greyed out like in other map apps. */
const DONE = "#8A9893";

// How much of the map is covered at the top and bottom by the cards that float
// over it (elements marked data-map-cover="top" or "bottom"), capped so a fit still works.
function covered(map: L.Map) {
  const box = map.getContainer().getBoundingClientRect();
  let top = 0;
  let bottom = 0;
  document.querySelectorAll<HTMLElement>("[data-map-cover]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.height || r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom) return;
    if (el.dataset.mapCover === "top") top = Math.max(top, r.bottom - box.top);
    else bottom = Math.max(bottom, box.bottom - r.top);
  });
  const cap = box.height * 0.42;
  return { top: Math.min(top, cap), bottom: Math.min(bottom, cap) };
}

// Leave room for the cards over the map, the layer chips, and the round buttons on the right.
function fitOpts(map: L.Map): L.FitBoundsOptions {
  const c = covered(map);
  return { paddingTopLeft: [24, c.top + 64], paddingBottomRight: [72, c.bottom + 24] };
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
// cover it: left of the card on desktop, between the top card and the info card on phones.
function targetPoint(map: L.Map) {
  const size = map.getSize();
  const wide = window.innerWidth >= 1024 && size.x >= 700;
  if (wide) return L.point((size.x - 400) / 2, size.y / 2);
  const top = covered(map).top;
  return L.point(size.x / 2, top + Math.max(40, (size.y * 0.46 - top) / 2));
}

const poiIcons = Object.fromEntries(
  (Object.keys(ICON_GLYPH) as IconKind[]).map((k) => [
    k,
    L.divIcon({
      className: "gr-pin-wrap",
      html: `<span class="gr-poi" style="--c:${ICON_COLOR[k]};color:${ICON_COLOR[k]}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${ICON_GLYPH[k]}</svg></span>`,
      // 44 px tap area around the 32 px badge.
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    }),
  ])
) as Record<IconKind, L.DivIcon>;

/** Zoom from which the route icons and the direction chevrons show. */
const ICON_ZOOM = 15;
const CHEVRON_ZOOM = 14;

function chevronIcon(deg: number) {
  return L.divIcon({
    className: "gr-chev",
    html: `<svg viewBox="0 0 12 12" width="12" height="12" style="transform:rotate(${deg.toFixed(0)}deg)" aria-hidden="true"><path d="M3.5 2 8.5 6l-5 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// White chevrons about every 70 screen pixels along the line, pointing the way to go.
// None on the first `skip` points (the part already covered), so the rest do not shift as you move.
function drawChevrons(map: L.Map, g: L.LayerGroup, line: LatLng[], skip: LatLng[] = []) {
  g.clearLayers();
  if (line.length < 2 || map.getZoom() < CHEVRON_ZOOM) return;
  const pts = line.map((p) => map.latLngToLayerPoint(p));
  const gap = 70;
  let skipPx = 0;
  for (let i = 1; i < skip.length; i++) skipPx += map.latLngToLayerPoint(skip[i - 1]).distanceTo(map.latLngToLayerPoint(skip[i]));
  let next = gap / 2;
  while (next < skipPx + 10) next += gap;
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    if (!len) continue;
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    while (next <= run + len) {
      const t = (next - run) / len;
      const at = map.layerPointToLatLng(L.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      L.marker(at, { icon: chevronIcon(deg), interactive: false, keyboard: false }).addTo(g);
      next += gap;
    }
    run += len;
  }
}

export default function MapView(props: Props) {
  const { resetKey, layers, danger, cityTrees, start, end, routes, selectedRouteId, selectionAt, nav } = props;
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<L.Canvas | null>(null);
  const groups = useRef<Record<string, L.LayerGroup>>({});
  const treeTiles = useRef<L.GridLayer | null>(null);
  const cb = useRef(props);
  const t = T[useLang()];
  // Text for the Leaflet parts, which are built outside React.
  const txt = useRef(t);
  useEffect(() => {
    cb.current = props;
    txt.current = t;
  });

  // Routes and the followed line always sit above the other layers on the shared canvas.
  function bringMainToFront() {
    const map = mapRef.current;
    if (!map) return;
    for (const k of ["route", "nav"]) {
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
    const map = L.map(divRef.current, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, renderer }).setView(CENTER, 13);
    L.control.zoom({ position: "bottomright", zoomInTitle: txt.current.zoomIn, zoomOutTitle: txt.current.zoomOut }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION })
      .once("load", () => cb.current.onMapReady())
      .addTo(map);
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    map.on("dragstart", () => {
      if (cb.current.nav) cb.current.onUserPan();
    });
    for (const k of ["heat", "trees", "danger", "water", "route", "nav", "mark", "chev", "poi"]) groups.current[k] = L.layerGroup();
    // City tree register tiles sit under the vector canvas, above the base map.
    map.createPane("treePane").style.zIndex = "350";
    groups.current.mark.addTo(map);
    mapRef.current = map;

    // Tap the map to set a start or end point, or open the tree that was tapped.
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (cb.current.nav) return;
      if (cb.current.pickFor) {
        cb.current.onPick(cb.current.pickFor, e.latlng.lat, e.latlng.lng);
        return;
      }
      const ct = cb.current.cityTrees;
      let hit: number | null = null;
      if (ct && cb.current.layers.trees && map.getZoom() >= 14) {
        const mpp = (40075016.686 * Math.cos((e.latlng.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
        hit = ct.hit(e.latlng.lat, e.latlng.lng, 9 * mpp);
      }
      const box = document.createElement("div");
      box.className = "gr-pick";
      const title = document.createElement("p");
      title.textContent = txt.current.useAs;
      box.appendChild(title);
      const row = document.createElement("div");
      const add = (label: string, fn: () => void) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click", () => {
          fn();
          map.closePopup();
        });
        row.appendChild(b);
      };
      add(txt.current.startAB, () => cb.current.onPick("start", e.latlng.lat, e.latlng.lng));
      add(txt.current.endAB, () => cb.current.onPick("end", e.latlng.lat, e.latlng.lng));
      box.appendChild(row);
      if (hit !== null) {
        const id = hit;
        const more = document.createElement("div");
        more.className = "gr-pick-more";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "is-link";
        b.textContent = txt.current.aboutTree(ct!.get(id).name);
        b.addEventListener("click", () => {
          cb.current.onSelect({ kind: "ctree", id });
          map.closePopup();
        });
        more.appendChild(b);
        box.appendChild(more);
      }
      L.popup({ closeButton: true, autoPan: true, className: "gr-pick-popup" }).setLatLng(e.latlng).setContent(box).openOn(map);
    });

    // The map box changes size with the layout (sheet, directions), not only with the window.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Static green layers, drawn once on the canvas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !canvasRef.current) return;
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
    const g = groups.current.danger;
    if (!canvasRef.current || !g) return;
    g.clearLayers();
    (danger || []).forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 3.5, stroke: false, fillColor: p.risk >= 0.8 ? "#C8322B" : "#B86E00", fillOpacity: 0.7 })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ kind: "danger", point: p });
        })
        .addTo(g);
    });
    bringMainToFront();
  }, [danger]);

  // Route options and A / B pins, hidden while directions run.
  const navOn = !!nav;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const route = groups.current.route;
    route.clearLayers();
    if (navOn) {
      if (map.hasLayer(route)) map.removeLayer(route);
      return;
    }
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
    L.marker([start.lat, start.lng], { icon: placeIcon("A"), title: txt.current.start(start.name) }).addTo(route);
    L.marker([end.lat, end.lng], { icon: placeIcon("B"), title: txt.current.end(end.name) }).addTo(route);
    if (!map.hasLayer(route)) route.addTo(map);
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [routes, selectedRouteId, start, end, navOn]);

  // Fit the trip when the trip or its routes change, not on every selection.
  const routeKey = routes.map((r) => r.id + r.distance).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navOn) return;
    const pts: LatLng[] = [[start.lat, start.lng], [end.lat, end.lng], ...routes.flatMap((r) => r.coords)];
    map.flyToBounds(L.latLngBounds(pts).pad(routes.length ? 0.05 : 0.5), { ...fitOpts(map), duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, start.lat, start.lng, end.lat, end.lng, navOn]);

  // Live directions: the followed line, the end pin, and the phone's dot with its accuracy circle.
  const navLine = nav?.route;
  const covered = nav?.covered ?? 0;
  const doneRef = useRef<L.Polyline | null>(null);
  const navDone = useMemo(() => (navLine ? splitAt(navLine, cumulative(navLine), covered).done : []), [navLine, covered]);
  useEffect(() => {
    const map = mapRef.current;
    const g = groups.current.nav;
    if (!map || !g) return;
    g.clearLayers();
    if (!navLine) {
      if (map.hasLayer(g)) map.removeLayer(g);
      return;
    }
    L.polyline(navLine, { color: "#ffffff", weight: 13, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(g);
    L.polyline(navLine, { color: GRUEN, weight: 8, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(g);
    doneRef.current = L.polyline([], { color: DONE, weight: 8, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(g);
    L.marker(navLine[navLine.length - 1], { icon: placeIcon("B"), title: txt.current.end(cb.current.end.name), keyboard: false }).addTo(g);
    if (!map.hasLayer(g)) g.addTo(map);
    // Show the whole line first; the map moves to the dot once a reading comes in.
    if (!cb.current.nav?.pos) map.flyToBounds(L.latLngBounds(navLine), { ...fitOpts(map), duration: 0.6 });
    bringMainToFront();
  }, [navLine]);

  // Grey out the part already covered, on top of the green line.
  useEffect(() => {
    doneRef.current?.setLatLngs(navDone);
  }, [navDone]);

  const meRef = useRef<{ dot: L.Marker; acc: L.Circle } | null>(null);
  const pos = nav?.pos ?? null;
  const follow = !!nav?.follow;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pos) {
      if (meRef.current) {
        meRef.current.dot.remove();
        meRef.current.acc.remove();
        meRef.current = null;
      }
      return;
    }
    const at: LatLng = [pos.lat, pos.lng];
    if (!meRef.current) {
      meRef.current = {
        acc: L.circle(at, { radius: pos.acc, stroke: false, fillColor: COOL, fillOpacity: 0.14, interactive: false }).addTo(map),
        dot: L.marker(at, { icon: meIcon, interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(map),
      };
    } else {
      meRef.current.dot.setLatLng(at);
      meRef.current.acc.setLatLng(at).setRadius(pos.acc);
    }
    const wrap = meRef.current.dot.getElement()?.querySelector<HTMLElement>(".gr-me-wrap");
    if (wrap) {
      wrap.dataset.heading = pos.heading == null ? "none" : "on";
      if (pos.heading != null) wrap.style.setProperty("--heading", `${Math.round(pos.heading)}deg`);
    }
    if (follow) map.setView(at, Math.max(map.getZoom(), 17), { animate: true });
  }, [pos, follow]);

  // Direction chevrons on the chosen route, or on the followed line during directions.
  const selCoords = routes.find((r) => r.id === selectedRouteId)?.coords;
  const chevLine = navLine ?? selCoords;
  const chevSkip = navLine ? navDone : undefined;
  useEffect(() => {
    const map = mapRef.current;
    const g = groups.current.chev;
    if (!map || !g) return;
    if (!chevLine) {
      g.clearLayers();
      return;
    }
    const draw = () => drawChevrons(map, g, chevLine, chevSkip);
    draw();
    if (!map.hasLayer(g)) g.addTo(map);
    map.on("zoomend", draw);
    return () => {
      map.off("zoomend", draw);
    };
  }, [chevLine, chevSkip]);

  // Icons along the chosen route, at close zoom only.
  const { icons } = props;
  useEffect(() => {
    const map = mapRef.current;
    const g = groups.current.poi;
    if (!map || !g) return;
    g.clearLayers();
    icons.forEach((ic) => {
      const m = L.marker([ic.lat, ic.lng], { icon: poiIcons[ic.kind], title: ic.label, alt: ic.label, keyboard: false, zIndexOffset: 500 });
      if (ic.kind === "sensor") {
        const box = document.createElement("div");
        box.className = "gr-pick";
        const t = document.createElement("p");
        t.textContent = ic.label;
        const n = document.createElement("span");
        n.className = "gr-pick-note";
        n.textContent = txt.current.sensorNote;
        box.append(t, n);
        m.bindPopup(box, { className: "gr-pick-popup" });
      } else {
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          const c = cb.current;
          if (ic.kind === "shade") c.onSelect({ kind: "ctree", id: ic.ref });
          else if (ic.kind === "heat") c.onSelect({ kind: "heat", index: ic.ref });
          else if (ic.kind === "water") c.onSelect({ kind: "water", id: ic.ref });
          else {
            const point = c.danger?.find((p) => p.id === ic.ref);
            if (point) c.onSelect({ kind: "danger", point });
          }
        });
      }
      m.addTo(g);
    });
    const show = () => {
      const on = map.getZoom() >= ICON_ZOOM;
      if (on && !map.hasLayer(g)) g.addTo(map);
      if (!on && map.hasLayer(g)) map.removeLayer(g);
    };
    show();
    map.on("zoomend", show);
    return () => {
      map.off("zoomend", show);
    };
  }, [icons]);

  // Ring around the selected tree, heat spot, or close pass point.
  useEffect(() => {
    const map = mapRef.current;
    const mark = groups.current.mark;
    if (!map || !mark) return;
    mark.clearLayers();
    if (selectionAt && props.selection) {
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
    const { start: s, end: e, routes: rs, nav: nv } = cb.current;
    // During directions, "Whole route" shows the followed line.
    if (nv?.route.length) {
      map.flyToBounds(L.latLngBounds(nv.route), { ...fitOpts(map), duration: 0.6 });
      return;
    }
    map.flyToBounds(L.latLngBounds([[s.lat, s.lng], [e.lat, e.lng], ...rs.flatMap((r) => r.coords)]).pad(0.05), { ...fitOpts(map), duration: 0.6 });
  }, [resetKey]);

  return <div ref={divRef} className="map" aria-label={t.map} role="region" tabIndex={0} />;
}
