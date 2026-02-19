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
	/** Width in px */
	width: number;
	/** Height in px */
	height: number;
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
