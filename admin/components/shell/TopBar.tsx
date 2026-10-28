"use client";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { DATA_BUILT } from "@/lib/shared/build-info";
import { useActivePreset } from "@/lib/preset";
import { PEOPLE_APP } from "@/lib/nav";

export function TopBar() {
  const active = useActivePreset();
  return (
    <header className="pl-top">
      <Link href="/" className="wordmark" aria-label="GrünRoute Planner, overview">
        <LogoMark size={28} title="" />
        <span className="wordmark-text">
          <b>GrünRoute</b>
        </span>
      </Link>
      <span className="pl-app">Planner</span>
      <div className="pl-meta">
        <span className="pl-hide-narrow">
          Data built <b>{DATA_BUILT ?? "unknown"}</b>
        </span>
        <span className="pl-hide-narrow">
          Preset <b>{active.label}</b>
        </span>
        <a href={PEOPLE_APP}>People app</a>
      </div>
    </header>
  );
}
