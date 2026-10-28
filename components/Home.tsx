"use client";
// The people app home, map first: the map fills the screen, a small From and To
// card floats on top, and the routes sit in a bottom sheet (a side panel on wide
// screens). Compare a cooler route with the fastest and follow it with live directions.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppNav from "./AppNav";
import SiteFooter from "./SiteFooter";
import InfoCard from "./InfoCard";
import NavPanel from "./NavPanel";
import PlacePicker from "./PlacePicker";
import FairTour from "./FairTour";
import { useHref, useLang } from "./LangProvider";
import { campaignFor, placesFor } from "../lib/data";
import { HEAT, WATER, fmtAnomaly, type DangerPoint } from "../lib/geo";
import { HEAT_WALK, HEAT_WALK_DATES_DE } from "../lib/heat-walks";
import { LOCALE, fmtNum, type Lang } from "../lib/i18n";
import { insightFor, type Selection } from "../lib/insights";
import { MIN_SEGMENT_M, aggregateStreets, enoughData, percentiles, presetById, rankSegments } from "../lib/priority";
import { rule150, heroFact, loadSegments, type SegmentData } from "../lib/segments";
import { SOURCES } from "../lib/sources";
import { fetchHeilbronnBoxes, type LiveBox, type LiveReading } from "../lib/live";
import { loadCityTrees, type CityTrees } from "../lib/cityTrees";
import { loadDangerPoints } from "../lib/atrai";
import { fetchRouteOptions, rankRoutes, type Mode, type RawRoute, type RouteMetrics, type RouteOption } from "../lib/routing";
import { ROUTE_THEMES, mainGain, type ComfortTerm } from "../lib/comfort";
import { ICON_COLOR, ICON_GLYPH, ICON_NAME, ICON_NAMES, routeIcons, type IconKind } from "../lib/routeIcons";
import { useNavigation } from "../lib/useNavigation";
import type { Layers, MapPlace, NavView } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map map-loading" aria-hidden="true" />,
});

type LiveState = "loading" | "ok" | "stale" | "none" | "offline";
type LiveValue = { temp: string | null; pm10: string | null; pm25: string | null; same: boolean; box: string; time: string };
type LoadState = "idle" | "loading" | "ok" | "error";

// Page text in English and German. Keys are the same in both.
const T_EN = {
  notLoaded: "Not loaded",
  loading: "Loading",
  routeName: { green: "GrünRoute", fastest: "Fastest", both: "Fastest and greenest", other: "Another option" } as Record<RouteOption["label"], string>,
  tipHot: (a: string) => `The warmest heat walk spot on this route was ${a} compared with the same walk. Shade and water help on hot days.`,
  tipNoHeat: "Few heat walks went along this route, so heat is not compared here.",
  tipWater: (n: number) => `${n} drinking water ${n === 1 ? "point" : "points"} close to the route.`,
  tipDanger: (n: number) => `${n} close pass ${n === 1 ? "point was" : "points were"} recorded by bike sensors along this route.`,
  tipBig: (n: number) => `${n} big ${n === 1 ? "tree" : "trees"} with a crown of 8 m or more within 20 m, good shade.`,
  tipOsm: "Many mapped trees along the way, so expect more shade.",
  tipNone: "Nothing stands out in the data for this route.",
  gainTrees: (d: number, city: boolean) => `${d} more ${city ? "city" : "mapped"} trees`,
  gainTreesKm: "More trees per km",
  gainHeat: "Cooler heat walk spots",
  gainPasses: (d: number) => `${d} fewer close pass points`,
  gainPassesKm: "Fewer close passes per km",
  pickBoth: "No better option found for this trip",
  pickFaster: (d: number) => `${d} min faster`,
  pickQuickest: "Quickest found",
  pickLonger: (d: number) => `${d} min longer`,
  pickOther: "Another way",
  navBoth: "No other route was better on shade, heat or close passes.",
  navFastest: "Fastest route",
  navFaster: (d: number) => `${d} min faster than GrünRoute.`,
  navQuickest: "The quickest route found.",
  navGain: (g: string) => `${g} than the fastest route.`,
  navOther: "Another way to your end point.",
  cmpLonger: (d: number) => `${d} min longer`,
  cmpShorter: (d: number) => `${d} min shorter`,
  cmpSame: "about the same time",
  cmpTrees: (d: number, city: boolean) => `${d} more ${city ? "city" : "mapped"} trees`,
  cmpHeat: "cooler heat walk spots",
  cmpPasses: (d: number) => `${d} fewer close pass points`,
  cmpLine: (parts: string) => `GrünRoute against the fastest route: ${parts}.`,
  fromLink: "Start from the link",
  toLink: "End from the link",
  mapPoint: (which: "start" | "end"): string => (which === "start" ? "Point on the map (A)" : "Point on the map (B)"),
  proofLabel: "Data behind this map",
  proofRides: (rides: string, km: string) => `${rides} rides, ${km} km`,
  proofRange: (from: string, to: string) => `, ${from} to ${to}`,
  promise: "No app. No sign up. No personal tracking.",
  closeWelcome: "Close welcome",
  headline: "Find a cooler, safer way through Heilbronn",
  tagline: "Cooler, cleaner, and safer streets for Heilbronn",
  showMap: "Show me the map",
  planTrip: "Plan a trip",
  fromRow: (n: string) => `From: ${n}. Change start`,
  toRow: (n: string) => `To: ${n}. Change end`,
  swap: "Swap start and end",
  howTravel: "How do you travel?",
  bike: "Bike",
  walk: "Walk",
  map: "Map",
  tapToSet: (which: "start" | "end") => `Tap the map to set the ${which === "start" ? "start (A)" : "end (B)"}.`,
  cancel: "Cancel",
  mapLayers: "Map layers",
  trees: "Trees",
  heatWalk: "Heat walk",
  loadingDots: "Loading...",
  closePasses: "Close passes",
  dangerError: "Close pass points could not be loaded from ATRAI right now. Tap the layer again to retry.",
  mapControls: "Map controls",
  about: "About GrünRoute",
  resetView: "Reset map view",
  hideLegend: "Hide legend",
  showLegend: "Show legend",
  legend: "Legend",
  mapLegend: "Map legend",
  routes: "Routes",
  fastest: "Fastest",
  arrows: "Arrows show the way",
  alongRoute: "Along your route, zoom in",
  cityTree: "City tree, crown to scale",
  mappedTree: "Mapped tree",
  warmerWalk: "Warmer on walk",
  coolerWalk: "Cooler on walk",
  closePass: "Close pass",
  tapAnything: "Tap anything on the map to see what it means.",
  showLess: "Show less",
  details: "Details",
  yourRoutes: "Your routes",
  routeOptions: "Route options",
  finding: "Finding routes...",
  routeError: "The route service did not answer. Check your connection and try again.",
  tryAgain: "Try again",
  startDirections: "Start directions",
  goOn: "Directions are on. Look at the map, or tap End to stop.",
  tripLine: (a: string, b: string, bike: boolean) => `${a} to ${b}, ${bike ? "by bike" : "on foot"}.`,
  cmpNone: "The fastest route is also the greenest option found for this trip.",
  treesTitleCity: "City register trees within 20 m, per km",
  treesTitleOsm: "Mapped trees within 25 m, per km",
  treesKm: (n: string) => `${n} trees/km`,
  heatTitle: "Heat walk compared with the same walk",
  noHeatData: "No heat data",
  passTitle: "ATRAI close pass points within 15 m",
  passCount: (n: number) => `${n} close ${n === 1 ? "pass" : "passes"}`,
  privacy: "Spoken turns and sounds, like a map app. Your location stays on this phone. Only the start and end points go to the route service.",
  howTitle: "How routes are chosen",
  how1: (dates: string) =>
    `Routes come from OSRM, a public router on OpenStreetMap roads and paths. We ask for the direct route and a few detours, then compare them on trees within 20 m and big crowns (Stadt Heilbronn tree register), heat walk spots along the way (Heat Island Summer School, ${dates}) and close pass points within 15 m (ATRAI). GrünRoute is the best of these that is at most about 40 percent or 8 minutes slower. This is a simple rule, not an official rating.`,
  how2: 'Names like "Shady route" or "Fewer close passes" come from the same simple rule: the part where the route wins most against the fastest route. The icons along the route show big register trees, heat walk spots warmer than the walk median, close pass points, drinking water, and public sensor boxes.',
  how3: "Only your start and end points go to the router to draw the line. During directions your location and speed are used on this phone only. Nothing is stored, and no one tracks your trip.",
  playTitle: "Hot or not?",
  playText: "Guess which spot was warmer on the summer heat walks.",
  measureTitle: "Help measure",
  measureText: "Ride a short mission where the city has little data.",
  aboutTitle: "About GrünRoute",
  liveTitle: "Sensor snapshot near Heilbronn",
  liveText: "Latest public values from openSenseMap, read when you open this page. A single live value never changes a street score.",
  liveLoading: "Reading openSenseMap...",
  liveNone: "No fresh public sensor in Heilbronn right now.",
  liveOffline: "No live values right now. The map uses checked historical data.",
  temperature: "Temperature",
  pm10: "Dust PM10",
  pm25: "Dust PM2.5",
  noValue: "No value",
  sensorBox: "Sensor box",
  pmSame: "PM2.5 and PM10 show the same value reported by the sensor.",
  refresh: "Refresh values",
  staleFrom: "Old data, newest value from ",
  newestFrom: "Newest value from ",
  factsTitle: "The data behind it",
  factsText: "Only data from the organisers, the partners, and the open sources the organisers list. Nothing is filled in to close a gap.",
  bikeRides: "Bike rides",
  kmRidden: "Kilometres ridden",
  riders: "Riders",
  enoughData: "Streets with enough data",
  measuredPasses: "Measured passes",
  publicTrees: "Public trees, city register",
  heatReadings: "Heat walk readings",
  crashes: "Bike or foot injury crashes, 2021 to 2025",
  sourcesLine: (names: string) => `Sources: ${names}. Details below.`,
  moreAbout: "More about GrünRoute",
  whatTitle: "What GrünRoute does",
  whatText:
    "GrünRoute Heilbronn uses existing bike, school, and heat data to show cooler, cleaner, and safer routes through Heilbronn, with no app, sign up, or personal tracking. The same data helps the city decide which streets to fix first.",
  sourcesTitle: "All data sources in detail",
  licence: "Licence",
  coverageTitle: "Coverage and timing",
  coverageText: "Bike data exists only where riders rode. Heat walks happen in summer only. A street with little data is not shown as good or bad, it just has little data.",
  limitsTitle: "Honest limits",
  limitsText:
    "Low cost sensors are affected by humidity, calibration, and ageing, so this is a screening tool, not a legal measurement. Few overtakes can mean few riders, not a safe street. Live directions follow OpenStreetMap routes, so always watch the road and follow traffic signs.",
};

