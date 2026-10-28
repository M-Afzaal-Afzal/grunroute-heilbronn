// Planner pages, grouped by what an officer wants to do. The hint is one
// short line under the name in the side nav.
export const NAV = [
  { href: "/", label: "Overview", group: "Decide", hint: "Start here: what to do today" },
  { href: "/queue", label: "Work queue", group: "Decide", hint: "Next step for every street" },
  { href: "/fix-map", label: "What needs fixing", group: "Decide", hint: "Problems by type, with fixes" },
  { href: "/priorities", label: "Fix first", group: "Decide", hint: "Rank streets by your priorities" },
  { href: "/maps", label: "Heat maps", group: "Explore", hint: "Each measure across the city" },
  { href: "/trees", label: "Shade and trees", group: "Explore", hint: "Shade, planting, species mix" },
  { href: "/live", label: "Live", group: "Explore", hint: "Today's weather and sensors" },
  { href: "/data", label: "Data and missions", group: "Data", hint: "Gaps, missions, sources" },
] as const;

export const NAV_GROUPS = ["Decide", "Explore", "Data"] as const;

export const PEOPLE_APP = "https://grunroute-heilbronn-ebon.vercel.app";
