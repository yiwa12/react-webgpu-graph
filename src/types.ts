import type { ReactNode } from "react";

// ============================================================
// Color types
// ============================================================
export type Color = string; // CSS color string (hex, rgb, hsl, named)

// ============================================================
// Chart orientation (for bar charts)
// ============================================================
export type Orientation = "vertical" | "horizontal";

// ============================================================
// Legend position
// ============================================================
export type LegendPosition = "top" | "bottom" | { type: "float"; x: number; y: number };

// ============================================================
// Axis configuration
// ============================================================
export interface AxisConfig {
	/** Axis title */
	title?: string;
	/** Title color */
	titleColor?: Color;
	/** Label color */
	labelColor?: Color;
	/** Axis line color */
	lineColor?: Color;
	/** Manual min value */
	min?: number;
	/** Manual max value */
	max?: number;
	/** Tick count hint */
	tickCount?: number;
}

// ============================================================
// Legend configuration
// ============================================================
export interface LegendConfig {
	/** Show/hide legend */
	visible?: boolean;
	/** Position */
	position?: LegendPosition;
	/** Text color */
	textColor?: Color;
	/** Font size in px */
	fontSize?: number;
}

// ============================================================
// Animation configuration
// ============================================================
export interface AnimationConfig {
	/** Enable / disable animation (default: true) */
	enabled?: boolean;
	/** Duration in milliseconds (default: 600) */
	duration?: number;
}

// ============================================================
// Tooltip configuration
// ============================================================
export interface TooltipConfig {
	/** Enable/disable tooltip */
	enabled?: boolean;
	/** Custom render function */
	render?: (info: TooltipInfo) => ReactNode;
}

export interface TooltipInfo {
	/** Series name */
	seriesName: string;
	/** Label (category) */
	label: string;
	/** Value */
	value: number;
	/** Color of the series */
	color: string;
	/** Position in chart area (px) */
	x: number;
	/** Position in chart area (px) */
	y: number;
}

// ============================================================
// Data series definitions
// ============================================================
export interface BarDataset {
	/** Series label for legend */
	label: string;
	/** Data values */
	data: number[];
	/** Bar color */
	color?: Color;
}

export interface LineDataset {
	/** Series label for legend */
	label: string;
	/** Data values */
	data: number[];
	/** Line color */
	color?: Color;
	/** Line width (default 2) */
	lineWidth?: number;
	/** Show data points */
	showPoints?: boolean;
	/** Point radius */
	pointRadius?: number;
}

export interface ScatterPoint {
	x: number;
	y: number;
}

export interface ScatterDataset {
	/** Series label for legend */
	label: string;
	/** Data points */
	data: ScatterPoint[];
	/** Point color */
	color?: Color;
	/** Point radius (default 4) */
	pointRadius?: number;
}

// ============================================================
// Chart props
// ============================================================
export interface BaseChartProps {
	/** Width in px (optional when used inside CompositeChart) */
	width?: number;
	/** Height in px (optional when used inside CompositeChart) */
	height?: number;
	/** Background color */
	backgroundColor?: Color;
	/** X-axis config */
	xAxis?: AxisConfig;
	/** Y-axis config */
	yAxis?: AxisConfig;
	/** Legend config */
	legend?: LegendConfig;
	/** Tooltip config */
	tooltip?: TooltipConfig;
	/** Animation config */
	animation?: AnimationConfig;
	/** Padding inside chart area [top, right, bottom, left] */
	padding?: [number, number, number, number];
}

export interface BarChartProps extends BaseChartProps {
	/** Category labels */
	labels: string[];
	/** Data series */
	datasets: BarDataset[];
	/** Orientation */
	orientation?: Orientation;
}

export interface StackedBarChartProps extends BaseChartProps {
	/** Category labels */
	labels: string[];
	/** Data series (stacked) */
	datasets: BarDataset[];
	/** Orientation */
	orientation?: Orientation;
}

export interface LineChartProps extends BaseChartProps {
	/** Category labels */
	labels: string[];
	/** Data series */
	datasets: LineDataset[];
}

export interface ScatterChartProps extends BaseChartProps {
	/** Data series */
	datasets: ScatterDataset[];
}

// ============================================================
// Timeline chart types
// ============================================================

/** Time axis scale unit */
export type TimelineUnit = "time" | "day" | "week" | "month";

