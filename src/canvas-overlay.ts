import type { AxisConfig, ChartLayout, LegendConfig, LegendPosition } from "./types.ts";
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
// Draw legend
// ============================================================
export function drawLegend(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	items: { label: string; color: string }[],
	config?: LegendConfig,
): void {
	if (config?.visible === false) return;

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

		// Swatch
		ctx.fillStyle = item.color;
		ctx.fillRect(x, startY, swatchSize, swatchSize);

		// Label
		ctx.fillStyle = textColor;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillText(item.label, x + swatchSize + swatchGap, startY);

		x += itemWidths[i]!;
	}
}
