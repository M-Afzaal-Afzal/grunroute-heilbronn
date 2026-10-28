"use client";
import { useParams, useSearchParams } from "next/navigation";
import { useActivePreset } from "@/lib/preset";
import { useDossier } from "@/lib/useDossier";
import { StreetReport } from "@/components/street/StreetReport";
import { PrintBar } from "@/components/street/PrintBar";
import { Skeleton } from "@/components/ui/skeleton";

export default function StreetPrintPage() {
  const params = useParams<{ id: string }>();
  const lang = useSearchParams().get("lang") === "en" ? "en" : "de";
  const id = Number(params.id);
  const active = useActivePreset();
  const { data, dossier, notFound, error } = useDossier(id, active.code, false);
  return (
    <>
      <PrintBar lang={lang} back={`/street/${params.id}`} />
      {error && <p role="alert">Could not load the street data: {error}</p>}
      {notFound && <p>There is no street with id {params.id} in this build.</p>}
      {data && dossier ? <StreetReport d={dossier} data={data} active={active} lang={lang} /> : !error && !notFound && <Skeleton label="Loading report" />}
    </>
  );
}
