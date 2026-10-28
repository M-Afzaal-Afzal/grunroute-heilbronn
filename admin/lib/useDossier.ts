"use client";
// Loads and joins everything for one street dossier. Close-pass points are
// read live from the public ATRAI API only when `withPasses` is on.
import { useEffect, useMemo, useState } from "react";
import { usePlannerData, useJson, type PlannerData } from "./data";
import { rankFor } from "./rank";
import { resolvePreset, type ActivePreset } from "./preset";
import { loadCityTrees, type CityTrees } from "./shared/cityTrees";
import { loadDangerPoints } from "./shared/atrai";
import { fmtAnomaly, distToLine, type DangerPoint } from "./shared/geo";
import { bandFor } from "./shared/data";
import type { Street } from "./shared/priority";
import type { StreetMapLayers } from "@/components/street/StreetMap";
import { crashesByYear, crashesNear, heatNear, NEAR, ranksByPreset, schoolsNear, SEVERITY, speciesMix, treesNear, type CrashFile, type SchoolFile } from "./dossier";

const GREY = "#b8c2bd";

export function useCityTrees() {
  const [trees, setTrees] = useState<CityTrees | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadCityTrees().then(
      (t) => live && setTrees(t),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, []);
  return { trees, error };
}

export function useDangerPoints(on: boolean) {
  const [points, setPoints] = useState<DangerPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    loadDangerPoints().then(
      (p) => live && setPoints(p),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [on]);
  return { points, error };
}

/** Everything about one street, computed from already loaded files. */
export function buildDossier(data: PlannerData, street: Street, active: ActivePreset, crashFile: CrashFile | null, schoolFile: SchoolFile | null, trees: CityTrees | null, passes: DangerPoint[] | null) {
  const lines = street.lines;
  const row = rankFor(data, active.preset, active.code, "streets", true).find((r) => r.seg.id === street.id) ?? null;
  const crashes = crashFile ? crashesNear(lines, crashFile.crashes) : null;
  const heat = heatNear(lines);
  const schools = schoolFile ? schoolsNear(lines, schoolFile.schools) : null;
  const treeIds = trees ? treesNear(lines, trees) : null;
  const passNear = passes ? passes.filter((p) => Math.min(...lines.map((l) => distToLine([p.lat, p.lng], l))) <= NEAR.pass) : null;
  const layers: StreetMapLayers = {
    lines,
    color: row?.score != null ? bandFor(row.score).color : GREY,
    crowns: (treeIds ?? []).map((i) => {
      const t = trees!.get(i);
      return { lat: t.lat, lng: t.lng, r: t.crown / 2, title: `${t.name}, crown ${t.crown || "not given"} m` };
    }),
    heat: heat.map((h) => ({ lat: h[0], lng: h[1], warm: h[2] > 0, title: `Heat walk spot ${fmtAnomaly(h[2])}, ${h[4]} readings` })),
    passes: (passNear ?? []).map((p) => ({ lat: p.lat, lng: p.lng, title: `Close pass point, risk ${p.risk.toFixed(2)}` })),
    crashes: (crashes ?? []).map((c) => ({ lat: c.lat, lng: c.lng, category: c.category, title: `${c.year}, ${SEVERITY[c.category - 1] ?? "unknown"}, ${c.bike ? "bike" : ""}${c.bike && c.foot ? " and " : ""}${c.foot ? "on foot" : ""}` })),
    schools: (schools ?? []).map((s) => ({ lat: s.lat, lng: s.lng, title: `${s.name ?? "Unnamed"} (${s.type}), ${Math.round(s.d)} m` })),
  };
  return {
    street,
    row,
    ranks: ranksByPreset(data, street),
    crashes,
    crashYears: crashFile && crashes ? crashesByYear(crashes, crashFile.years) : null,
    crashSource: crashFile?.source ?? null,
    heat,
    schools,
    treeIds,
    species: trees && treeIds ? speciesMix(treeIds, trees) : null,
    passNear,
    layers,
  };
}
export type Dossier = ReturnType<typeof buildDossier>;

export function useDossier(id: number, presetCode: string, withPasses: boolean) {
  const { data, error } = usePlannerData();
  const crashFile = useJson<CrashFile>("/data/crashes.json");
  const schoolFile = useJson<SchoolFile>("/data/schools.json");
  const trees = useCityTrees();
  const passes = useDangerPoints(withPasses);
  const street = data?.streetById.get(id) ?? null;
  const dossier = useMemo(
    () => (data && street ? buildDossier(data, street, resolvePreset(presetCode), crashFile.data, schoolFile.data, trees.trees, passes.points) : null),
    [data, street, presetCode, crashFile.data, schoolFile.data, trees.trees, passes.points],
  );
  return {
    data,
    dossier,
    notFound: !!data && !street,
    error,
    treeError: trees.error,
    passError: passes.error,
    schoolSource: schoolFile.data?.source ?? null,
  };
}
