// Leaflet with the leaflet-rotate plugin. The plugin reads a global L, so set it before the plugin loads.
import L from "leaflet";

if (typeof window !== "undefined") (window as unknown as { L: typeof L }).L = L;

export default L;
