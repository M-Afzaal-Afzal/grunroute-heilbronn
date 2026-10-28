// Colours for data. Fix score bands come from lib/shared/data.ts BANDS.
// Heat maps use viridis, a colour-blind safe sequential ramp. #C2410C is kept
// for heat walk spots only.
export const HEAT_DOT = "#C2410C";
export const VIRIDIS = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

/** t in 0..1 to a viridis colour (8 steps). */
export const ramp = (t: number, colors: string[] = VIRIDIS) => colors[Math.max(0, Math.min(colors.length - 1, Math.floor(t * colors.length)))];
