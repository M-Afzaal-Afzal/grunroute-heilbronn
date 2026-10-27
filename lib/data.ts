export type Street = {
  rank: number;
  name: string;
  area: string;
  score: number;
  reason: string;
  fix: string;
  fixType: "trees" | "bike" | "calming" | "pavement";
  support: string;
  weak: boolean;
  dateRange: string;
  season: string;
  points: string;
  detail: string;
  coords: [number, number][];
  color: string;
  heat: boolean;
  dust: boolean;
  close: boolean;
};

// Real ATRAI sample, checked 27 Oct 2026 from api.atrai.bike.
// Source: overtaking_distance_heilbronn, first 100 segments checked.
// Values below are aggregated by exact street name from those segments only.
// Fix score formula, documented in the app: score = round(100 - average
// overtaking distance in cm / 2). A smaller passing distance gives a higher
// score, so the closest passes rank first. This ranking uses overtaking
// distance only. Heat, dust, and roughness were not joined to these streets
// in this build, so they do not change the score.
// Geometries are the real LineString coordinates from the ATRAI segment
// shown for each street, converted from [lng, lat] to [lat, lng].
export const STREETS: Street[] = [
  {
    rank: 1,
    name: "Bergstraße",
    area: "South centre",
    score: 83,
    reason: "Cars pass very close, average 34 cm in the ATRAI sample",
    fix: "Protected bike lane and wider passing space",
    fixType: "bike",
    support: "Low",
    weak: true,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "1 overtaking point",
    detail: "1 ATRAI overtaking segment, average 34 cm, ATRAI segment id 516",
    coords: [[49.1381473, 9.2167825], [49.1383794, 9.2167583]],
    color: "#b42318",
    heat: false,
    dust: false,
    close: true,
  },
  {
    rank: 2,
    name: "Salzstraße",
    area: "North Heilbronn",
    score: 61,
    reason: "Cars pass close, average 77 cm in the ATRAI sample",
    fix: "Wider protected lane, keep the cycle lane clear",
    fixType: "bike",
    support: "High",
    weak: false,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "23 overtaking points",
    detail: "5 ATRAI overtaking segments, average 77 cm, ATRAI segment ids 150, 152, 154, 155, 173",
    coords: [[49.1662696, 9.2163514], [49.1665647, 9.2163812], [49.1692007, 9.2166702], [49.1693255, 9.2166815]],
    color: "#ca8a04",
    heat: false,
    dust: false,
    close: true,
  },
  {
    rank: 3,
    name: "Kranenstraße",
    area: "City centre",
    score: 58,
    reason: "Cars pass close, average 83 cm in the ATRAI sample",
    fix: "Traffic calming and a protected bike lane",
    fixType: "calming",
    support: "Medium",
    weak: false,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "3 overtaking points",
    detail: "2 ATRAI overtaking segments, average 83 cm, ATRAI segment ids 409, 483",
    coords: [[49.1430724, 9.2146657], [49.1428555, 9.214648]],
    color: "#ca8a04",
    heat: false,
    dust: false,
    close: true,
  },
  {
    rank: 4,
    name: "Badstraße",
    area: "South centre",
    score: 58,
    reason: "Cars pass close, average 84 cm in the ATRAI sample",
    fix: "Protected bike lane and clearer road markings",
    fixType: "bike",
    support: "High",
    weak: false,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "10 overtaking points",
    detail: "4 ATRAI overtaking segments, average 84 cm, ATRAI segment ids 130, 137, 199, 408",
    coords: [[49.1392289, 9.2128314], [49.1395887, 9.2132103], [49.1399895, 9.2135822], [49.1400676, 9.2136558]],
    color: "#ca8a04",
    heat: false,
    dust: false,
    close: true,
  },
  {
    rank: 5,
    name: "Saarlandstraße",
    area: "North Heilbronn, Peter-Bruckmann-Brücke",
    score: 46,
    reason: "Cars pass at average 108 cm in the ATRAI sample",
    fix: "Keep the bike route clear and check the bridge section",
    fixType: "calming",
    support: "High",
    weak: false,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "11 overtaking points",
    detail: "1 ATRAI overtaking segment, average 108 cm, ATRAI segment id 18",
    coords: [[49.1521243, 9.2021067], [49.1521142, 9.2022287], [49.1520654, 9.2026443], [49.1517122, 9.2063735], [49.1516945, 9.2064894], [49.1516608, 9.2066214], [49.1515977, 9.2068051], [49.1515757, 9.2068724], [49.1514895, 9.2071421], [49.1514576, 9.2072652], [49.1514411, 9.207329]],
    color: "#2e9e5b",
    heat: false,
    dust: false,
    close: true,
  },
  {
    rank: 6,
    name: "Bahnhofstraße",
    area: "Near the station",
    score: 31,
    reason: "Cars pass at average 139 cm in the ATRAI sample",
    fix: "Keep the route clear near the station, check at peak times",
    fixType: "bike",
    support: "Low",
    weak: true,
    dateRange: "ATRAI overtaking sample",
    season: "Sample only, not split by season",
    points: "1 overtaking point",
    detail: "1 ATRAI overtaking segment, average 139 cm, ATRAI segment id 531",
    coords: [[49.14223, 9.2082528], [49.1422753, 9.2082931], [49.1423082, 9.2083288], [49.1423492, 9.2083832], [49.1423842, 9.2084482], [49.1425423, 9.2089501], [49.1426252, 9.2092155], [49.142658, 9.2093152], [49.1426846, 9.2094036], [49.1426981, 9.2094749], [49.1427023, 9.2095251], [49.142706, 9.2097914], [49.1427045, 9.209917]],
    color: "#2e9e5b",
    heat: false,
    dust: false,
    close: true,
  },
];

export type PlaceKey = "station" | "marktplatz" | "experimenta" | "campus" | "theresienwiese" | "wollhaus";

export const PLACES: Record<PlaceKey, { name: string; lat: number; lng: number }> = {
  station: { name: "Hauptbahnhof, Main Station", lat: 49.1439, lng: 9.2078 },
  marktplatz: { name: "Marktplatz and Town Hall", lat: 49.1427, lng: 9.2190 },
  experimenta: { name: "Experimenta", lat: 49.1445, lng: 9.2152 },
  campus: { name: "Bildungscampus and University", lat: 49.1488, lng: 9.2165 },
  theresienwiese: { name: "Theresienwiese", lat: 49.1368, lng: 9.2025 },
  wollhaus: { name: "Wollhaus", lat: 49.1402, lng: 9.2205 },
};

export const CENTER: [number, number] = [49.1427, 9.2109];
