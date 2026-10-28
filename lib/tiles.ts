// Base map tiles for both apps, in one place.
// The plan was CARTO Voyager (basemaps.cartocdn.com). On 28 Oct 2026 every
// CARTO raster style returned an "API KEY REQUIRED" tile without a key, and
// this project uses no API keys, so both apps stay on the OpenStreetMap
// standard tiles. Swap here if a keyless tile service is agreed.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const TILE_MAX_ZOOM = 19;
