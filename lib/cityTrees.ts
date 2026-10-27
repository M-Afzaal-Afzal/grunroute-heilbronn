import { distM, distToLine, type LatLng } from "./geo";

// Official tree register of Stadt Heilbronn (Baumkataster, Stand 01.01.2026).
// All public trees: city trees and some trees of other public bodies.
// Built from the city shapefile by scripts/build-trees.mjs and loaded on demand.
// Licence dl-de/by-2-0, attribution "Stadt Heilbronn".
//
// Caveats from the city readme, keep them in the UI:
// - "Baumgruppe" rows are groups of similar trees; trunk size is the sum of all trunks.
// - Trees of other bodies (Stadtwerke, waterways office) often carry a default
//   crown of 2 m, even when the real crown is much bigger.

export const TREE_SOURCE = "Stadt Heilbronn, Baumkataster, Stand 01.01.2026 (dl-de/by-2-0)";

type Raw = {
  count: number;
  base: [number, number];
  species: string[];
  streets: string[];
  districts: string[];
  types: string[];
  lat: number[];
  lng: number[];
  sp: number[];
  st: number[];
  di: number[];
  ty: number[];
  crown: number[];
  trunk: number[];
};

export type CityTree = {
  i: number;
  lat: number;
  lng: number;
  name: string; // German name
  latin: string;
  street: string;
  district: string;
  type: string; // Laubbaum, Nadelbaum, Obstbaum, Baumgruppe
  crown: number; // crown diameter in m, 0 if unknown
  trunk: number; // trunk circumference in cm, 0 if unknown
};

const CELL_LAT = 0.001; // about 111 m
const CELL_LNG = 0.0015; // about 109 m at Heilbronn

export class CityTrees {
  readonly count: number;
  readonly lat: Float64Array;
  readonly lng: Float64Array;
  readonly crown: Float32Array;
  readonly typeIdx: Uint8Array;
  private raw: Raw;
  private grid = new Map<number, number[]>();
  private streetIdx = new Map<string, number[]>();

  constructor(raw: Raw) {
    this.raw = raw;
    this.count = raw.lat.length;
    this.lat = new Float64Array(this.count);
    this.lng = new Float64Array(this.count);
    this.crown = new Float32Array(raw.crown);
    this.typeIdx = new Uint8Array(raw.ty);
    let la = 0;
    for (let i = 0; i < this.count; i++) {
      la += raw.lat[i];
      this.lat[i] = raw.base[0] + la / 1e5;
      this.lng[i] = raw.base[1] + raw.lng[i] / 1e5;
      const k = this.key(this.lat[i], this.lng[i]);
      const cell = this.grid.get(k);
      if (cell) cell.push(i);
      else this.grid.set(k, [i]);
      const s = raw.streets[raw.st[i]];
      const list = this.streetIdx.get(s);
      if (list) list.push(i);
      else this.streetIdx.set(s, [i]);
    }
  }

  private key(lat: number, lng: number) {
    return Math.floor(lat / CELL_LAT) * 100000 + Math.floor(lng / CELL_LNG);
  }

  typeName(i: number) {
    return this.raw.types[this.typeIdx[i]] || "";
  }

  get(i: number): CityTree {
    const r = this.raw;
    const [name, latin] = (r.species[r.sp[i]] || "|").split("|");
    return {
      i,
      lat: this.lat[i],
      lng: this.lng[i],
      name: name || "Unknown species",
      latin: latin || "",
      street: r.streets[r.st[i]] || "",
      district: r.districts[r.di[i]] || "",
      type: r.types[r.ty[i]] || "",
      crown: r.crown[i],
      trunk: r.trunk[i],
    };
  }

  /** Tree indices inside a lat/lng box. */
  inBox(s: number, w: number, n: number, e: number): number[] {
    const out: number[] = [];
    const r0 = Math.floor(s / CELL_LAT), r1 = Math.floor(n / CELL_LAT);
    const c0 = Math.floor(w / CELL_LNG), c1 = Math.floor(e / CELL_LNG);
    if ((r1 - r0 + 1) * (c1 - c0 + 1) > 40000) return out; // too wide, caller should not ask
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.grid.get(r * 100000 + c);
        if (!cell) continue;
        for (const i of cell) {
          const la = this.lat[i], lo = this.lng[i];
          if (la >= s && la <= n && lo >= w && lo <= e) out.push(i);
        }
      }
    }
    return out;
  }

  near(lat: number, lng: number, r: number): number[] {
    const dLat = r / 111_200, dLng = r / 72_860;
    return this.inBox(lat - dLat, lng - dLng, lat + dLat, lng + dLng).filter((i) => distM([lat, lng], [this.lat[i], this.lng[i]]) <= r);
  }

  /** Trees within r metres of a line. */
  nearLine(line: LatLng[], r: number): number[] {
    if (!line.length) return [];
    let s = 90, n = -90, w = 180, e = -180;
    for (const [la, lo] of line) {
      s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
    }
    const dLat = r / 111_200, dLng = r / 72_860;
    return this.inBox(s - dLat, w - dLng, n + dLat, e + dLng).filter((i) => distToLine([this.lat[i], this.lng[i]], line) <= r);
  }

  /** The tree whose crown or tap circle contains the point, closest first. */
  hit(lat: number, lng: number, tapM: number): number | null {
    let best: number | null = null;
    let bestScore = Infinity;
    for (const i of this.near(lat, lng, Math.max(tapM, 26))) {
      const d = distM([lat, lng], [this.lat[i], this.lng[i]]);
      const reach = Math.max(tapM, this.crown[i] / 2);
      if (d <= reach && d - reach < bestScore) {
        bestScore = d - reach;
        best = i;
      }
    }
    return best;
  }

  /** Summary for a list of trees: count, big crowns, top species. */
  summary(ids: number[]) {
    const sp = new Map<string, number>();
    let big = 0;
    const crowns: number[] = [];
    for (const i of ids) {
      const t = this.get(i);
      sp.set(t.name, (sp.get(t.name) || 0) + 1);
      if (this.crown[i] >= 8) big++;
      if (this.crown[i] > 0) crowns.push(this.crown[i]);
    }
    crowns.sort((a, b) => a - b);
    const top = [...sp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return { count: ids.length, big, medianCrown: crowns.length ? crowns[Math.floor(crowns.length / 2)] : null, top };
  }

  /** All register trees filed under a street name (the whole street, not one segment). */
  byStreet(name: string): number[] {
    const variants = [name, name.replace("ß", "ss"), name.replace("ss", "ß")];
    for (const v of variants) {
      const ids = this.streetIdx.get(v);
      if (ids) return ids;
    }
    return [];
  }
}

let cache: Promise<CityTrees> | null = null;

export function loadCityTrees(): Promise<CityTrees> {
  if (!cache) {
    cache = fetch("/data/baumkataster.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Raw>;
      })
      .then((raw) => new CityTrees(raw))
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}
