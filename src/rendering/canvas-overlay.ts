import type {
	AxisConfig,
	ChartLayout,
	LegendConfig,
	LegendHitRect,
	LegendPosition,
	SharedAxes,
	TimelineAxisConfig,
	TimelineColumnWidths,
	TimelineLabelConfig,
	TimelineUnit,
} from "../types.ts";
import { formatTick } from "../utils.ts";

const FONT_FAMILY =
	'"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Helvetica Neue", "Segoe UI", "Yu Gothic UI", "Yu Gothic", sans-serif';

const DEFAULT_FONT = `12px ${FONT_FAMILY}`;
const TITLE_FONT = `13px ${FONT_FAMILY}`;

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

// ============================================================
// Draw timeline chart axes (X-axis on top, Y-axis as table)
// ============================================================

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"] as const;
const HEADER_HEIGHT = 24;

/**
 * Apply a simple time format string to a Date.
 * Supports: YYYY, MM, DD, HH, mm, ss
 */
function applyTimeFormat(d: Date, fmt: string): string {
	return fmt
		.replace("YYYY", String(d.getFullYear()))
		.replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
		.replace("DD", String(d.getDate()).padStart(2, "0"))
		.replace("HH", String(d.getHours()).padStart(2, "0"))
		.replace("mm", String(d.getMinutes()).padStart(2, "0"))
		.replace("ss", String(d.getSeconds()).padStart(2, "0"));
}

/**
 * Compute nice time ticks for the "time" unit.
 */
function computeTimeTicks(minT: number, maxT: number, maxTicks: number): number[] {
	const range = maxT - minT;
	const candidates = [
		1000, 5000, 10000, 15000, 30000, 60000, 300000, 600000, 900000, 1800000, 3600000, 7200000,
		10800000, 14400000, 21600000, 43200000, 86400000,
	];
	let interval = candidates[candidates.length - 1]!;
	for (const c of candidates) {
		if (range / c <= maxTicks) {
			interval = c;
			break;
		}
	}
	const ticks: number[] = [];
	const start = Math.ceil(minT / interval) * interval;
	for (let t = start; t <= maxT; t += interval) {
		ticks.push(t);
	}
	return ticks;
}

/** Resolve effective column widths array from config */
export function resolveColumnWidths(
	labelConfig?: TimelineLabelConfig,
	columnWidths?: TimelineColumnWidths,
): { name: string; width: number }[] {
	const cols: { name: string; width: number }[] = [
		{ name: "タスク名", width: columnWidths?.label ?? 100 },
	];
	if (labelConfig?.showStart) {
		cols.push({ name: "開始", width: columnWidths?.start ?? 70 });
	}
	if (labelConfig?.showEnd) {
		cols.push({ name: "終了", width: columnWidths?.end ?? 70 });
	}
	if (labelConfig?.showProgress) {
		cols.push({ name: "進捗", width: columnWidths?.progress ?? 50 });
	}
	return cols;
}

/** Total table width from columns */
export function totalTableWidth(columns: { width: number }[]): number {
	let w = 0;
	for (const c of columns) w += c.width;
	return w;
}

/**
 * Draw timeline axes.
 *
 * X-axis labels are drawn at the TOP of the plot area.
 * Y-axis is drawn as a table with column headers.
 */
