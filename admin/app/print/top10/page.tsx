"use client";
// Top 10 report: one A4 page per street, same content as the street print.
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { resolvePreset, useActivePreset } from "@/lib/preset";
import { usePlannerData, useJson } from "@/lib/data";
import { rankFor, listable, isStreet } from "@/lib/rank";
import { buildDossier, useCityTrees } from "@/lib/useDossier";
import type { CrashFile, SchoolFile } from "@/lib/dossier";
import { StreetReport } from "@/components/street/StreetReport";
import { PrintBar } from "@/components/street/PrintBar";
import { Skeleton } from "@/components/ui/skeleton";

function Top10() {
  const lang = useSearchParams().get("lang") === "en" ? "en" : "de";
  const active = useActivePreset();
  const { data, error } = usePlannerData();
  const crashes = useJson<CrashFile>("/data/crashes.json");
  const schools = useJson<SchoolFile>("/data/schools.json");
  const { trees } = useCityTrees();
  const code = active.code;
  const pages = useMemo(() => {
    if (!data || !crashes.data || !schools.data || !trees) return null;
    const act = resolvePreset(code);
    return listable(rankFor(data, act.preset, code, "streets", true))
      .slice(0, 10)
      .map((r) => r.seg)
      .filter(isStreet)
      .map((s) => buildDossier(data, s, act, crashes.data, schools.data, trees, null));
  }, [data, code, crashes.data, schools.data, trees]);

  return (
    <>
      <PrintBar lang={lang} back="/" note={`${active.label}, ${lang === "de" ? "eine Seite je Straße" : "one page per street"}`} />
      {error && <p role="alert">Could not load the street data: {error}</p>}
      {pages && data ? pages.map((d, i) => <StreetReport key={d.street.id} d={d} data={data} active={active} lang={lang} place={`${i + 1} / ${pages.length}`} />) : <Skeleton label="Loading report" />}
    </>
  );
}

export default function Top10Page() {
  return (
    <Suspense fallback={<Skeleton label="Loading report" />}>
      <Top10 />
    </Suspense>
  );
}
