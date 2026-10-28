// Every dataset the app uses, in one place. The "All data sources in detail"
// section and the reports render from this list. Counts are not typed in here,
// they come from the built data (public/data/segments.json meta), keyed by `count`.
//
// Data rule: only data from the organisers, partners, and the open sources the
// organiser resources page lists (hackathon.greencity.hn/resources): OpenData
// Heilbronn, GovData, MobiData BW, DWD, Bright Sky, and Overpass (OpenStreetMap).
// Nothing is invented. Missing data stays missing.

export type Source = {
  id: string;
  name: string;
  provider: string;
  url: string;
  licence: string;
  date: string;
  use: string;
  /** Key into segments.json meta.counts, shown as "N <countLabel>" next to the source. */
  count?: string;
  countLabel?: string;
};

const ATRAI_PROVIDER = "ATRAI bike sensor campaign Heilbronn, hackathon organisers";
const ATRAI_LICENCE = "Hackathon material, no licence stated by the provider";
const ATRAI_DATE = "5 Dec 2025 to 26 Oct 2026";

export const SOURCES: Source[] = [
  {
    id: "atrai-overtaking",
    name: "ATRAI overtaking_distance_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/overtaking_distance_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Close passes per street: average passing gap in cm and how many passes were under 150 cm.",
    count: "overtaking",
    countLabel: "street segments",
  },
  {
    id: "atrai-pm",
    name: "ATRAI danger_zones_PM_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/danger_zones_PM_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Danger plus dust index per point, averaged per street segment within 20 m.",
    count: "pmPoints",
    countLabel: "points",
  },
  {
    id: "atrai-bumpy",
    name: "ATRAI bumpy_roads_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/bumpy_roads_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Road roughness per street segment.",
    count: "bumpy",
    countLabel: "street segments",
  },
  {
    id: "atrai-flow",
    name: "ATRAI traffic_flow_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/traffic_flow_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Stop and go for bikes: 1 minus the flow index, where a flow near 0 means stop and go.",
    count: "flow",
    countLabel: "street segments",
  },
  {
    id: "atrai-speed",
    name: "ATRAI speed_map_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/speed_map_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Average bike speed per street segment. Shown for context only, not scored.",
    count: "speed",
    countLabel: "street segments",
  },
  {
    id: "atrai-danger",
    name: "ATRAI danger_zones_heilbronn",
    provider: ATRAI_PROVIDER,
    url: "https://api.atrai.bike/collections/danger_zones_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Close pass points, read live in the browser for the map layer and to compare routes. Not part of the score.",
  },
  {
    id: "opensensemap",
    name: "openSenseMap boxes near Heilbronn",
    provider: "openSenseMap",
    url: "https://api.opensensemap.org/boxes/",
    licence: "Public open data, see openSenseMap terms",
    date: "Read live when the page opens",
    use: "The sensor snapshot only. A single live value never changes a street score.",
  },
  {
    id: "heat-walks",
    name: "Heat walks, Heat Island Summer School 2026",
    provider: "Heat Island Summer School, hackathon material share",
    url: "https://cloud.reedu.de/s/X9x2XE9a9xCxLm8",
    licence: "Hackathon material, no licence stated by the provider",
    date: "1 to 3 Sep 2026",
    use: "Hot spots: how much warmer a spot was than the rest of the same walk, joined to streets within 60 m.",
    count: "heatCells",
    countLabel: "heat walk spots",
  },
  {
    id: "baumkataster",
    name: "Baumkataster (tree register)",
    provider: "Stadt Heilbronn, OpenData Heilbronn",
    url: "https://opendata.heilbronn.de/dataset/baumkataster",
    licence: "dl-de/by-2-0, attribution Stadt Heilbronn",
    date: "Stand 1 Jan 2026",
    use: "Trees per 100 m and a crown cover estimate within 15 m of each street segment. Public trees only.",
    count: "trees",
    countLabel: "public trees",
  },
  {
    id: "districts",
    name: "Stadtteilgrenzen and Stadtkreisgrenze",
    provider: "Stadt Heilbronn, OpenData Heilbronn",
    url: "https://opendata.heilbronn.de/dataset/stadtteilgrenzen-stadtkreisgrenze-der-stadt-heilbronn",
    licence: "dl-de/by-2-0, attribution Stadt Heilbronn",
    date: "Stand 1 Jan 2026",
    use: "City boundary to keep only Heilbronn streets, and the district of each street.",
    count: "districts",
    countLabel: "districts",
  },
  {
    id: "unfallatlas",
    name: "Unfallatlas, injury crashes 2021 to 2025",
    provider: "Statistische Ämter des Bundes und der Länder, listed on GovData",
    url: "https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/",
    licence: "dl-de/by-2-0, attribution Statistische Ämter des Bundes und der Länder",
    date: "2021 to 2025",
    use: "Police recorded crashes with injuries that involved a bike or a person on foot, within 25 m of a street. Killed counts 3, seriously injured 2, slightly injured 1.",
    count: "crashes",
    countLabel: "crashes in Heilbronn",
  },
  {
    id: "osm-schools",
    name: "Schools and kindergartens (OpenStreetMap via Overpass)",
    provider: "OpenStreetMap contributors",
    url: "https://overpass-api.de/",
    licence: "ODbL, attribution OpenStreetMap contributors",
    date: "Read 28 Oct 2026",
    use: "School zone: a street within 300 m of a school or kindergarten.",
    count: "schools",
    countLabel: "schools and kindergartens",
  },
  {
    id: "osm-trees",
    name: "OpenStreetMap trees and drinking water",
    provider: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/",
    licence: "ODbL, attribution OpenStreetMap contributors",
    date: "Read 27 Oct 2026",
    use: "Drinking water points on the map. Mapped trees only if the city register cannot load.",
  },
  {
    id: "osrm",
    name: "OSRM routing on OpenStreetMap",
    provider: "FOSSGIS, routing.openstreetmap.de",
    url: "https://routing.openstreetmap.de/",
    licence: "Routes on ODbL data, OpenStreetMap contributors",
    date: "Live when you plan a trip",
    use: "Bike and foot routes in the For people view.",
  },
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
