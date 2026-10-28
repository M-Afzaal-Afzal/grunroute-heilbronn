// Species mix per district from the tree register, against the 10-20-30
// rule of thumb (Santamour): no species over 10%, no genus over 20%, no
// family over 30% of the trees. A rule of thumb, not a city rule.
import type { CityTrees } from "./cityTrees";

// Genus to plant family, for the genera common in German street tree lists.
// Genera not listed here count as "family not mapped".
const FAMILY: Record<string, string> = {
  Acer: "Sapindaceae", Aesculus: "Sapindaceae", Koelreuteria: "Sapindaceae",
  Tilia: "Malvaceae",
  Quercus: "Fagaceae", Fagus: "Fagaceae", Castanea: "Fagaceae",
  Carpinus: "Betulaceae", Betula: "Betulaceae", Alnus: "Betulaceae", Corylus: "Betulaceae", Ostrya: "Betulaceae",
  Platanus: "Platanaceae",
  Fraxinus: "Oleaceae",
  Prunus: "Rosaceae", Malus: "Rosaceae", Pyrus: "Rosaceae", Sorbus: "Rosaceae", Crataegus: "Rosaceae", Amelanchier: "Rosaceae", Mal: "Rosaceae",
  Robinia: "Fabaceae", Gleditsia: "Fabaceae", Sophora: "Fabaceae", Styphnolobium: "Fabaceae", Gymnocladus: "Fabaceae", Cercis: "Fabaceae", Laburnum: "Fabaceae",
  Salix: "Salicaceae", Populus: "Salicaceae",
  Ulmus: "Ulmaceae", Zelkova: "Ulmaceae", Celtis: "Cannabaceae",
  Pinus: "Pinaceae", Picea: "Pinaceae", Abies: "Pinaceae", Larix: "Pinaceae",
  Taxus: "Taxaceae",
  Thuja: "Cupressaceae", Chamaecyparis: "Cupressaceae", Metasequoia: "Cupressaceae", Sequoiadendron: "Cupressaceae", Juniperus: "Cupressaceae",
  Juglans: "Juglandaceae", Liquidambar: "Altingiaceae", Ginkgo: "Ginkgoaceae",
  Liriodendron: "Magnoliaceae", Magnolia: "Magnoliaceae", Catalpa: "Bignoniaceae", Paulownia: "Paulowniaceae",
  Ailanthus: "Simaroubaceae", Parrotia: "Hamamelidaceae", Morus: "Moraceae", Ilex: "Aquifoliaceae", Cornus: "Cornaceae",
};
export const RULE = { species: 0.1, genus: 0.2, family: 0.3 } as const;

export type Top = { name: string; share: number };
export type DistrictMix = { district: string; trees: number; known: number; species: Top; genus: Top; family: Top; unmapped: number; over: number };

// Group rows ("Reinbestand", "Mischbestand") have no single species.
const isGroup = (latin: string) => !latin || /bestand/i.test(latin);
const genusOf = (latin: string) => latin.split(/[\s.-]/)[0];

function top(counts: Map<string, number>, total: number): Top {
  let best = ["", 0] as [string, number];
  for (const e of counts) if (e[1] > best[1]) best = e;
  return { name: best[0], share: total ? best[1] / total : 0 };
}
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** `label` maps a register district to the name used for grouping (default: as is). */
export function speciesByDistrict(trees: Pick<CityTrees, "count" | "get">, label: (d: string) => string | null = (d) => d): DistrictMix[] {
  const by = new Map<string, { n: number; sp: Map<string, number>; ge: Map<string, number>; fa: Map<string, number>; known: number; unmapped: number }>();
  for (let i = 0; i < trees.count; i++) {
    const t = trees.get(i);
    const d = label(t.district) || "No district";
    let g = by.get(d);
    if (!g) by.set(d, (g = { n: 0, sp: new Map(), ge: new Map(), fa: new Map(), known: 0, unmapped: 0 }));
    g.n++;
    if (isGroup(t.latin)) continue;
    g.known++;
    const genus = genusOf(t.latin);
    // Species is genus plus epithet, cultivars count with their species.
    // Hybrids keep the epithet after the x ("Platanus x hispanica").
    const words = t.latin.split(/\s+/);
    const sp = words.slice(0, /^[x×]$/i.test(words[1] ?? "") ? 3 : 2).join(" ");
    if (!/\bspec\.?$|\bsp\.?$|\bsp[.-]/i.test(sp) && sp.includes(" ")) bump(g.sp, sp);
    bump(g.ge, genus);
    const fam = FAMILY[genus];
    if (fam) bump(g.fa, fam);
    else g.unmapped++;
  }
  return [...by]
    .map(([district, g]) => {
      const species = top(g.sp, g.known), genus = top(g.ge, g.known), family = top(g.fa, g.known);
      const over = Number(species.share > RULE.species) + Number(genus.share > RULE.genus) + Number(family.share > RULE.family);
      return { district, trees: g.n, known: g.known, species, genus, family, unmapped: g.unmapped, over };
    })
    .sort((a, b) => b.trees - a.trees);
}