const T: Record<Lang, typeof T_EN> = {
  en: T_EN,
  de: {
    notLoaded: "Nicht geladen",
    loading: "Lädt",
    routeName: { green: "GrünRoute", fastest: "Schnellste", both: "Schnellste und grünste", other: "Weitere Option" },
    tipHot: (a) => `Der wärmste Hitze-Spot auf dieser Route lag bei ${a}, verglichen mit demselben Rundgang. Schatten und Wasser helfen an heißen Tagen.`,
    tipNoHeat: "Wenige Hitze-Rundgänge führten entlang dieser Route, daher wird Hitze hier nicht verglichen.",
    tipWater: (n) => `${n} ${n === 1 ? "Trinkwasser-Punkt" : "Trinkwasser-Punkte"} nahe der Route.`,
    tipDanger: (n) => `${n} ${n === 1 ? "Punkt mit enger Überholung wurde" : "Punkte mit enger Überholung wurden"} von Rad-Sensoren entlang dieser Route erfasst.`,
    tipBig: (n) => `${n} ${n === 1 ? "großer Baum" : "große Bäume"} mit einer Krone ab 8 m im Umkreis von 20 m, guter Schatten.`,
    tipOsm: "Viele kartierte Bäume am Weg, also eher mehr Schatten.",
    tipNone: "Für diese Route fällt in den Daten nichts auf.",
    gainTrees: (d, city) => `${d} ${city ? "Stadtbäume" : "kartierte Bäume"} mehr`,
    gainTreesKm: "Mehr Bäume pro km",
    gainHeat: "Kühlere Hitze-Spots",
    gainPasses: (d) => `${d} enge Überholungen weniger`,
    gainPassesKm: "Weniger enge Überholungen pro km",
    pickBoth: "Keine bessere Option für diese Fahrt",
    pickFaster: (d) => `${d} min schneller`,
    pickQuickest: "Am schnellsten",
    pickLonger: (d) => `${d} min länger`,
    pickOther: "Ein anderer Weg",
    navBoth: "Keine andere Route war besser bei Schatten, Hitze oder engen Überholungen.",
    navFastest: "Schnellste Route",
    navFaster: (d) => `${d} min schneller als GrünRoute.`,
    navQuickest: "Die schnellste gefundene Route.",
    navGain: (g) => `${g} als die schnellste Route.`,
    navOther: "Ein anderer Weg zu deinem Ziel.",
    cmpLonger: (d) => `${d} min länger`,
    cmpShorter: (d) => `${d} min kürzer`,
    cmpSame: "etwa gleich lang",
    cmpTrees: (d, city) => `${d} ${city ? "Stadtbäume" : "kartierte Bäume"} mehr`,
    cmpHeat: "kühlere Hitze-Spots",
    cmpPasses: (d) => `${d} enge Überholungen weniger`,
    cmpLine: (parts) => `GrünRoute im Vergleich zur schnellsten Route: ${parts}.`,
    fromLink: "Start aus dem Link",
    toLink: "Ziel aus dem Link",
    mapPoint: (which) => (which === "start" ? "Punkt auf der Karte (A)" : "Punkt auf der Karte (B)"),
    proofLabel: "Daten hinter dieser Karte",
    proofRides: (rides, km) => `${rides} Fahrten, ${km} km`,
    proofRange: (from, to) => `, ${from} bis ${to}`,
    promise: "Keine App. Keine Anmeldung. Kein persönliches Tracking.",
    closeWelcome: "Willkommen schließen",
    headline: "Kühler und sicherer durch Heilbronn",
    tagline: "Kühlere, sauberere und sicherere Straßen für Heilbronn",
    showMap: "Zur Karte",
    planTrip: "Route planen",
    fromRow: (n) => `Von: ${n}. Start ändern`,
    toRow: (n) => `Nach: ${n}. Ziel ändern`,
    swap: "Start und Ziel tauschen",
    howTravel: "Wie bist du unterwegs?",
    bike: "Rad",
    walk: "Zu Fuß",
    map: "Karte",
    tapToSet: (which) => `Tippe auf die Karte, um ${which === "start" ? "den Start (A)" : "das Ziel (B)"} zu setzen.`,
    cancel: "Abbrechen",
    mapLayers: "Kartenebenen",
    trees: "Bäume",
    heatWalk: "Hitze-Rundgang",
    loadingDots: "Lädt...",
    closePasses: "Enge Überholungen",
    dangerError: "Die Punkte mit enger Überholung konnten gerade nicht von ATRAI geladen werden. Tippe noch einmal auf die Ebene, um es erneut zu versuchen.",
    mapControls: "Kartensteuerung",
    about: "Über GrünRoute",
    resetView: "Kartenansicht zurücksetzen",
    hideLegend: "Legende ausblenden",
    showLegend: "Legende zeigen",
    legend: "Legende",
    mapLegend: "Kartenlegende",
    routes: "Routen",
    fastest: "Schnellste",
    arrows: "Pfeile zeigen den Weg",
    alongRoute: "Entlang deiner Route, zum Sehen reinzoomen",
    cityTree: "Stadtbaum, Krone maßstabsgetreu",
    mappedTree: "Kartierter Baum",
    warmerWalk: "Wärmer beim Rundgang",
    coolerWalk: "Kühler beim Rundgang",
    closePass: "Enge Überholung",
    tapAnything: "Tippe auf etwas auf der Karte, um zu sehen, was es bedeutet.",
    showLess: "Weniger",
    details: "Details",
    yourRoutes: "Deine Routen",
    routeOptions: "Routenoptionen",
    finding: "Suche Routen...",
    routeError: "Der Routendienst hat nicht geantwortet. Prüfe deine Verbindung und versuche es noch einmal.",
    tryAgain: "Noch einmal",
    startDirections: "Navigation starten",
    goOn: "Die Navigation läuft. Schau auf die Karte, oder tippe auf Beenden, um zu stoppen.",
    tripLine: (a, b, bike) => `${a} nach ${b}, ${bike ? "mit dem Rad" : "zu Fuß"}.`,
    cmpNone: "Die schnellste Route ist auch die grünste Option für diese Fahrt.",
    treesTitleCity: "Bäume aus dem Baumkataster im Umkreis von 20 m, pro km",
    treesTitleOsm: "Kartierte Bäume im Umkreis von 25 m, pro km",
    treesKm: (n) => `${n} Bäume/km`,
    heatTitle: "Hitze-Rundgang, verglichen mit demselben Rundgang",
    noHeatData: "Keine Hitzedaten",
    passTitle: "ATRAI-Punkte mit enger Überholung im Umkreis von 15 m",
    passCount: (n) => `${n} ${n === 1 ? "enge Überholung" : "enge Überholungen"}`,
    privacy: "Gesprochene Hinweise und Töne, wie in einer Karten-App. Dein Standort bleibt auf diesem Handy. Nur Start und Ziel gehen an den Routendienst.",
    howTitle: "So werden Routen gewählt",
    how1: (dates) =>
      `Routen kommen von OSRM, einem öffentlichen Routenplaner auf Straßen und Wegen von OpenStreetMap. Wir fragen die direkte Route und einige Umwege ab und vergleichen sie nach Bäumen im Umkreis von 20 m und großen Kronen (Baumkataster der Stadt Heilbronn), Hitze-Spots am Weg (Heat Island Summer School, ${dates}) und Punkten mit enger Überholung im Umkreis von 15 m (ATRAI). GrünRoute ist die beste davon, die höchstens etwa 40 Prozent oder 8 Minuten langsamer ist. Das ist eine einfache Regel, keine offizielle Bewertung.`,
    how2: "Namen wie „Schattige Route“ oder „Weniger enge Überholungen“ kommen aus derselben einfachen Regel: dem Teil, in dem die Route am meisten gegenüber der schnellsten Route gewinnt. Die Symbole entlang der Route zeigen große Bäume aus dem Baumkataster, Hitze-Spots wärmer als der Median des Rundgangs, Punkte mit enger Überholung, Trinkwasser und öffentliche Sensorboxen.",
    how3: "Nur Start und Ziel gehen an den Routenplaner, um die Linie zu zeichnen. Während der Navigation werden dein Standort und dein Tempo nur auf diesem Handy genutzt. Nichts wird gespeichert, und niemand verfolgt deine Fahrt.",
    playTitle: "Heiß oder nicht?",
    playText: "Rate, welche Stelle bei den Hitze-Rundgängen im Sommer wärmer war.",
    measureTitle: "Mitmessen",
    measureText: "Fahre eine kurze Mission, wo die Stadt wenig Daten hat.",
    aboutTitle: "Über GrünRoute",
    liveTitle: "Sensor-Momentaufnahme bei Heilbronn",
    liveText: "Neueste öffentliche Werte von openSenseMap, gelesen beim Öffnen dieser Seite. Ein einzelner Live-Wert ändert nie die Bewertung einer Straße.",
    liveLoading: "Lese openSenseMap...",
    liveNone: "Gerade kein aktueller öffentlicher Sensor in Heilbronn.",
    liveOffline: "Gerade keine Live-Werte. Die Karte nutzt geprüfte historische Daten.",
    temperature: "Temperatur",
    pm10: "Feinstaub PM10",
    pm25: "Feinstaub PM2,5",
    noValue: "Kein Wert",
    sensorBox: "Sensorbox",
    pmSame: "PM2,5 und PM10 zeigen denselben Wert, den der Sensor meldet.",
    refresh: "Werte aktualisieren",
    staleFrom: "Alte Daten, neuester Wert vom ",
    newestFrom: "Neuester Wert vom ",
    factsTitle: "Die Daten dahinter",
    factsText: "Nur Daten der Veranstalter, der Partner und der offenen Quellen, die die Veranstalter nennen. Nichts wird ergänzt, um eine Lücke zu füllen.",
    bikeRides: "Radfahrten",
    kmRidden: "Gefahrene Kilometer",
    riders: "Radfahrende",
    enoughData: "Straßen mit genug Daten",
    measuredPasses: "Gemessene Überholungen",
    publicTrees: "Öffentliche Bäume, Baumkataster",
    heatReadings: "Messwerte der Hitze-Rundgänge",
    crashes: "Unfälle mit Verletzten, Rad oder zu Fuß, 2021 bis 2025",
    sourcesLine: (names) => `Quellen: ${names}. Details unten.`,
    moreAbout: "Mehr über GrünRoute",
    whatTitle: "Was GrünRoute macht",
    whatText:
      "GrünRoute Heilbronn nutzt vorhandene Rad-, Schul- und Hitzedaten, um kühlere, sauberere und sicherere Routen durch Heilbronn zu zeigen, ohne App, Anmeldung oder persönliches Tracking. Dieselben Daten helfen der Stadt zu entscheiden, welche Straßen sie zuerst verbessert.",
    sourcesTitle: "Alle Datenquellen im Detail",
    licence: "Lizenz",
    coverageTitle: "Abdeckung und Zeitraum",
    coverageText: "Raddaten gibt es nur dort, wo Leute gefahren sind. Hitze-Rundgänge gibt es nur im Sommer. Eine Straße mit wenig Daten wird nicht als gut oder schlecht gezeigt, sie hat einfach wenig Daten.",
    limitsTitle: "Ehrliche Grenzen",
    limitsText:
      "Günstige Sensoren werden von Feuchtigkeit, Kalibrierung und Alterung beeinflusst, daher ist dies ein Screening-Werkzeug, keine rechtliche Messung. Wenige Überholungen können wenige Fahrende bedeuten, keine sichere Straße. Die Navigation folgt Routen von OpenStreetMap, achte also immer auf die Straße und folge den Verkehrszeichen.",
  },
};

