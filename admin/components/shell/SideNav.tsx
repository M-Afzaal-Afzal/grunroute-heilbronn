"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_GROUPS, PEOPLE_APP } from "@/lib/nav";

export function SideNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/queue" && path.startsWith("/street")));
  return (
    <nav className="pl-side" aria-label="Planner pages">
      {NAV_GROUPS.map((g) => (
        <div key={g} className="pl-side-group">
          <p className="pl-side-head" id={`nav-${g}`}>
            {g}
          </p>
          <ul aria-labelledby={`nav-${g}`}>
            {NAV.filter((n) => n.group === g).map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}>
                  <span className="pl-side-label">{n.label}</span>
                  <span className="pl-side-hint">{n.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="pl-side-foot">
        Screening tool. Final decisions use official city data.
        <br />
        <a href={PEOPLE_APP}>GrünRoute for people</a>
      </p>
    </nav>
  );
}
