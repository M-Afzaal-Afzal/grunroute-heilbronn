"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, PEOPLE_APP } from "@/lib/nav";

export function SideNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/priorities" && path.startsWith("/street")));
  return (
    <nav className="pl-side" aria-label="Planner pages">
      <ul>
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="pl-side-foot">
        Screening tool. Final decisions use official city data.
        <br />
        <a href={PEOPLE_APP}>GrünRoute for people</a>
      </p>
    </nav>
  );
}