/** A single timeline task item */
export interface TimelineItem {
	/** Item / task label (Y-axis) */
	label: string;
	/** Start date/time */
	start: Date;
	/** End date/time */
	end: Date;
	/** Progress 0–1 (optional) */
	progress?: number;
	/** Bar color (optional, falls back to palette) */
	color?: Color;
}

/** Axis config for the timeline X-axis */
export interface TimelineAxisConfig {
	/** Axis title */
	title?: string;
	/** Title color */
	titleColor?: Color;
	/** Label color */
	labelColor?: Color;
	/** Axis line color */
	lineColor?: Color;
}

/** Label display options for item names on the Y-axis */
export interface TimelineLabelConfig {
	/** Show start column */
	showStart?: boolean;
	/** Show end column */
	showEnd?: boolean;
	/** Show progress column */
	showProgress?: boolean;
	/** Time/date format for start/end display (e.g. "MM/DD", "HH:mm") */
	timeFormat?: string;
}

/** Column width configuration for the Y-axis table */
export interface TimelineColumnWidths {
	/** Width of the task name column (default: 100) */
	label?: number;
	/** Width of the start column (default: 70) */
	start?: number;
	/** Width of the end column (default: 70) */
	end?: number;
	/** Width of the progress column (default: 50) */
	progress?: number;
}

export interface TimelineChartProps {
	/** Width in px */
	width?: number;
	/** Height in px */
	height?: number;
	/** Background color */
	backgroundColor?: Color;
	/** Timeline items */
	items: TimelineItem[];
	/** Time-axis unit (default: "day") */
	unit?: TimelineUnit;
	/** Time format string for "time" unit (e.g. "HH:mm:ss", "HH:mm") */
	timeFormat?: string;
	/** X-axis config */
	xAxis?: TimelineAxisConfig;
	/** Label display config */
	labelConfig?: TimelineLabelConfig;
	/** Initial column widths for Y-axis table */
	columnWidths?: TimelineColumnWidths;
	/** Tooltip config */
	tooltip?: TooltipConfig;
	/** Animation config */
	animation?: AnimationConfig;
	/** Padding [top, right, bottom, left] */
	padding?: [number, number, number, number];
	/** Default bar color */
	barColor?: Color;
	/** Progress bar color */
	progressColor?: Color;
	/** Bar height ratio 0–1 (default: 0.6) */
	barHeightRatio?: number;
	/** Callback when column widths change (from drag resize) */
	onColumnWidthsChange?: (widths: TimelineColumnWidths) => void;
}

// ============================================================
// Default color palette
// ============================================================
export const DEFAULT_COLORS: readonly string[] = [
	"#4e79a7",
	"#f28e2b",
	"#e15759",
	"#76b7b2",
	"#59a14f",
	"#edc948",
	"#b07aa1",
	"#ff9da7",
	"#9c755f",
	"#bab0ac",
];

// ============================================================
// Composite chart types
// ============================================================

/** Specifies which axes are shared between layers */
export type SharedAxes = "x" | "y" | "both";

export interface CompositeChartProps {
	/** Width in px */
	width: number;
	/** Height in px */
	height: number;
	/** Background color */
	backgroundColor?: Color;

	/** Which axes are shared (default: "x") */
	sharedAxes?: SharedAxes;

	/** Primary Y-axis config (left) */
	yAxis?: AxisConfig;
	/** Secondary Y-axis config (right, used when sharedAxes !== "y" and !== "both") */
	yAxisSecondary?: AxisConfig;
	/** Primary X-axis config (bottom) */
	xAxis?: AxisConfig;
	/** Secondary X-axis config (top, used when sharedAxes !== "x" and !== "both") */
	xAxisSecondary?: AxisConfig;

	/** Legend config */
	legend?: LegendConfig;
	/** Tooltip config */
	tooltip?: TooltipConfig;
	/** Animation config */
	animation?: AnimationConfig;
	/** Padding [top, right, bottom, left] */
	padding?: [number, number, number, number];

	/** Chart component children (BarChart, LineChart, ScatterChart, StackedBarChart) */
	children: ReactNode;
}

// ============================================================
// Legend hit-test rectangle (for click toggling)
// ============================================================
export interface LegendHitRect {
	x: number;
	y: number;
	w: number;
	h: number;
	seriesIdx: number;
}

// ============================================================
// Internal chart area layout
// ============================================================
export interface ChartLayout {
	/** Canvas / chart total width */
	canvasWidth: number;
	/** Canvas / chart total height */
	canvasHeight: number;
	/** Plot area (where data is drawn) */
	plotX: number;
	plotY: number;
	plotWidth: number;
	plotHeight: number;
}
