import type {
	AxisConfig,
	ChartLayout,
	LegendConfig,
	LegendHitRect,
	LegendPosition,
	SharedAxes,
} from "./types.ts";
import { formatTick } from "./utils.ts";

const DEFAULT_FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TITLE_FONT = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const DEFAULT_AXIS_COLOR = "#666666";
const DEFAULT_LABEL_COLOR = "#333333";
const DEFAULT_TITLE_COLOR = "#222222";
const DEFAULT_LEGEND_COLOR = "#333333";

// ============================================================
// Draw axes (lines + ticks + labels + titles) on a 2D canvas
// ============================================================
export function drawAxes(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	xTicks: { labels: string[]; positions: number[] } | null,
	yTicks: { values: number[]; positions: number[] } | null,
	xAxis?: AxisConfig,
	yAxis?: AxisConfig,
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;

	const axisColor = xAxis?.lineColor ?? yAxis?.lineColor ?? DEFAULT_AXIS_COLOR;
	const xLabelColor = xAxis?.labelColor ?? DEFAULT_LABEL_COLOR;
	const yLabelColor = yAxis?.labelColor ?? DEFAULT_LABEL_COLOR;

	ctx.strokeStyle = axisColor;
	ctx.lineWidth = 1;

	// X axis line
	ctx.beginPath();
	ctx.moveTo(plotX, plotY + plotHeight);
	ctx.lineTo(plotX + plotWidth, plotY + plotHeight);
	ctx.stroke();

	// Y axis line
	ctx.beginPath();
	ctx.moveTo(plotX, plotY);
	ctx.lineTo(plotX, plotY + plotHeight);
	ctx.stroke();

	// Grid lines (light)
	ctx.strokeStyle = "#e0e0e0";
	ctx.lineWidth = 0.5;

	// Y grid + labels
	if (yTicks) {
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = yLabelColor;
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		for (let i = 0; i < yTicks.values.length; i++) {
			const y = yTicks.positions[i]!;
			const v = yTicks.values[i]!;
			// Grid
			ctx.beginPath();
			ctx.moveTo(plotX, y);
			ctx.lineTo(plotX + plotWidth, y);
			ctx.stroke();
			// Label
			ctx.fillText(formatTick(v), plotX - 8, y);
		}
	}

	// X labels
	if (xTicks) {
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = xLabelColor;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		for (let i = 0; i < xTicks.labels.length; i++) {
			const x = xTicks.positions[i]!;
			const label = xTicks.labels[i]!;
			ctx.fillText(label, x, plotY + plotHeight + 8, plotWidth / xTicks.labels.length - 4);
		}
	}

	// X axis title
	if (xAxis?.title) {
		ctx.font = TITLE_FONT;
		ctx.fillStyle = xAxis.titleColor ?? DEFAULT_TITLE_COLOR;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(xAxis.title, plotX + plotWidth / 2, plotY + plotHeight + 28);
	}

	// Y axis title
	if (yAxis?.title) {
		ctx.save();
		ctx.font = TITLE_FONT;
		ctx.fillStyle = yAxis.titleColor ?? DEFAULT_TITLE_COLOR;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.translate(16, plotY + plotHeight / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(yAxis.title, 0, 0);
		ctx.restore();
	}
}

// ============================================================
// Draw axes for horizontal bar charts (swapped axes)
// ============================================================
export function drawAxesHorizontal(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	categoryLabels: { labels: string[]; positions: number[] } | null,
	valueTicks: { values: number[]; positions: number[] } | null,
	xAxis?: AxisConfig,
	yAxis?: AxisConfig,
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;

	const axisColor = xAxis?.lineColor ?? yAxis?.lineColor ?? DEFAULT_AXIS_COLOR;
	const xLabelColor = xAxis?.labelColor ?? DEFAULT_LABEL_COLOR;
	const yLabelColor = yAxis?.labelColor ?? DEFAULT_LABEL_COLOR;

	ctx.strokeStyle = axisColor;
	ctx.lineWidth = 1;

	// X axis line (bottom)
	ctx.beginPath();
	ctx.moveTo(plotX, plotY + plotHeight);
	ctx.lineTo(plotX + plotWidth, plotY + plotHeight);
	ctx.stroke();

	// Y axis line (left)
	ctx.beginPath();
	ctx.moveTo(plotX, plotY);
	ctx.lineTo(plotX, plotY + plotHeight);
	ctx.stroke();

	// Grid lines + value labels on X axis
	ctx.strokeStyle = "#e0e0e0";
	ctx.lineWidth = 0.5;

	if (valueTicks) {
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = xLabelColor;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		for (let i = 0; i < valueTicks.values.length; i++) {
			const x = valueTicks.positions[i]!;
			const v = valueTicks.values[i]!;
			ctx.beginPath();
			ctx.moveTo(x, plotY);
			ctx.lineTo(x, plotY + plotHeight);
			ctx.stroke();
			ctx.fillText(formatTick(v), x, plotY + plotHeight + 8);
		}
	}

	// Category labels on Y axis
	if (categoryLabels) {
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = yLabelColor;
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		for (let i = 0; i < categoryLabels.labels.length; i++) {
			const y = categoryLabels.positions[i]!;
			const label = categoryLabels.labels[i]!;
			ctx.fillText(label, plotX - 8, y, plotX - 20);
		}
	}

	// X axis title (values)
	if (xAxis?.title) {
		ctx.font = TITLE_FONT;
		ctx.fillStyle = xAxis.titleColor ?? DEFAULT_TITLE_COLOR;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(xAxis.title, plotX + plotWidth / 2, plotY + plotHeight + 28);
	}

	// Y axis title (categories)
	if (yAxis?.title) {
		ctx.save();
		ctx.font = TITLE_FONT;
		ctx.fillStyle = yAxis.titleColor ?? DEFAULT_TITLE_COLOR;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.translate(16, plotY + plotHeight / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(yAxis.title, 0, 0);
		ctx.restore();
	}
}

// ============================================================
// Draw composite (dual-axis) chart axes
// ============================================================
/**
 * Draws axes for a composite chart.
 *
 * - Primary Y-axis is always on the left, primary X-axis always on the bottom.
 * - When `sharedAxes === "x"`: secondary Y-axis drawn on the right.
 * - When `sharedAxes === "y"`: secondary X-axis drawn on the top.
 * - When `sharedAxes === "both"`: only primary axes are drawn.
 */
export function drawCompositeAxes(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	sharedAxes: SharedAxes,
	primaryXTicks: { labels: string[]; positions: number[] } | null,
	primaryYTicks: { values: number[]; positions: number[] } | null,
	secondaryXTicks: { labels: string[]; positions: number[] } | null,
	secondaryYTicks: { values: number[]; positions: number[] } | null,
	xAxis?: AxisConfig,
	yAxis?: AxisConfig,
	xAxisSecondary?: AxisConfig,
	yAxisSecondary?: AxisConfig,
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;

	// ---- Primary axes (left + bottom) ----
	drawAxes(ctx, layout, primaryXTicks, primaryYTicks, xAxis, yAxis);

	// ---- Secondary Y axis on the right (when X is shared) ----
	if (sharedAxes === "x" && secondaryYTicks) {
		const rightX = plotX + plotWidth;
		const axisColor = yAxisSecondary?.lineColor ?? DEFAULT_AXIS_COLOR;
		const labelColor = yAxisSecondary?.labelColor ?? DEFAULT_LABEL_COLOR;

		// Axis line
		ctx.strokeStyle = axisColor;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(rightX, plotY);
		ctx.lineTo(rightX, plotY + plotHeight);
		ctx.stroke();

		// Tick labels
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = labelColor;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		for (let i = 0; i < secondaryYTicks.values.length; i++) {
			const y = secondaryYTicks.positions[i]!;
			const v = secondaryYTicks.values[i]!;
			ctx.fillText(formatTick(v), rightX + 8, y);
		}

		// Title (right side, rotated)
		if (yAxisSecondary?.title) {
			ctx.save();
			ctx.font = TITLE_FONT;
			ctx.fillStyle = yAxisSecondary.titleColor ?? DEFAULT_TITLE_COLOR;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.translate(rightX + 45, plotY + plotHeight / 2);
			ctx.rotate(-Math.PI / 2);
			ctx.fillText(yAxisSecondary.title, 0, 0);
			ctx.restore();
		}
	}

	// ---- Secondary X axis on the top (when Y is shared) ----
	if (sharedAxes === "y" && secondaryXTicks) {
		const topY = plotY;
		const axisColor = xAxisSecondary?.lineColor ?? DEFAULT_AXIS_COLOR;
		const labelColor = xAxisSecondary?.labelColor ?? DEFAULT_LABEL_COLOR;

		// Axis line
		ctx.strokeStyle = axisColor;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(plotX, topY);
		ctx.lineTo(plotX + plotWidth, topY);
		ctx.stroke();

		// Tick labels
		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = labelColor;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		for (let i = 0; i < secondaryXTicks.labels.length; i++) {
			const x = secondaryXTicks.positions[i]!;
			const label = secondaryXTicks.labels[i]!;
			ctx.fillText(label, x, topY - 8, plotWidth / secondaryXTicks.labels.length - 4);
		}

		// Title (top)
		if (xAxisSecondary?.title) {
			ctx.font = TITLE_FONT;
			ctx.fillStyle = xAxisSecondary.titleColor ?? DEFAULT_TITLE_COLOR;
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillText(xAxisSecondary.title, plotX + plotWidth / 2, topY - 28);
		}
	}
}

// ============================================================
// Draw legend
// ============================================================
export function drawLegend(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	items: { label: string; color: string }[],
	config?: LegendConfig,
	hiddenSeries?: ReadonlySet<number>,
): LegendHitRect[] {
	const hitRects: LegendHitRect[] = [];
	if (config?.visible === false) return hitRects;

	const position: LegendPosition = config?.position ?? "bottom";
	const textColor = config?.textColor ?? DEFAULT_LEGEND_COLOR;
	const fontSize = config?.fontSize ?? 12;

	ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

	// Compute legend dimensions
	const itemPadding = 20;
	const swatchSize = 12;
	const swatchGap = 4;
	let totalWidth = 0;
	const itemWidths: number[] = [];
	for (const item of items) {
		const w = swatchSize + swatchGap + ctx.measureText(item.label).width + itemPadding;
		itemWidths.push(w);
		totalWidth += w;
	}

	let startX: number;
	let startY: number;

	if (typeof position === "object" && position.type === "float") {
		startX = position.x;
		startY = position.y;
	} else if (position === "top") {
		startX = layout.plotX + (layout.plotWidth - totalWidth) / 2;
		startY = 6;
	} else {
		// bottom
		startX = layout.plotX + (layout.plotWidth - totalWidth) / 2;
		startY = layout.canvasHeight - fontSize - 8;
	}

	let x = startX;
	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		const hidden = hiddenSeries?.has(i) ?? false;
		const itemW = itemWidths[i]!;

		// Record hit rect for click detection
		hitRects.push({
			x,
			y: startY - 2,
			w: itemW - itemPadding / 2,
			h: Math.max(swatchSize, fontSize) + 4,
			seriesIdx: i,
		});

		// Swatch
		ctx.globalAlpha = hidden ? 0.3 : 1.0;
		ctx.fillStyle = item.color;
		ctx.fillRect(x, startY, swatchSize, swatchSize);

		if (hidden) {
			// Draw diagonal line through swatch to indicate hidden
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, startY);
			ctx.lineTo(x + swatchSize, startY + swatchSize);
			ctx.stroke();
		}

		// Label
		ctx.fillStyle = hidden ? "#aaaaaa" : textColor;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillText(item.label, x + swatchSize + swatchGap, startY);

		// Strikethrough for hidden labels
		if (hidden) {
			const textW = ctx.measureText(item.label).width;
			const lineY = startY + fontSize / 2;
			ctx.strokeStyle = "#aaaaaa";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x + swatchSize + swatchGap, lineY);
			ctx.lineTo(x + swatchSize + swatchGap + textW, lineY);
			ctx.stroke();
		}

		ctx.globalAlpha = 1.0;
		x += itemW;
	}

	return hitRects;
}