const count = (meta: SegmentData["meta"] | undefined, key: string, failed: boolean, lang: Lang) => {
  const v = meta?.counts[key];
  return typeof v === "number" ? fmtNum(v, lang) : failed ? T[lang].notLoaded : T[lang].loading;
};
const BALANCED = presetById("balanced")!;

function formatTime(iso: string, lang: Lang) {
  try {
    return new Date(iso).toLocaleString(LOCALE[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** "lat,lng" from the link, only inside a wide box around Heilbronn. */
function placeFromQuery(v: string | null, name: string | null, fallback: string): MapPlace | null {
  if (!v) return null;
  const [lat, lng] = v.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat - 49.14) > 0.5 || Math.abs(lng - 9.21) > 0.6) return null;
  return { name: name?.slice(0, 80) || fallback, lat, lng };
}

function routeTips(r: RouteOption, mode: Mode, lang: Lang) {
  const t = T[lang];
  const m = r.metrics;
  const tips: string[] = [];
  if (m.heat.covered >= 0.2 && m.heat.hottest && m.heat.hottest.anomaly >= 1) {
    tips.push(t.tipHot(fmtAnomaly(m.heat.hottest.anomaly, lang)));
  }
  if (m.heat.covered < 0.2) tips.push(t.tipNoHeat);
  if (m.water > 0) tips.push(t.tipWater(m.water));
  if (m.danger !== null && m.danger > 0 && mode === "bike") tips.push(t.tipDanger(m.danger));
  if (m.treeSource === "city" && m.bigCrowns !== null && m.bigCrowns > 0) tips.push(t.tipBig(m.bigCrowns));
  else if (m.treeSource === "osm" && m.treesPerKm >= 40) tips.push(t.tipOsm);
  if (!tips.length) tips.push(t.tipNone);
  return tips;
}

/** What a route gains on the other one, in a few words, from the part of the comfort rule that wins. */
function gainText(term: ComfortTerm, a: RouteMetrics, b: RouteMetrics, lang: Lang) {
  const t = T[lang];
  if (term === "shade") {
    const d = a.trees - b.trees;
    return d > 0 ? t.gainTrees(d, a.treeSource === "city") : t.gainTreesKm;
  }
  if (term === "heat") return t.gainHeat;
  const d = (b.danger ?? 0) - (a.danger ?? 0);
  return d > 0 ? t.gainPasses(d) : t.gainPassesKm;
}

/** One line under each route in the sheet: why pick it. */
function pickReason(r: RouteOption, green: RouteOption | undefined, fast: RouteOption | undefined, lang: Lang) {
  const t = T[lang];
  if (r.label === "both") return t.pickBoth;
  if (r.label === "fastest") {
    const d = green && green !== r ? green.metrics.min - r.metrics.min : 0;
    return d > 0 ? t.pickFaster(d) : t.pickQuickest;
  }
  const g = fast ? mainGain(r.metrics, fast.metrics) : null;
  if (g && fast) return gainText(g, r.metrics, fast.metrics, lang);
  const d = fast ? r.metrics.min - fast.metrics.min : 0;
  return d > 0 ? t.pickLonger(d) : t.pickOther;
}

/** The route card during directions: a name from the simple rule in lib/comfort.ts, and why. */
function navCard(r: RouteOption, green: RouteOption | undefined, fast: RouteOption | undefined, lang: Lang) {
  const t = T[lang];
  if (r.label === "both") return { name: t.routeName.both, reason: t.navBoth };
  if (r.label === "fastest") {
    const d = green && green !== r ? green.metrics.min - r.metrics.min : 0;
    return { name: t.navFastest, reason: d > 0 ? t.navFaster(d) : t.navQuickest };
  }
  const g = fast ? mainGain(r.metrics, fast.metrics) : null;
  if (g && fast) return { name: ROUTE_THEMES[lang][g], reason: t.navGain(gainText(g, r.metrics, fast.metrics, lang)) };
  return { name: t.routeName[r.label], reason: t.navOther };
}

// Wide screens (1024 px and up) show the sheet as a side panel.
const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
}

function IconBadge({ kind }: { kind: IconKind }) {
  return (
    <span className="legend-poi" style={{ color: ICON_COLOR[kind] }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" dangerouslySetInnerHTML={{ __html: ICON_GLYPH[kind] }} />
    </span>
  );
}

const INTRO_KEY = "gr-intro-done";

function compareLine(green: RouteOption | undefined, fast: RouteOption | undefined, lang: Lang) {
  if (!green || !fast || green === fast) return null;
  const t = T[lang];
  const dMin = green.metrics.min - fast.metrics.min;
  const dTrees = green.metrics.trees - fast.metrics.trees;
  const parts: string[] = [];
  parts.push(dMin > 0 ? t.cmpLonger(dMin) : dMin < 0 ? t.cmpShorter(-dMin) : t.cmpSame);
  if (dTrees > 0) parts.push(t.cmpTrees(dTrees, green.metrics.treeSource === "city"));
  if (green.metrics.heat.avg !== null && fast.metrics.heat.avg !== null && green.metrics.heat.avg < fast.metrics.heat.avg) parts.push(t.cmpHeat);
  if (green.metrics.danger !== null && fast.metrics.danger !== null && green.metrics.danger < fast.metrics.danger) parts.push(t.cmpPasses(fast.metrics.danger - green.metrics.danger));
  return t.cmpLine(parts.join(", "));
}


export default function Home({ qr }: { qr: string }) {
  const lang = useLang();
  const t = T[lang];
  const href = useHref();
  const CAMPAIGN = campaignFor(lang);
  const [mode, setMode] = useState<Mode>("bike");
  const [start, setStart] = useState<MapPlace>(() => placesFor(lang).station);
  const [end, setEnd] = useState<MapPlace>(() => placesFor(lang).campus);
  const [picker, setPicker] = useState<"start" | "end" | null>(null);
  // Set when the user picked "Choose on the map": the next map tap sets this point.
  const [mapPick, setMapPick] = useState<"start" | "end" | null>(null);
  const [layers, setLayers] = useState<Layers>({ trees: false, heat: false, danger: false });
  const [legendOpen, setLegendOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [fair, setFair] = useState(false);
  // Bottom sheet on phones: peek (routes and Start) or full (details and more).
  const [sheetFull, setSheetFull] = useState(false);
  // First visit card with the headline. Closed for good once dismissed (localStorage only).
  const [introOpen, setIntroOpen] = useState(false);
  const [cardOff, setCardOff] = useState(false);
  const wide = useWide();

  // Measured street network (public/data/segments.json). The big file waits until the
  // first map tiles are in (or 4 s at most), so it does not hold up the first view.
  const [mapReady, setMapReady] = useState(false);
  const [data, setData] = useState<SegmentData | null>(null);
  const [dataState, setDataState] = useState<LoadState>("idle");
  const [cityTrees, setCityTrees] = useState<CityTrees | null>(null);
  const [danger, setDanger] = useState<DangerPoint[] | null>(null);
  const [dangerState, setDangerState] = useState<LoadState>("idle");
  const [rawRoutes, setRawRoutes] = useState<RawRoute[]>([]);
  const [routeState, setRouteState] = useState<LoadState>("idle");
  const [routeTry, setRouteTry] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveValue | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("loading");
  const [boxes, setBoxes] = useState<LiveBox[]>([]);
  const [follow, setFollow] = useState(true);

  const appRef = useRef<HTMLDivElement | null>(null);
  const tripRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const nav = useNavigation(mode, [end.lat, end.lng]);
  const navOn = nav.state.status !== "idle";

  const onMapReady = useCallback(() => setMapReady(true), []);
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!mapReady) return;
    let alive = true;
    const t = setTimeout(() => {
      setDataState("loading");
      loadSegments()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setDataState("ok");
        })
        .catch(() => alive && setDataState("error"));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mapReady]);

  // City tree register (43,031 trees), also after the first map tiles.
  useEffect(() => {
    if (!mapReady) return;
    let alive = true;
    const t = setTimeout(() => {
      loadCityTrees()
        .then((ct) => alive && setCityTrees(ct))
        .catch(() => {
          // Keep the OpenStreetMap trees as a fallback.
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mapReady]);

  // Read the link once: a trip from Help measure (?from, ?to) and fair mode (?fair=1).
  // Also show the first visit card, unless it was closed before on this phone.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const a = placeFromQuery(q.get("from"), q.get("fn"), T[lang].fromLink);
      const b = placeFromQuery(q.get("to"), q.get("tn"), T[lang].toLink);
      if (a) setStart(a);
      if (b) setEnd(b);
      if (q.get("mode") === "foot") setMode("foot");
      if (q.get("fair") === "1") setFair(true);
      let seen = false;
      try {
        seen = localStorage.getItem(INTRO_KEY) === "1";
      } catch {
        // Storage blocked: show the card, it can still be closed.
      }
      if (!seen) setIntroOpen(true);
    }, 0);
    return () => clearTimeout(t);
    // Read once on mount, like before. The language does not change on a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sizes of the floating trip card and the sheet at peek, for the map controls and the map fit.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const ro = new ResizeObserver(() => {
      if (tripRef.current) app.style.setProperty("--trip-h", `${Math.ceil(tripRef.current.offsetHeight)}px`);
      if (peekRef.current && handleRef.current) app.style.setProperty("--peek-h", `${Math.ceil(handleRef.current.offsetHeight + peekRef.current.offsetHeight)}px`);
    });
    for (const el of [tripRef.current, peekRef.current, handleRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Count of streets with enough data and at least 20 m long, for the facts.
  const enoughCount = useMemo(() => {
    if (!data) return null;
    const streets = aggregateStreets(data.segments);
    return rankSegments(streets, BALANCED, percentiles(streets)).filter((x) => x.score != null && enoughData(x) && x.seg.length >= MIN_SEGMENT_M).length;
  }, [data]);
  const hero = useMemo(() => heroFact(data?.meta ?? null, lang), [data, lang]);

  // Close pass points: load when the layer is on, or when routes are compared.
  useEffect(() => {
    if (dangerState !== "idle") return;
    if (!layers.danger && !rawRoutes.length) return;
    const t = setTimeout(() => {
      setDangerState("loading");
      loadDangerPoints()
        .then((d) => {
          setDanger(d);
          setDangerState("ok");
        })
        .catch(() => setDangerState("error"));
    }, 0);
    return () => clearTimeout(t);
  }, [layers.danger, rawRoutes.length, dangerState]);

  // Real routes from OSRM whenever the trip changes.
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      setRouteState("loading");
      fetchRouteOptions([start.lat, start.lng], [end.lat, end.lng], mode, controller.signal)
        .then((r) => {
          setRawRoutes(r);
          setSelectedRouteId(null);
          setRouteState(r.length ? "ok" : "error");
        })
        .catch((e: unknown) => {
          if ((e as Error)?.name === "AbortError") return;
          setRawRoutes([]);
          setRouteState("error");
        });
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [start.lat, start.lng, end.lat, end.lng, mode, routeTry]);

  const routes = useMemo(() => rankRoutes(rawRoutes, danger, cityTrees), [rawRoutes, danger, cityTrees]);
  const activeRouteId = selectedRouteId && routes.some((r) => r.id === selectedRouteId) ? selectedRouteId : (routes[0]?.id ?? null);
  const activeRoute = routes.find((r) => r.id === activeRouteId);
  const greenRoute = routes.find((r) => r.label === "green" || r.label === "both");
  const fastRoute = routes.find((r) => r.label === "fastest" || r.label === "both");
  const compare = compareLine(greenRoute, fastRoute, lang);

  const insight = useMemo(() => (selection ? insightFor(selection, danger, cityTrees, lang) : null), [selection, danger, cityTrees, lang]);

  // Icons along the chosen (or followed) route, only from data we have.
  const iconRoute = navOn ? (nav.state.route ?? activeRoute) : activeRoute;
  const icons = useMemo(() => {
    const line = iconRoute?.coords;
    if (!line || line.length < 2) return [];
    const trees = cityTrees ? cityTrees.nearLine(line, 20).map((i) => ({ lat: cityTrees.lat[i], lng: cityTrees.lng[i], crown: cityTrees.crown[i], ref: i })) : [];
    return routeIcons(line, { trees, heat: HEAT, danger, water: WATER, sensors: boxes }, lang);
  }, [iconRoute, cityTrees, danger, boxes, lang]);
  const iconKinds = (Object.keys(ICON_NAME) as IconKind[]).filter((k) => icons.some((i) => i.kind === k));

  async function fetchLive() {
    setLiveState("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Only boxes inside the city boundary, values below 0 dropped (lib/live.ts).
      const boxes = await fetchHeilbronnBoxes(controller.signal, 20);
      clearTimeout(timeout);
      setBoxes(boxes);
      // Use ONE box: the newest fresh box with a temperature or dust value, and only its own values.
      const picked = boxes.find((b) => b.fresh && (b.temp || b.pm10 || b.pm25));
      if (!picked) {
        setLive(null);
        setLiveState("none");
        return;
      }
      const text = (r: LiveReading | null) => (r ? `${lang === "de" ? fmtNum(r.value, lang) : r.value} ${r.unit}`.trim() : null);
      const same = !!(picked.pm10 && picked.pm25 && picked.pm10.value === picked.pm25.value);
      setLive({ temp: text(picked.temp), pm10: text(picked.pm10), pm25: text(picked.pm25), same, box: picked.name, time: formatTime(picked.updatedAt, lang) });
      setLiveState("ok");
    } catch {
      clearTimeout(timeout);
      setLive(null);
      setLiveState("offline");
    }
  }
  useEffect(() => {
    // Read the first snapshot after mount, outside the render pass.
    const t = setTimeout(fetchLive, 0);
    return () => clearTimeout(t);
    // Read once on mount. The language does not change on a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setSheet(full: boolean) {
    setSheetFull(full);
    if (!full && scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  // The handle: a tap toggles, a drag up or down also works.
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  function handleDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (wide || e.button !== 0) return;
    drag.current = { y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 8) return;
    d.moved = true;
    el.classList.add("is-dragging");
    el.style.setProperty("--drag", `${sheetFull ? Math.max(0, dy) : Math.min(0, dy)}px`);
  }
  function handleUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove("is-dragging");
    el.style.removeProperty("--drag");
    if (!d.moved) return;
    skipClick.current = true;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 40) setSheet(dy < 0);
  }
  function handleClick() {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    setSheet(!sheetFull);
  }

  function closeIntro() {
    setIntroOpen(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Storage blocked: the card shows again next time.
    }
    requestAnimationFrame(() => document.getElementById("about-btn")?.focus({ preventScroll: true }));
  }
  function openIntro() {
    setIntroOpen(true);
    requestAnimationFrame(() => document.getElementById("intro-close")?.focus({ preventScroll: true }));
  }

  function choose(which: "start" | "end", p: MapPlace) {
    if (which === "start") setStart(p);
    else setEnd(p);
    setPicker(null);
  }

  // Closing the picker sends focus back to the A or B button that opened it.
  function closePicker(which: "start" | "end") {
    setPicker(null);
    requestAnimationFrame(() => document.getElementById(`trip-${which}`)?.focus({ preventScroll: true }));
  }

  function pickOnMap(which: "start" | "end", lat: number, lng: number) {
    choose(which, { name: t.mapPoint(which), lat, lng });
    setMapPick(null);
  }

  function chooseOnMap(which: "start" | "end") {
    setPicker(null);
    setSelection(null);
    setSheet(false);
    setMapPick(which);
  }

  // Escape cancels "Choose on the map".
  useEffect(() => {
    if (!mapPick) return;
    const off = (e: KeyboardEvent) => e.key === "Escape" && setMapPick(null);
    window.addEventListener("keydown", off);
    return () => window.removeEventListener("keydown", off);
  }, [mapPick]);

  // Arrow keys move between Bike and Walk, like a radio group.
  function modeKey(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: Mode = mode === "bike" ? "foot" : "bike";
    setMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  }

  function toggleLayer(k: keyof Layers) {
    setLayers((l) => ({ ...l, [k]: !l[k] }));
    if (k === "danger" && dangerState === "error") setDangerState("idle");
  }

  // Must run inside the tap: the sound needs a user gesture on iOS.
  function startDirections() {
    if (!activeRoute) return;
    setSelection(null);
    setPicker(null);
    setMapPick(null);
    setFollow(true);
    setCardOff(false);
    setSheet(false);
    nav.start(activeRoute);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }

  const navView: NavView | null = navOn ? { route: (nav.state.route ?? activeRoute)?.coords ?? [], pos: nav.state.pos, follow, covered: nav.state.covered } : null;
  const selectionAt = insight ? insight.at : null;
  const card = navOn && !cardOff && activeRoute && nav.state.route?.id === activeRoute.id ? navCard(activeRoute, greenRoute, fastRoute, lang) : null;
  const proof = (
    <div className="proof" role="note" aria-label={t.proofLabel}>
      <p className="proof-data">
        <b>{t.proofRides(CAMPAIGN.rides, CAMPAIGN.km)}</b>
        {t.proofRange(CAMPAIGN.from, CAMPAIGN.to)}
      </p>
      <p className="proof-promise">{t.promise}</p>
    </div>
  );

  return (
    <div className={`page${navOn ? " is-nav" : ""}`}>
      <AppNav />

      <div
        ref={appRef}
        className={`mapapp${navOn ? " is-nav" : ""}${insight ? " has-card" : ""}${mapPick && !navOn ? " is-picking" : ""}${sheetFull ? " is-full" : ""}${introOpen ? " has-intro" : ""}`}
      >
        {introOpen ? (
          <section className="intro-card" aria-labelledby="headline">
            <button type="button" id="intro-close" className="intro-x" aria-label={t.closeWelcome} onClick={closeIntro}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
            <h1 id="headline">{t.headline}</h1>
            <p className="tagline">{t.tagline}</p>
            {proof}
            <button type="button" className="btn intro-go" onClick={closeIntro}>
              {t.showMap}
            </button>
          </section>
        ) : (
          <h1 id="headline" className="sr-only">
            {t.headline}
          </h1>
        )}

        <div className="planner trip-card" role="group" aria-label={t.planTrip} ref={tripRef} data-map-cover="top">
          <div className="trip">
            <div className="trip-rows">
              <button type="button" id="trip-start" className="trip-row" aria-haspopup="dialog" aria-label={t.fromRow(start.name)} onClick={() => setPicker("start")} disabled={navOn}>
                <span className="trip-pin" aria-hidden="true">A</span>
                <span className="trip-text">{start.name}</span>
              </button>
              <button type="button" id="trip-end" className="trip-row" aria-haspopup="dialog" aria-label={t.toRow(end.name)} onClick={() => setPicker("end")} disabled={navOn}>
                <span className="trip-pin" aria-hidden="true">B</span>
                <span className="trip-text">{end.name}</span>
              </button>
            </div>
            <button
              type="button"
              className="swap"
              aria-label={t.swap}
              disabled={navOn}
              onClick={() => {
                setStart(end);
                setEnd(start);
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="modes" role="radiogroup" aria-label={t.howTravel} onKeyDown={modeKey}>
              {(["bike", "foot"] as const).map((m) => (
                <button
                  key={m}
                  id={`mode-${m}`}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  aria-label={m === "bike" ? t.bike : t.walk}
                  title={m === "bike" ? t.bike : t.walk}
                  tabIndex={mode === m ? 0 : -1}
                  className="mode"
                  onClick={() => setMode(m)}
                  disabled={navOn}
                >
                  {m === "bike" ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="5.5" cy="16.5" r="3.5" />
                        <circle cx="18.5" cy="16.5" r="3.5" />
                        <path d="M5.5 16.5L9 9h7l2.5 7.5M9 9l3.5 7.5H5.5M14 6h2.5l-.5 3" />
                      </g>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="13" cy="4" r="2" fill="currentColor" stroke="none" />
                        <path d="M10 21l2-6-2.5-3 1-5 3 3.5h3M12 15l3 6M9.5 8L7 12" />
                      </g>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
          {picker && (
            <PlacePicker
              key={picker}
              which={picker}
              onPick={(p) => {
                choose(picker, p);
                closePicker(picker);
              }}
              onMap={() => chooseOnMap(picker)}
              onClose={() => closePicker(picker)}
            />
          )}
        </div>

        <section className="mapzone" id="map" aria-label={t.map}>
          <div className={`mapframe${insight ? " has-card" : ""}${navOn ? " is-nav" : ""}${mapPick && !navOn ? " is-picking" : ""}`}>
            <MapView
              resetKey={resetKey}
              layers={layers}
              danger={danger}
              cityTrees={cityTrees}
              start={start}
              end={end}
              routes={routes}
              selectedRouteId={activeRouteId}
              selection={selection}
              selectionAt={selectionAt}
              nav={navView}
              icons={icons}
              onMapReady={onMapReady}
              onSelect={setSelection}
              onRouteSelect={setSelectedRouteId}
              onPick={pickOnMap}
              pickFor={navOn ? null : mapPick}
              onUserPan={() => setFollow(false)}
            />

            {navOn ? (
              <NavPanel
                state={nav.state}
                mode={mode}
                endName={end.name}
                follow={follow}
                onRecentre={() => setFollow(true)}
                onMute={nav.setMuted}
                onReroute={nav.reroute}
                onWhole={() => {
                  setFollow(false);
                  setResetKey((k) => k + 1);
                }}
                card={card}
                onDismissCard={() => setCardOff(true)}
                onEnd={() => {
                  nav.stop();
                  setFollow(true);
                }}
              />
            ) : (
              <>
                {mapPick ? (
                  <div className="map-pickbar">
                    <p role="status">{t.tapToSet(mapPick)}</p>
                    <button type="button" onClick={() => setMapPick(null)}>
                      {t.cancel}
                    </button>
                  </div>
                ) : (
                  <div className="layerbar" role="group" aria-label={t.mapLayers}>
                    <button type="button" className="layer-chip" aria-pressed={layers.trees} onClick={() => toggleLayer("trees")}>
                      <i className="dot dot-tree" aria-hidden="true" /> {t.trees}
                    </button>
                    <button type="button" className="layer-chip" aria-pressed={layers.heat} onClick={() => toggleLayer("heat")}>
                      <i className="dot dot-heat" aria-hidden="true" /> {t.heatWalk}
                    </button>
                    <button type="button" className="layer-chip" aria-pressed={layers.danger} onClick={() => toggleLayer("danger")} aria-busy={dangerState === "loading"}>
                      <i className="dot dot-danger" aria-hidden="true" /> {dangerState === "loading" && layers.danger ? t.loadingDots : t.closePasses}
                    </button>
                  </div>
                )}
                {layers.danger && dangerState === "error" && <p className="map-msg">{t.dangerError}</p>}

                <div className="map-ctrls" role="group" aria-label={t.mapControls}>
                  <button type="button" id="about-btn" className="map-btn" aria-label={t.about} title={t.about} onClick={openIntro}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="map-btn"
                    aria-label={t.resetView}
                    title={t.resetView}
                    onClick={() => {
                      setSelection(null);
                      setResetKey((k) => k + 1);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {!insight && (
                    <button
                      type="button"
                      className="map-btn legend-toggle"
                      aria-expanded={legendOpen}
                      aria-controls="map-legend"
                      aria-label={legendOpen ? t.hideLegend : t.showLegend}
                      title={t.legend}
                      onClick={() => setLegendOpen((o) => !o)}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path d="M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {insight ? (
                  <InfoCard insight={insight} onClose={() => setSelection(null)} />
                ) : (
                  <div className={`map-legend${legendOpen ? " is-open" : ""}`} id="map-legend" aria-label={t.mapLegend}>
                    <p className="legend-title">{t.routes}</p>
                    <ul>
                      <li>
                        <i className="line line-green" aria-hidden="true" />
                        GrünRoute
                      </li>
                      <li>
                        <i className="line line-fast" aria-hidden="true" />
                        {t.fastest}
                      </li>
                      <li>
                        <i className="line line-chev" aria-hidden="true" />
                        {t.arrows}
                      </li>
                    </ul>
                    {iconKinds.length > 0 && (
                      <>
                        <p className="legend-title legend-sub">{t.alongRoute}</p>
                        <ul>
                          {iconKinds.map((k) => (
                            <li key={k}>
                              <IconBadge kind={k} /> {ICON_NAMES[lang][k]}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {(layers.heat || layers.trees || layers.danger) && (
                      <ul className="legend-layers">
                        {layers.trees && (
                          <li>
                            <i className="dot dot-tree" aria-hidden="true" /> {cityTrees ? t.cityTree : t.mappedTree}
                          </li>
                        )}
                        {layers.heat && (
                          <>
                            <li>
                              <i className="dot dot-heat" aria-hidden="true" /> {t.warmerWalk}
                            </li>
                            <li>
                              <i className="dot dot-cool" aria-hidden="true" /> {t.coolerWalk}
                            </li>
                          </>
                        )}
                        {layers.danger && (
                          <li>
                            <i className="dot dot-danger" aria-hidden="true" /> {t.closePass}
                          </li>
                        )}
                      </ul>
                    )}
                    <p className="legend-note">{t.tapAnything}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section
          ref={sheetRef}
          className="sheet-panel"
          id="panel"
          aria-labelledby="routes-title"
          data-map-cover="bottom"
          onKeyDown={(e) => {
            if (e.key === "Escape" && sheetFull && !wide) {
              setSheet(false);
              handleRef.current?.focus();
            }
          }}
        >
          <button
            ref={handleRef}
            type="button"
            className="sheet-handle"
            aria-expanded={sheetFull}
            aria-controls="sheet-more"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onClick={handleClick}
          >
            <span className="sheet-grab" aria-hidden="true" />
            <span className="sheet-handle-text">{sheetFull ? t.showLess : t.details}</span>
          </button>
          <div className="sheet-scroll" ref={scrollRef}>
            <div className="sheet-peek" ref={peekRef}>
              <h2 id="routes-title" className="sr-only">
                {t.yourRoutes}
              </h2>
              <div className={`picks${routes.length > 2 ? " is-three" : ""}`} role="radiogroup" aria-label={t.routeOptions} aria-busy={routeState === "loading"}>
                {routeState === "loading" && (
                  <>
                    <div className="pick pick-skel" aria-hidden="true" />
                    <div className="pick pick-skel" aria-hidden="true" />
                    <p className="sr-only" aria-live="polite">
                      {t.finding}
                    </p>
                  </>
                )}
                {routeState === "error" && (
                  <div className="pick-error">
                    <p>{t.routeError}</p>
                    <button type="button" className="btn btn-quiet" onClick={() => setRouteTry((n) => n + 1)}>
                      {t.tryAgain}
                    </button>
                  </div>
                )}
                {routeState === "ok" &&
                  routes.map((r) => {
                    const sel = r.id === activeRouteId;
                    const isGreen = r.label === "green" || r.label === "both";
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        className={`pick${isGreen ? " pick-green" : ""}${sel ? " is-selected" : ""}`}
                        onClick={() => setSelectedRouteId(r.id)}
                        disabled={navOn}
                      >
                        <span className="pick-name">{t.routeName[r.label]}</span>
                        <span className="pick-time">
                          <b>{r.metrics.min} min</b> {fmtNum(r.metrics.km, lang)} km
                        </span>
                        <span className="pick-why">{pickReason(r, greenRoute, fastRoute, lang)}</span>
                      </button>
                    );
                  })}
              </div>

              {routeState === "ok" && activeRoute && !navOn && (
                <button type="button" className="btn btn-go" onClick={startDirections}>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M12 2l7 19-7-4-7 4z" fill="currentColor" />
                  </svg>
                  {t.startDirections}
                </button>
              )}
              {navOn && (
                <p className="go-on" role="status">
                  {t.goOn}
                </p>
              )}
              <p className="peek-proof">
                <b>{t.proofRides(CAMPAIGN.rides, CAMPAIGN.km)}</b>
                {t.proofRange(CAMPAIGN.from, CAMPAIGN.to)}. <span>{t.promise}</span>
              </p>
            </div>

            <div className="sheet-more" id="sheet-more" inert={!sheetFull && !wide}>
              <div className="panel-head">
                <p>
                  {t.tripLine(start.name, end.name, mode === "bike")}
                </p>
              </div>
              {routeState === "ok" && (
                <p className="route-compare" aria-live="polite">
                  {compare ?? t.cmpNone}
                </p>
              )}
              {routeState === "ok" && activeRoute && (
                <div className="route-detail">
                  <h3>{t.routeName[activeRoute.label]}</h3>
                  <p className="route-stats">
                    <span title={activeRoute.metrics.treeSource === "city" ? t.treesTitleCity : t.treesTitleOsm}>
                      <i className="dot dot-tree" aria-hidden="true" /> {t.treesKm(lang === "de" ? fmtNum(activeRoute.metrics.treesPerKm, lang) : String(activeRoute.metrics.treesPerKm))}
                    </span>
                    <span title={t.heatTitle}>
                      <i className="dot dot-heat" aria-hidden="true" /> {activeRoute.metrics.heat.avg === null || activeRoute.metrics.heat.covered < 0.2 ? t.noHeatData : fmtAnomaly(activeRoute.metrics.heat.avg, lang)}
                    </span>
                    {mode === "bike" && (
                      <span title={t.passTitle}>
                        <i className="dot dot-danger" aria-hidden="true" /> {activeRoute.metrics.danger === null ? "..." : t.passCount(activeRoute.metrics.danger)}
                      </span>
                    )}
                  </p>
                  <ul className="route-tips">
                    {routeTips(activeRoute, mode, lang).map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="sheet-privacy">{t.privacy}</p>

              <details className="route-how">
                <summary>{t.howTitle}</summary>
                <p>{t.how1(lang === "de" ? HEAT_WALK_DATES_DE : HEAT_WALK.dates)}</p>
                <p>{t.how2}</p>
                <p>{t.how3}</p>
              </details>

              <div className="also">
                <Link href={href("/play")} className="also-card">
                  <b>{t.playTitle}</b>
                  <span>{t.playText}</span>
                </Link>
                <Link href={href("/measure")} className="also-card">
                  <b>{t.measureTitle}</b>
                  <span>{t.measureText}</span>
                </Link>
              </div>

              <section className="sheet-about" aria-labelledby="about-title">
                <h2 id="about-title">{t.aboutTitle}</h2>
                <p className="tagline">{t.tagline}</p>
                {proof}
              </section>

              <section className={`live is-${liveState}`} aria-labelledby="live-title">
                <div className="live-head">
                  <h2 id="live-title">
                    <i className="live-dot" aria-hidden="true" /> {t.liveTitle}
                  </h2>
                  <p>{t.liveText}</p>
                </div>
                {liveState === "loading" && <p className="live-msg">{t.liveLoading}</p>}
                {liveState === "none" && <p className="live-msg">{t.liveNone}</p>}
                {liveState === "offline" && <p className="live-msg">{t.liveOffline}</p>}
                {(liveState === "ok" || liveState === "stale") && live && (
                  <dl className="live-grid">
                    <div>
                      <dt>{t.temperature}</dt>
                      <dd>{live.temp ?? t.noValue}</dd>
                    </div>
                    <div>
                      <dt>{t.pm10}</dt>
                      <dd>{live.pm10 ?? t.noValue}</dd>
                    </div>
                    <div>
                      <dt>{t.pm25}</dt>
                      <dd>{live.pm25 ?? t.noValue}</dd>
                    </div>
                    <div>
                      <dt>{t.sensorBox}</dt>
                      <dd className="live-box">{live.box}</dd>
                    </div>
                  </dl>
                )}
                {(liveState === "ok" || liveState === "stale") && live?.same && <p className="live-msg">{t.pmSame}</p>}
                <div className="live-foot">
                  <button type="button" className="btn" onClick={fetchLive} disabled={liveState === "loading"}>
                    {t.refresh}
                  </button>
                  {live && (liveState === "ok" || liveState === "stale") && (
                    <span>
                      {liveState === "stale" ? t.staleFrom : t.newestFrom}
                      {live.time}
                    </span>
                  )}
                </div>
              </section>

              <section className="facts" aria-labelledby="facts-title">
                <div className="facts-intro">
                  <h2 id="facts-title">{t.factsTitle}</h2>
                  <p>{t.factsText}</p>
                </div>
                <dl className="facts-grid">
                  <div>
                    <dt>{t.bikeRides}</dt>
                    <dd>{CAMPAIGN.rides}</dd>
                  </div>
                  <div>
                    <dt>{t.kmRidden}</dt>
                    <dd>{CAMPAIGN.km}</dd>
                  </div>
                  <div>
                    <dt>{t.riders}</dt>
                    <dd>{CAMPAIGN.riders}</dd>
                  </div>
                  <div>
                    <dt>{t.enoughData}</dt>
                    <dd>{enoughCount != null ? fmtNum(enoughCount, lang) : dataState === "error" ? t.notLoaded : t.loading}</dd>
                  </div>
                  <div>
                    <dt>{t.measuredPasses}</dt>
                    <dd>{count(data?.meta, "passes", dataState === "error", lang)}</dd>
                  </div>
                  <div>
                    <dt>{t.publicTrees}</dt>
                    <dd>{count(data?.meta, "trees", dataState === "error", lang)}</dd>
                  </div>
                  <div>
                    <dt>{t.heatReadings}</dt>
                    <dd>{fmtNum(HEAT_WALK.points, lang)}</dd>
                  </div>
                  <div>
                    <dt>{t.crashes}</dt>
                    <dd>{count(data?.meta, "crashes", dataState === "error", lang)}</dd>
                  </div>
                </dl>
                {hero && (
                  <p className="facts-hero">
                    <b>{hero.big}</b> {hero.text} {hero.caveat} {rule150(lang)}
                  </p>
                )}
                <p className="facts-source">{t.sourcesLine(SOURCES.map((x) => (lang === "de" && x.nameDe) || x.name).join(", "))}</p>
              </section>

              <section className="more-info" aria-label={t.moreAbout}>
                <details>
                  <summary>{t.whatTitle}</summary>
                  <p>{t.whatText}</p>
                </details>
                <details>
                  <summary>{t.sourcesTitle}</summary>
                  <ul className="sources">
                    {SOURCES.map((x) => (
                      <li key={x.id}>
                        <p>
                          <a href={x.url} target="_blank" rel="noopener noreferrer">
                            <b>{(lang === "de" && x.nameDe) || x.name}</b>
                          </a>
                          {x.count && data && typeof data.meta.counts[x.count] === "number"
                            ? `, ${fmtNum(data.meta.counts[x.count] as number, lang)} ${(lang === "de" && x.countLabelDe) || x.countLabel}`
                            : ""}
                        </p>
                        <p>{(lang === "de" && x.useDe) || x.use}</p>
                        <p className="sources-meta">
                          {(lang === "de" && x.providerDe) || x.provider}. {(lang === "de" && x.dateDe) || x.date}. {t.licence}: {(lang === "de" && x.licenceDe) || x.licence}.
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>{t.coverageTitle}</summary>
                  <p>{t.coverageText}</p>
                </details>
                <details>
                  <summary>{t.limitsTitle}</summary>
                  <p>{t.limitsText}</p>
                </details>
              </section>

              <SiteFooter />
            </div>
          </div>
        </section>
      </div>

      {fair && <FairTour qr={qr} hero={hero} compare={compare} green={greenRoute} fast={fastRoute} onStop={() => setFair(false)} />}
    </div>
  );
}