export function drawTimelineAxes(
	ctx: CanvasRenderingContext2D,
	layout: ChartLayout,
	minTime: number,
	maxTime: number,
	unit: TimelineUnit,
	itemLabels: string[],
	xAxis?: TimelineAxisConfig,
	timeFormat?: string,
	labelConfig?: TimelineLabelConfig,
	items?: { start: Date; end: Date; progress?: number }[],
	columns?: { name: string; width: number }[],
	xHeaderHeight?: number,
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;
	const axisColor = xAxis?.lineColor ?? DEFAULT_AXIS_COLOR;
	const labelColor = xAxis?.labelColor ?? DEFAULT_LABEL_COLOR;
	const headerH = xHeaderHeight ?? 0;
	const cols = columns ?? resolveColumnWidths(labelConfig);
	const tableW = totalTableWidth(cols);

	// ---- Y-axis table header ----
	const headerY = plotY;
	ctx.fillStyle = "#f5f5f5";
	ctx.fillRect(0, headerY, plotX, HEADER_HEIGHT);
	ctx.strokeStyle = axisColor;
	ctx.lineWidth = 1;
	ctx.strokeRect(0, headerY, plotX, HEADER_HEIGHT);

	// Column header texts & vertical separators
	let colX = plotX - tableW;
	ctx.font = TITLE_FONT;
	ctx.fillStyle = DEFAULT_TITLE_COLOR;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (const col of cols) {
		ctx.fillText(col.name, colX + col.width / 2, headerY + HEADER_HEIGHT / 2, col.width - 4);
		colX += col.width;
		// Vertical separator
		ctx.strokeStyle = axisColor;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(colX, headerY);
		ctx.lineTo(colX, headerY + HEADER_HEIGHT);
		ctx.stroke();
	}

	// ---- Y-axis table body ----
	const dataTop = plotY + HEADER_HEIGHT;
	const dataHeight = plotHeight - HEADER_HEIGHT;
	const rowHeight = itemLabels.length > 0 ? dataHeight / itemLabels.length : dataHeight;
	const fmt = labelConfig?.timeFormat ?? timeFormat ?? "MM/DD";

	for (let i = 0; i < itemLabels.length; i++) {
		const cy = dataTop + (i + 0.5) * rowHeight;
		const rowTop = dataTop + i * rowHeight;

		// Alternating row background
		if (i % 2 === 1) {
			ctx.fillStyle = "rgba(0,0,0,0.03)";
			ctx.fillRect(0, rowTop, plotX, rowHeight);
		}

		// Row data
		colX = plotX - tableW;
		let colIdx = 0;
		for (const col of cols) {
			ctx.font = DEFAULT_FONT;
			ctx.fillStyle = labelColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			let text = "";
			if (colIdx === 0) {
				text = itemLabels[i]!;
			} else if (col.name === "開始" && items?.[i]) {
				text = applyTimeFormat(items[i]!.start, fmt);
			} else if (col.name === "終了" && items?.[i]) {
				text = applyTimeFormat(items[i]!.end, fmt);
			} else if (col.name === "進捗" && items?.[i] && items[i]!.progress != null) {
				text = `${Math.round(items[i]!.progress! * 100)}%`;
			}

			ctx.fillText(text, colX + col.width / 2, cy, col.width - 6);
			colX += col.width;
			colIdx++;
		}

		// Row separator (horizontal line)
		ctx.strokeStyle = "#e0e0e0";
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(0, rowTop + rowHeight);
		ctx.lineTo(plotX + plotWidth, rowTop + rowHeight);
		ctx.stroke();

		// Column vertical separators in body
		colX = plotX - tableW;
		for (const col of cols) {
			colX += col.width;
			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(colX, rowTop);
			ctx.lineTo(colX, rowTop + rowHeight);
			ctx.stroke();
		}
	}

	// ---- Axis lines ----
	ctx.strokeStyle = axisColor;
	ctx.lineWidth = 1;

	// Top X axis line (at bottom of header area)
	ctx.beginPath();
	ctx.moveTo(plotX, dataTop);
	ctx.lineTo(plotX + plotWidth, dataTop);
	ctx.stroke();

	// Bottom border line
	ctx.beginPath();
	ctx.moveTo(plotX, dataTop + dataHeight);
	ctx.lineTo(plotX + plotWidth, dataTop + dataHeight);
	ctx.stroke();

	// Left Y axis line
	ctx.beginPath();
	ctx.moveTo(plotX, plotY);
	ctx.lineTo(plotX, dataTop + dataHeight);
	ctx.stroke();

	// Right border
	ctx.beginPath();
	ctx.moveTo(plotX + plotWidth, plotY);
	ctx.lineTo(plotX + plotWidth, dataTop + dataHeight);
	ctx.stroke();

	// ---- X-axis ticks at top ----
	const timeToX = (t: number) => plotX + ((t - minTime) / (maxTime - minTime || 1)) * plotWidth;

	if (unit === "time") {
		const tickFormat = timeFormat ?? "HH:mm";
		const maxTicks = Math.max(4, Math.floor(plotWidth / 80));
		const ticks = computeTimeTicks(minTime, maxTime, maxTicks);

		ctx.font = DEFAULT_FONT;
		ctx.fillStyle = labelColor;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		for (const t of ticks) {
			const x = timeToX(t);
			const d = new Date(t);
			ctx.fillText(applyTimeFormat(d, tickFormat), x, plotY - 4);
			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(x, dataTop);
			ctx.lineTo(x, dataTop + dataHeight);
			ctx.stroke();
		}
		if (xAxis?.title) {
			ctx.font = TITLE_FONT;
			ctx.fillStyle = xAxis.titleColor ?? DEFAULT_TITLE_COLOR;
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillText(xAxis.title, plotX + plotWidth / 2, plotY - 22);
		}
	} else if (unit === "day") {
		// 3-tier at top: row1=YYYY年MM月, row2=DD, row3=曜日
		const startDate = new Date(minTime);
		const endDate = new Date(maxTime);
		startDate.setHours(0, 0, 0, 0);

		const days: Date[] = [];
		const d = new Date(startDate);
		while (d.getTime() <= endDate.getTime()) {
			days.push(new Date(d));
			d.setDate(d.getDate() + 1);
		}
		if (days.length === 0) return;

		const dayWidth = plotWidth / days.length;

		for (let i = 0; i < days.length; i++) {
			const day = days[i]!;
			const x = plotX + i * dayWidth;
			const cx = x + dayWidth / 2;
			const dow = day.getDay();

			// Vertical grid in data area
			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(x, dataTop);
			ctx.lineTo(x, dataTop + dataHeight);
			ctx.stroke();

			// Row 2 (middle): DD — positioned in the header
			ctx.font = DEFAULT_FONT;
			ctx.fillStyle = labelColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillText(String(day.getDate()), cx, plotY - 2);

			// Row 3 (bottom): 曜日 — inside the header row
			const wdColor = dow === 0 ? "#e15759" : dow === 6 ? "#4e79a7" : labelColor;
			ctx.fillStyle = wdColor;
			ctx.textBaseline = "middle";
			ctx.fillText(WEEKDAY_JP[dow]!, cx, plotY + HEADER_HEIGHT / 2);
		}

		// Row 1 (top): YYYY年MM月 grouped
		let prevMonth = -1;
		let monthStart = 0;
		for (let i = 0; i <= days.length; i++) {
			const mon = i < days.length ? days[i]!.getMonth() : -2;
			const yr = i < days.length ? days[i]!.getFullYear() : -2;
			const key = yr * 100 + mon;
			if (key !== prevMonth && prevMonth !== -1) {
				const x0 = plotX + monthStart * dayWidth;
				const x1 = plotX + i * dayWidth;
				const prevDay = days[monthStart]!;
				const label = `${prevDay.getFullYear()}年${String(prevDay.getMonth() + 1).padStart(2, "0")}月`;

				ctx.font = TITLE_FONT;
				ctx.fillStyle = DEFAULT_TITLE_COLOR;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillText(label, (x0 + x1) / 2, plotY - 18);

				if (i < days.length) {
					ctx.strokeStyle = axisColor;
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.moveTo(x1, plotY - headerH);
					ctx.lineTo(x1, plotY);
					ctx.stroke();
				}
				monthStart = i;
			}
			if (prevMonth === -1) prevMonth = key;
			if (key !== prevMonth) {
				monthStart = i;
				prevMonth = key;
			}
		}
	} else if (unit === "week") {
		// 2-tier at top: row1=YYYY年MM月, row2=W{n}
		const startDate = new Date(minTime);
		const endDate = new Date(maxTime);
		const startDay = new Date(startDate);
		startDay.setHours(0, 0, 0, 0);
		const dayOfWeek = startDay.getDay();
		startDay.setDate(startDay.getDate() - ((dayOfWeek + 6) % 7));

		const weeks: Date[] = [];
		const w = new Date(startDay);
		while (w.getTime() <= endDate.getTime()) {
			weeks.push(new Date(w));
			w.setDate(w.getDate() + 7);
		}
		if (weeks.length === 0) return;

		const totalDays = (endDate.getTime() - startDay.getTime()) / (24 * 3600 * 1000);
		const pxPerDay = plotWidth / (totalDays || 1);

		for (let i = 0; i < weeks.length; i++) {
			const weekStart = weeks[i]!;
			const x =
				plotX + ((weekStart.getTime() - startDay.getTime()) / (24 * 3600 * 1000)) * pxPerDay;
			const nextX =
				i + 1 < weeks.length
					? plotX + ((weeks[i + 1]!.getTime() - startDay.getTime()) / (24 * 3600 * 1000)) * pxPerDay
					: plotX + plotWidth;

			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(x, dataTop);
			ctx.lineTo(x, dataTop + dataHeight);
			ctx.stroke();

			const wn = getISOWeekNumber(weekStart);
			ctx.font = DEFAULT_FONT;
			ctx.fillStyle = labelColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(`W${wn}`, (x + nextX) / 2, plotY + HEADER_HEIGHT / 2);
		}

		// Top row
		let prevMonth = -1;
		let monthStartX = plotX;
		for (let i = 0; i <= weeks.length; i++) {
			const mon = i < weeks.length ? weeks[i]!.getMonth() : -2;
			const yr = i < weeks.length ? weeks[i]!.getFullYear() : -2;
			const key = yr * 100 + mon;

			if (key !== prevMonth && prevMonth !== -1) {
				const currentX =
					i < weeks.length
						? plotX + ((weeks[i]!.getTime() - startDay.getTime()) / (24 * 3600 * 1000)) * pxPerDay
						: plotX + plotWidth;
				const prevWeek = weeks[i - 1]!;
				const label = `${prevWeek.getFullYear()}年${String(prevWeek.getMonth() + 1).padStart(2, "0")}月`;

				ctx.font = TITLE_FONT;
				ctx.fillStyle = DEFAULT_TITLE_COLOR;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillText(label, (monthStartX + currentX) / 2, plotY - 4);

				monthStartX = currentX;
			}
			if (prevMonth === -1 || key !== prevMonth) {
				if (prevMonth !== -1) {
					monthStartX =
						i < weeks.length
							? plotX + ((weeks[i]!.getTime() - startDay.getTime()) / (24 * 3600 * 1000)) * pxPerDay
							: plotX + plotWidth;
				}
				prevMonth = key;
			}
		}
	} else if (unit === "month") {
		// 2-tier at top: row1=YYYY年, row2=MM月
		const startDate = new Date(minTime);
		const endDate = new Date(maxTime);

		const months: Date[] = [];
		const m = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
		while (m.getTime() <= endDate.getTime()) {
			months.push(new Date(m));
			m.setMonth(m.getMonth() + 1);
		}
		if (months.length === 0) return;

		for (let i = 0; i < months.length; i++) {
			const mon = months[i]!;
			const x = timeToX(mon.getTime());
			const nextX = i + 1 < months.length ? timeToX(months[i + 1]!.getTime()) : plotX + plotWidth;

			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(x, dataTop);
			ctx.lineTo(x, dataTop + dataHeight);
			ctx.stroke();

			ctx.font = DEFAULT_FONT;
			ctx.fillStyle = labelColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				`${String(mon.getMonth() + 1).padStart(2, "0")}月`,
				(x + nextX) / 2,
				plotY + HEADER_HEIGHT / 2,
			);
		}

		// Top row: YYYY年
		let prevYear = -1;
		let yearStartX = plotX;
		for (let i = 0; i <= months.length; i++) {
			const yr = i < months.length ? months[i]!.getFullYear() : -2;
			if (yr !== prevYear && prevYear !== -1) {
				const currentX = i < months.length ? timeToX(months[i]!.getTime()) : plotX + plotWidth;
				ctx.font = TITLE_FONT;
				ctx.fillStyle = DEFAULT_TITLE_COLOR;
				ctx.textAlign = "center";
				ctx.textBaseline = "bottom";
				ctx.fillText(`${prevYear}年`, (yearStartX + currentX) / 2, plotY - 4);

				yearStartX = currentX;
			}
			if (prevYear === -1 || yr !== prevYear) {
				if (prevYear !== -1) {
					yearStartX = i < months.length ? timeToX(months[i]!.getTime()) : plotX + plotWidth;
				}
				prevYear = yr;
			}
		}
	}

	// Header line between x-header area and data area
	ctx.strokeStyle = axisColor;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(plotX, plotY + HEADER_HEIGHT);
	ctx.lineTo(plotX + plotWidth, plotY + HEADER_HEIGHT);
	ctx.stroke();
}

/** ISO week number */
function getISOWeekNumber(d: Date): number {
	const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
	return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
