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
  /** German text for the people app on /de. Links stay as they are. */
  nameDe?: string;
  providerDe?: string;
  useDe?: string;
  dateDe?: string;
  licenceDe?: string;
  countLabelDe?: string;
};

const ATRAI_PROVIDER = "ATRAI bike sensor campaign Heilbronn, hackathon organisers";
const ATRAI_PROVIDER_DE = "ATRAI Rad-Sensorkampagne Heilbronn, Veranstalter des Hackathons";
const ATRAI_LICENCE = "Hackathon material, no licence stated by the provider";
const ATRAI_DATE = "5 Dec 2025 to 26 Oct 2026";
const ATRAI_LICENCE_DE = "Hackathon-Material, keine Lizenz vom Anbieter angegeben";
const ATRAI_DATE_DE = "5. Dez. 2025 bis 26. Okt. 2026";
const SEGMENTS_DE = "Straßenabschnitte";
const DL_HN_DE = "dl-de/by-2-0, Namensnennung Stadt Heilbronn";
const ODBL_DE = "ODbL, Namensnennung OpenStreetMap-Mitwirkende";
const LIVE_OPEN_DE = "Live gelesen beim Öffnen der Seite";

export const SOURCES: Source[] = [
  {
    id: "atrai-overtaking",
    name: "ATRAI overtaking_distance_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/overtaking_distance_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Close passes per street: average passing gap in cm and how many passes were under 150 cm.",
    count: "overtaking",
    countLabel: "street segments",
    useDe: "Enge Überholungen pro Straße: mittlerer Überholabstand in cm und wie viele Überholungen unter 150 cm lagen.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: SEGMENTS_DE,
  },
  {
    id: "atrai-pm",
    name: "ATRAI danger_zones_PM_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/danger_zones_PM_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Danger plus dust index per point, averaged per street segment within 20 m.",
    count: "pmPoints",
    countLabel: "points",
    useDe: "Gefahr- und Staubindex pro Punkt, gemittelt pro Straßenabschnitt im Umkreis von 20 m.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: "Punkte",
  },
  {
    id: "atrai-bumpy",
    name: "ATRAI bumpy_roads_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/bumpy_roads_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Road roughness per street segment.",
    count: "bumpy",
    countLabel: "street segments",
    useDe: "Rauheit des Belags pro Straßenabschnitt.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: SEGMENTS_DE,
  },
  {
    id: "atrai-flow",
    name: "ATRAI traffic_flow_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/traffic_flow_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Stop and go for bikes: 1 minus the flow index, where a flow near 0 means stop and go.",
    count: "flow",
    countLabel: "street segments",
    useDe: "Stop-and-go für Räder: 1 minus der Verkehrsfluss-Index, ein Fluss nahe 0 heißt Stop-and-go.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: SEGMENTS_DE,
  },
  {
    id: "atrai-speed",
    name: "ATRAI speed_map_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/speed_map_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Average bike speed per street segment. Shown for context only, not scored.",
    count: "speed",
    countLabel: "street segments",
    useDe: "Mittleres Radtempo pro Straßenabschnitt. Nur zur Einordnung, nicht bewertet.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: SEGMENTS_DE,
  },
  {
    id: "atrai-danger",
    name: "ATRAI danger_zones_heilbronn",
    provider: ATRAI_PROVIDER,
    providerDe: ATRAI_PROVIDER_DE,
    url: "https://api.atrai.bike/collections/danger_zones_heilbronn/items",
    licence: ATRAI_LICENCE,
    date: ATRAI_DATE,
    use: "Close pass points, read live in the browser for the map layer and to compare routes. Not part of the score.",
    useDe: "Punkte mit enger Überholung, live im Browser gelesen für die Kartenebene und den Routenvergleich. Nicht Teil der Bewertung.",
    dateDe: ATRAI_DATE_DE,
    licenceDe: ATRAI_LICENCE_DE,
  },
  {
    id: "opensensemap",
    name: "openSenseMap boxes near Heilbronn",
    nameDe: "openSenseMap-Boxen bei Heilbronn",
    provider: "openSenseMap",
    url: "https://api.opensensemap.org/boxes/",
    licence: "Public open data, see openSenseMap terms",
    date: "Read live when the page opens",
    use: "The sensor snapshot only. A single live value never changes a street score.",
    useDe: "Nur für die Sensor-Momentaufnahme. Ein einzelner Live-Wert ändert nie die Bewertung einer Straße.",
    dateDe: LIVE_OPEN_DE,
    licenceDe: "Öffentliche offene Daten, siehe Nutzungsbedingungen von openSenseMap",
  },
  {
    id: "heat-walks",
    name: "Heat walks, Heat Island Summer School 2026",
    nameDe: "Hitze-Rundgänge, Heat Island Summer School 2026",
    provider: "Heat Island Summer School, hackathon material share",
    providerDe: "Heat Island Summer School, Material des Hackathons",
    url: "https://cloud.reedu.de/s/X9x2XE9a9xCxLm8",
    licence: "Hackathon material, no licence stated by the provider",
    date: "1 to 3 Sep 2026",
    use: "Hot spots: how much warmer a spot was than the rest of the same walk, joined to streets within 60 m.",
    count: "heatCells",
    countLabel: "heat walk spots",
    useDe: "Hitze-Spots: wie viel wärmer ein Ort war als der Rest desselben Rundgangs, Straßen im Umkreis von 60 m zugeordnet.",
    dateDe: "1. bis 3. Sep. 2026",
    licenceDe: ATRAI_LICENCE_DE,
    countLabelDe: "Hitze-Spots",
  },
  {
    id: "baumkataster",
    name: "Baumkataster (tree register)",
    nameDe: "Baumkataster",
    provider: "Stadt Heilbronn, OpenData Heilbronn",
    url: "https://opendata.heilbronn.de/dataset/baumkataster",
    licence: "dl-de/by-2-0, attribution Stadt Heilbronn",
    date: "Stand 1 Jan 2026",
    use: "Trees per 100 m and a crown cover estimate within 15 m of each street segment. Public trees only.",
    count: "trees",
    countLabel: "public trees",
    useDe: "Bäume pro 100 m und eine geschätzte Kronenbedeckung im Umkreis von 15 m um jeden Straßenabschnitt. Nur öffentliche Bäume.",
    dateDe: "Stand 1. Jan. 2026",
    licenceDe: DL_HN_DE,
    countLabelDe: "öffentliche Bäume",
  },
  {
    id: "districts",
    name: "Stadtteilgrenzen and Stadtkreisgrenze",
    nameDe: "Stadtteilgrenzen und Stadtkreisgrenze",
    provider: "Stadt Heilbronn, OpenData Heilbronn",
    url: "https://opendata.heilbronn.de/dataset/stadtteilgrenzen-stadtkreisgrenze-der-stadt-heilbronn",
    licence: "dl-de/by-2-0, attribution Stadt Heilbronn",
    date: "Stand 1 Jan 2026",
    use: "City boundary to keep only Heilbronn streets, and the district of each street.",
    count: "districts",
    countLabel: "districts",
    useDe: "Stadtgrenze, damit nur Heilbronner Straßen bleiben, und der Stadtteil jeder Straße.",
    dateDe: "Stand 1. Jan. 2026",
    licenceDe: DL_HN_DE,
    countLabelDe: "Stadtteile",
  },
  {
    id: "unfallatlas",
    name: "Unfallatlas, injury crashes 2021 to 2025",
    nameDe: "Unfallatlas, Unfälle mit Verletzten 2021 bis 2025",
    provider: "Statistische Ämter des Bundes und der Länder, listed on GovData",
    providerDe: "Statistische Ämter des Bundes und der Länder, gelistet auf GovData",
    url: "https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/",
    licence: "dl-de/by-2-0, attribution Statistische Ämter des Bundes und der Länder",
    date: "2021 to 2025",
    use: "Police recorded crashes with injuries that involved a bike or a person on foot, within 25 m of a street. Killed counts 3, seriously injured 2, slightly injured 1.",
    count: "crashes",
    countLabel: "crashes in Heilbronn",
    useDe: "Von der Polizei erfasste Unfälle mit Verletzten, an denen ein Rad oder eine Person zu Fuß beteiligt war, im Umkreis von 25 m um eine Straße. Getötet zählt 3, schwer verletzt 2, leicht verletzt 1.",
    dateDe: "2021 bis 2025",
    licenceDe: "dl-de/by-2-0, Namensnennung Statistische Ämter des Bundes und der Länder",
    countLabelDe: "Unfälle in Heilbronn",
  },
  {
    id: "osm-schools",
    name: "Schools and kindergartens (OpenStreetMap via Overpass)",
    nameDe: "Schulen und Kitas (OpenStreetMap über Overpass)",
    provider: "OpenStreetMap contributors",
    providerDe: "OpenStreetMap-Beitragende",
    url: "https://overpass-api.de/",
    licence: "ODbL, attribution OpenStreetMap contributors",
    date: "Read 28 Oct 2026",
    use: "School zone: a street within 300 m of a school or kindergarten.",
    count: "schools",
    countLabel: "schools and kindergartens",
    useDe: "Schulzone: eine Straße im Umkreis von 300 m um eine Schule oder Kita.",
    dateDe: "Gelesen am 28. Okt. 2026",
    licenceDe: ODBL_DE,
    countLabelDe: "Schulen und Kitas",
  },
  {
    id: "osm-buildings",
    name: "Building outlines and heights, Kernstadt (OpenStreetMap via Overpass)",
    nameDe: "Gebäudeumrisse und Höhen, Kernstadt (OpenStreetMap über Overpass)",
    provider: "OpenStreetMap contributors",
    providerDe: "OpenStreetMap-Beitragende",
    url: "https://overpass-api.de/",
    licence: "ODbL, attribution OpenStreetMap contributors",
    date: "Read 28 Oct 2026, OSM data as of 1 Jun 2026 (mirror overpass.private.coffee)",
    use: "Shade estimate for 21 July at 9, 12, 15 and 18 h: height tag, else levels x 3 m, else 9 m. Feeds the little shade measure in the Kernstadt.",
    useDe: "Schattenschätzung für den 21. Juli um 9, 12, 15 und 18 Uhr: Höhenangabe, sonst Geschosse x 3 m, sonst 9 m. Fließt in das Maß Wenig Schatten in der Kernstadt ein.",
    dateDe: "Gelesen am 28. Okt. 2026, OSM-Daten mit Stand 1. Jun. 2026 (Mirror overpass.private.coffee)",
    licenceDe: ODBL_DE,
  },
  {
    id: "osm-trees",
    name: "OpenStreetMap trees and drinking water",
    nameDe: "OpenStreetMap-Bäume und Trinkwasser",
    provider: "OpenStreetMap contributors",
    providerDe: "OpenStreetMap-Beitragende",
    url: "https://www.openstreetmap.org/",
    licence: "ODbL, attribution OpenStreetMap contributors",
    date: "Read 27 Oct 2026",
    use: "Drinking water points on the map. Mapped trees only if the city register cannot load.",
    useDe: "Trinkwasser-Punkte auf der Karte. Kartierte Bäume nur, wenn das Baumkataster nicht lädt.",
    dateDe: "Gelesen am 27. Okt. 2026",
    licenceDe: ODBL_DE,
  },
  {
    id: "osrm",
    name: "OSRM routing on OpenStreetMap",
    nameDe: "OSRM-Routing auf OpenStreetMap",
    provider: "FOSSGIS, routing.openstreetmap.de",
    url: "https://routing.openstreetmap.de/",
    licence: "Routes on ODbL data, OpenStreetMap contributors",
    date: "Live when you plan a trip",
    use: "Bike and foot routes, and the turn by turn steps for live directions.",
    useDe: "Rad- und Fußrouten sowie die Abbiegehinweise für die Navigation.",
    dateDe: "Live, wenn du eine Route planst",
    licenceDe: "Routen auf ODbL-Daten, OpenStreetMap-Mitwirkende",
  },
  {
    id: "nominatim",
    name: "Nominatim place search on OpenStreetMap",
    nameDe: "Nominatim-Ortssuche auf OpenStreetMap",
    provider: "OpenStreetMap Foundation, nominatim.openstreetmap.org",
    url: "https://nominatim.org/release-docs/latest/api/Search/",
    licence: "ODbL, OpenStreetMap contributors",
    date: "Live when you search for a place",
    use: "Turns a typed address or place name into a start or end point. Only the typed text is sent, on a tap of Search.",
    useDe: "Macht aus einer eingegebenen Adresse oder einem Ortsnamen einen Start- oder Zielpunkt. Nur der eingegebene Text wird gesendet, nach einem Tipp auf Suchen.",
    dateDe: "Live, wenn du nach einem Ort suchst",
    licenceDe: "ODbL, OpenStreetMap-Mitwirkende",
  },
  {
    id: "dwd-brightsky",
    name: "DWD weather observations via Bright Sky",
    nameDe: "DWD-Wetterdaten über Bright Sky",
    provider: "Deutscher Wetterdienst, served by Bright Sky (brightsky.dev)",
    providerDe: "Deutscher Wetterdienst, bereitgestellt von Bright Sky (brightsky.dev)",
    url: "https://brightsky.dev/",
    licence: "DWD terms of use apply, source: Deutscher Wetterdienst",
    date: "Read live when the page opens",
    use: "Planner Live page: today's temperature and the hot day flag. Station 15547 has no temperature in Bright Sky, so 03734 Obersulm-Willsbach is used.",
    useDe: "Live-Seite im Planner: die Temperatur von heute und der Hinweis auf einen heißen Tag. Station 15547 hat in Bright Sky keine Temperatur, daher wird 03734 Obersulm-Willsbach genutzt.",
    dateDe: LIVE_OPEN_DE,
    licenceDe: "Nutzungsbedingungen des DWD gelten, Quelle: Deutscher Wetterdienst",
  },
  {
    id: "uba-air",
    name: "UBA air quality stations DEBW015 and DEBW152",
    nameDe: "UBA-Luftmessstationen DEBW015 und DEBW152",
    provider: "Umweltbundesamt",
    url: "https://www.umweltbundesamt.de/en/data/air/air-data",
    licence: "UBA terms of use",
    date: "Linked only, not read",
    use: "Planner Live page links to the official values. The API blocks browser calls, so no values are shown.",
    useDe: "Die Live-Seite im Planner verlinkt die offiziellen Werte. Die API blockiert Aufrufe aus dem Browser, daher werden keine Werte gezeigt.",
    dateDe: "Nur verlinkt, nicht gelesen",
    licenceDe: "Nutzungsbedingungen des UBA",
  },
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
