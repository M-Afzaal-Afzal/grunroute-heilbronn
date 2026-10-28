// leaflet-rotate ships no types. These are the parts this app uses.
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    rotateControl?: boolean | object;
  }
  interface MarkerOptions {
    /** Turn the icon with the map, for things that point along the map. */
    rotateWithView?: boolean;
  }
  interface Map {
    /** Turn the map, degrees clockwise from north. */
    setBearing(deg: number): this;
    getBearing(): number;
  }
}
