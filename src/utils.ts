import type { AxisConfig, ChartLayout } from "./types.ts";

/**
 * Compute "nice" tick values for an axis.
 */
export function computeTicks(
	dataMin: number,
	dataMax: number,
	axis?: AxisConfig,
	tickCountHint = 6,
): { min: number; max: number; ticks: number[] } {
	let min = axis?.min ?? dataMin;
	let max = axis?.max ?? dataMax;
	const count = axis?.tickCount ?? tickCountHint;

	// Ensure there is a range
	if (min === max) {
		min = min - 1;
		max = max + 1;
	}

	// "Nice" step
	const range = max - min;
	const rawStep = range / count;
	const mag = 10 ** Math.floor(Math.log10(rawStep));
	const residual = rawStep / mag;
	let niceStep: number;
	if (residual <= 1.5) niceStep = 1 * mag;
	else if (residual <= 3) niceStep = 2 * mag;
	else if (residual <= 7) niceStep = 5 * mag;
	else niceStep = 10 * mag;

	if (axis?.min == null) {
		min = Math.floor(min / niceStep) * niceStep;
	}
	if (axis?.max == null) {
		max = Math.ceil(max / niceStep) * niceStep;
	}

	const ticks: number[] = [];
	for (let v = min; v <= max + niceStep * 0.0001; v += niceStep) {
		ticks.push(Math.round(v * 1e10) / 1e10); // avoid float artefacts
	}

	return { min, max, ticks };
}

/**
 * Format a tick value for display.
 */
export function formatTick(v: number): string {
	if (Number.isInteger(v)) return v.toString();
	if (Math.abs(v) >= 1) return v.toFixed(1);
	return v.toPrecision(3);
}

/**
 * Compute chart layout (plot area) from canvas size + padding + axis titles.
 */
export function computeLayout(
	width: number,
	height: number,
	padding?: [number, number, number, number],
	hasXTitle = false,
	hasYTitle = false,
	legendHeight = 0,
	legendPosition: "top" | "bottom" | "float" = "bottom",
): ChartLayout {
	const [pt, pr, pb, pl] = padding ?? [20, 20, 20, 20];

	// Reserve space for axis labels & titles
	const yLabelWidth = 50 + (hasYTitle ? 20 : 0);
	const xLabelHeight = 30 + (hasXTitle ? 20 : 0);

	let topExtra = 0;
	let bottomExtra = 0;
	if (legendPosition === "top") topExtra = legendHeight;
	else if (legendPosition === "bottom") bottomExtra = legendHeight;

	const plotX = pl + yLabelWidth;
	const plotY = pt + topExtra;
	const plotWidth = width - plotX - pr;
	const plotHeight = height - plotY - pb - xLabelHeight - bottomExtra;

	return {
		canvasWidth: width,
		canvasHeight: height,
		plotX,
		plotY,
		plotWidth: Math.max(plotWidth, 10),
		plotHeight: Math.max(plotHeight, 10),
	};
}

/**
 * Map a data value to pixel position within the plot area.
 */
export function mapValue(
	value: number,
	dataMin: number,
	dataMax: number,
	pixelStart: number,
	pixelLength: number,
): number {
	const ratio = (value - dataMin) / (dataMax - dataMin || 1);
	return pixelStart + ratio * pixelLength;
}
