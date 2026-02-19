import type React from "react";
import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawCompositeAxes, drawLegend } from "./canvas-overlay.ts";
import type { Circle, Line as GpuLine, Rect } from "./gpu-renderer.ts";
import { TooltipOverlay } from "./Tooltip.tsx";
import type {
	BarChartProps,
	BarDataset,
	ChartLayout,
	CompositeChartProps,
	LegendHitRect,
	LineChartProps,
	LineDataset,
	ScatterChartProps,
	ScatterDataset,
	StackedBarChartProps,
	TooltipInfo,
} from "./types.ts";
import { DEFAULT_COLORS } from "./types.ts";
import { useChartAnimation } from "./use-chart-animation.ts";
import { useWebGPU } from "./use-webgpu.ts";
import { computeCompositeLayout, computeTicks, formatTick, mapValue } from "./utils.ts";

// ============================================================
// Internal types
// ============================================================

type LayerChartType = "bar" | "stacked-bar" | "line" | "scatter";

interface LayerInfo {
	chartType: LayerChartType;
	/** Bar / Line datasets */
	datasets: (BarDataset | LineDataset)[];
	/** Scatter datasets */
	scatterDatasets: ScatterDataset[];
	/** Category labels */
	labels: string[];
	/** Global series offset for color / legend / animation indexing */
	globalOffset: number;
	/** Number of series in this layer */
	seriesCount: number;
	/** Bar slot offset for coordinated bar placement */
	barSlotOffset: number;
}

// ============================================================
// Helpers
// ============================================================

function parseRGBA(css: string): [number, number, number, number] {
	if (css === "#ffffff" || css === "white") return [1, 1, 1, 1];
	if (css === "#000000" || css === "black") return [0, 0, 0, 1];
	const hex = css.replace("#", "");
	if (hex.length === 6) {
		return [
			Number.parseInt(hex.slice(0, 2), 16) / 255,
			Number.parseInt(hex.slice(2, 4), 16) / 255,
			Number.parseInt(hex.slice(4, 6), 16) / 255,
			1,
		];
	}
	return [1, 1, 1, 1];
}

// ============================================================
// Extract layer info from children
// ============================================================

function extractLayers(children: React.ReactNode): LayerInfo[] {
	const layers: LayerInfo[] = [];
	let globalOffset = 0;
	let barSlotOffset = 0;

	Children.forEach(children, (child) => {
		if (!isValidElement(child)) return;

		const chartType = (child.type as { chartType?: string }).chartType as
			| LayerChartType
			| undefined;
		if (!chartType) return;

		if (chartType === "bar") {
			const props = child.props as BarChartProps;
			const datasets = (props.datasets ?? []) as BarDataset[];
			const seriesCount = datasets.length;
			layers.push({
				chartType,
				datasets,
				scatterDatasets: [],
				labels: props.labels ?? [],
				globalOffset,
				seriesCount,
				barSlotOffset,
			});
			globalOffset += seriesCount;
			barSlotOffset += seriesCount; // Each bar dataset = 1 slot
		} else if (chartType === "stacked-bar") {
			const props = child.props as StackedBarChartProps;
			const datasets = (props.datasets ?? []) as BarDataset[];
			const seriesCount = datasets.length;
			layers.push({
				chartType,
				datasets,
				scatterDatasets: [],
				labels: props.labels ?? [],
				globalOffset,
				seriesCount,
				barSlotOffset,
			});
			globalOffset += seriesCount;
			barSlotOffset += 1; // Stacked bars occupy 1 slot
		} else if (chartType === "line") {
			const props = child.props as LineChartProps;
			const datasets = (props.datasets ?? []) as LineDataset[];
			const seriesCount = datasets.length;
			layers.push({
				chartType,
				datasets,
				scatterDatasets: [],
				labels: props.labels ?? [],
				globalOffset,
				seriesCount,
				barSlotOffset: 0,
			});
			globalOffset += seriesCount;
		} else if (chartType === "scatter") {
			const props = child.props as ScatterChartProps;
			const scatterDatasets = props.datasets ?? [];
			const seriesCount = scatterDatasets.length;
			layers.push({
				chartType,
				datasets: [],
				scatterDatasets,
				labels: [],
				globalOffset,
				seriesCount,
				barSlotOffset: 0,
			});
			globalOffset += seriesCount;
		}
	});

	return layers;
}

/** Compute total bar slots across all bar-type layers (for coordinated placement) */
function computeTotalBarSlots(layers: LayerInfo[]): number {
	let total = 0;
	for (const layer of layers) {
		if (layer.chartType === "bar") total += layer.seriesCount;
		else if (layer.chartType === "stacked-bar") total += 1;
	}
	return total;
}

// ============================================================
// Hit test types
// ============================================================

interface HitRect {
	rect: { x: number; y: number; w: number; h: number };
	globalIdx: number;
	catIdx: number;
}

interface HitPoint {
	cx: number;
	cy: number;
	r: number;
	globalIdx: number;
	catIdx: number;
}

// ============================================================
// Component
// ============================================================

export function CompositeChart({
	width,
	height,
	children,
	sharedAxes = "x",
	xAxis,
	yAxis,
	xAxisSecondary,
	yAxisSecondary,
	legend,
	tooltip,
	animation,
	backgroundColor,
	padding,
}: CompositeChartProps) {
	const { canvasRef, ready, fallback, getRenderer } = useWebGPU(width, height);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
	const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
	const legendHitRectsRef = useRef<LegendHitRect[]>([]);
	const hitRectsRef = useRef<HitRect[]>([]);
	const hitPointsRef = useRef<HitPoint[]>([]);

	// ---- Extract layers from children ----
	const layers = useMemo(() => extractLayers(children), [children]);
	const totalBarSlots = useMemo(() => computeTotalBarSlots(layers), [layers]);
	const totalSeries = useMemo(() => layers.reduce((s, l) => s + l.seriesCount, 0), [layers]);

	// ---- Colors ----
	const allColors = useMemo(() => {
		const result: string[] = [];
		for (const layer of layers) {
			if (layer.chartType === "scatter") {
				for (let i = 0; i < layer.scatterDatasets.length; i++) {
					result.push(
						layer.scatterDatasets[i]?.color ??
							DEFAULT_COLORS[(layer.globalOffset + i) % DEFAULT_COLORS.length] ??
							"#4e79a7",
					);
				}
			} else {
				for (let i = 0; i < layer.datasets.length; i++) {
					const ds = layer.datasets[i] as BarDataset | LineDataset | undefined;
					result.push(
						ds?.color ??
							DEFAULT_COLORS[(layer.globalOffset + i) % DEFAULT_COLORS.length] ??
							"#4e79a7",
					);
				}
			}
		}
		return result;
	}, [layers]);

	// ---- Legend labels ----
	const allLabels = useMemo(() => {
		const result: { label: string; color: string }[] = [];
		for (const layer of layers) {
			if (layer.chartType === "scatter") {
				for (let i = 0; i < layer.scatterDatasets.length; i++) {
					result.push({
						label: layer.scatterDatasets[i]?.label ?? "",
						color: allColors[layer.globalOffset + i]!,
					});
				}
			} else {
				for (let i = 0; i < layer.datasets.length; i++) {
					const ds = layer.datasets[i] as BarDataset | LineDataset | undefined;
					result.push({
						label: ds?.label ?? "",
						color: allColors[layer.globalOffset + i]!,
					});
				}
			}
		}
		return result;
	}, [layers, allColors]);

	// ---- Layout ----
	const legendHeight = legend?.visible !== false ? 28 : 0;
	const legendPos = typeof legend?.position === "object" ? "float" : (legend?.position ?? "bottom");

	const layout: ChartLayout = useMemo(
		() =>
			computeCompositeLayout(
				width,
				height,
				sharedAxes,
				padding,
				!!xAxis?.title,
				!!yAxis?.title,
				!!xAxisSecondary?.title,
				!!yAxisSecondary?.title,
				legendHeight,
				legendPos as "top" | "bottom" | "float",
			),
		[
			width,
			height,
			sharedAxes,
			padding,
			xAxis?.title,
			yAxis?.title,
			xAxisSecondary?.title,
			yAxisSecondary?.title,
			legendHeight,
			legendPos,
		],
	);

	// ---- Value ranges ----
	// First child = primary axis, remaining children = secondary axis
	const { primaryRange, secondaryRange, primaryXRange, secondaryXRange } = useMemo(() => {
		let priMin = Number.POSITIVE_INFINITY;
		let priMax = Number.NEGATIVE_INFINITY;
		let secMin = Number.POSITIVE_INFINITY;
		let secMax = Number.NEGATIVE_INFINITY;
		let priXMin = Number.POSITIVE_INFINITY;
		let priXMax = Number.NEGATIVE_INFINITY;
		let secXMin = Number.POSITIVE_INFINITY;
		let secXMax = Number.NEGATIVE_INFINITY;

		for (let li = 0; li < layers.length; li++) {
			const layer = layers[li]!;
			let yMin: number;
			let yMax: number;
			let xMin = 0;
			let xMax = 1;

			if (layer.chartType === "scatter") {
				const allY = layer.scatterDatasets.flatMap((ds) => ds.data.map((p) => p.y));
				const allX = layer.scatterDatasets.flatMap((ds) => ds.data.map((p) => p.x));
				yMin = allY.length > 0 ? Math.min(...allY) : 0;
				yMax = allY.length > 0 ? Math.max(...allY) : 1;
				xMin = allX.length > 0 ? Math.min(...allX) : 0;
				xMax = allX.length > 0 ? Math.max(...allX) : 1;
			} else if (layer.chartType === "stacked-bar") {
				const barDs = layer.datasets as BarDataset[];
				let stackMax = 0;
				const catCount = layer.labels.length;
				for (let ci = 0; ci < catCount; ci++) {
					let sum = 0;
					for (const ds of barDs) sum += ds.data[ci] ?? 0;
					stackMax = Math.max(stackMax, sum);
				}
				yMin = 0;
				yMax = stackMax || 1;
			} else {
				const allVals = (layer.datasets as BarDataset[]).flatMap((ds) => ds.data);
				yMin =
					layer.chartType === "bar"
						? allVals.length > 0
							? Math.min(0, ...allVals)
							: 0
						: allVals.length > 0
							? Math.min(...allVals)
							: 0;
				yMax = allVals.length > 0 ? Math.max(0, ...allVals) : 1;
			}

			if (li === 0) {
				priMin = yMin;
				priMax = yMax;
				priXMin = xMin;
				priXMax = xMax;
			} else {
				secMin = Math.min(secMin, yMin);
				secMax = Math.max(secMax, yMax);
				secXMin = Math.min(secXMin, xMin);
				secXMax = Math.max(secXMax, xMax);
			}
		}

		// Fallbacks
		if (!Number.isFinite(priMin)) {
			priMin = 0;
			priMax = 1;
		}
		if (!Number.isFinite(secMin)) {
			secMin = priMin;
			secMax = priMax;
		}
		if (!Number.isFinite(priXMin)) {
			priXMin = 0;
			priXMax = 1;
		}
		if (!Number.isFinite(secXMin)) {
			secXMin = priXMin;
			secXMax = priXMax;
		}

		return {
			primaryRange: { min: priMin, max: priMax },
			secondaryRange: { min: secMin, max: secMax },
			primaryXRange: { min: priXMin, max: priXMax },
			secondaryXRange: { min: secXMin, max: secXMax },
		};
	}, [layers]);

	// ---- Category labels ----
	const primaryLabels = useMemo(() => layers[0]?.labels ?? [], [layers]);
	const secondaryLabels = useMemo(() => {
		let longest: string[] = [];
		for (let i = 1; i < layers.length; i++) {
			const l = layers[i]!.labels;
			if (l.length > longest.length) longest = l;
		}
		return longest;
	}, [layers]);

	const sharedCategoryLabels = useMemo(() => {
		if (sharedAxes === "x" || sharedAxes === "both") {
			return primaryLabels.length > 0 ? primaryLabels : secondaryLabels;
		}
		return primaryLabels;
	}, [sharedAxes, primaryLabels, secondaryLabels]);

	// ---- Ticks ----
	const primaryYTicks = useMemo(() => {
		if (sharedAxes === "y" || sharedAxes === "both") {
			const min = Math.min(primaryRange.min, secondaryRange.min);
			const max = Math.max(primaryRange.max, secondaryRange.max);
			return computeTicks(min, max, yAxis);
		}
		return computeTicks(primaryRange.min, primaryRange.max, yAxis);
	}, [sharedAxes, primaryRange, secondaryRange, yAxis]);

	const secondaryYTicks = useMemo(() => {
		if (sharedAxes === "both" || sharedAxes === "y") return null;
		if (layers.length <= 1) return null;
		return computeTicks(secondaryRange.min, secondaryRange.max, yAxisSecondary);
	}, [sharedAxes, secondaryRange, yAxisSecondary, layers.length]);

	const primaryXTicks = useMemo(() => {
		if (layers.length === 0) return null;
		const first = layers[0]!;
		if (first.chartType === "scatter") {
			if (sharedAxes === "x" || sharedAxes === "both") {
				const min = Math.min(primaryXRange.min, secondaryXRange.min);
				const max = Math.max(primaryXRange.max, secondaryXRange.max);
				return computeTicks(min, max, xAxis);
			}
			return computeTicks(primaryXRange.min, primaryXRange.max, xAxis);
		}
		return null; // category labels handled separately
	}, [sharedAxes, layers, primaryXRange, secondaryXRange, xAxis]);

	const secondaryXTicks = useMemo(() => {
		if (sharedAxes === "both" || sharedAxes === "x") return null;
		if (layers.length <= 1) return null;
		for (let i = 1; i < layers.length; i++) {
			if (layers[i]!.chartType === "scatter") {
				return computeTicks(secondaryXRange.min, secondaryXRange.max, xAxisSecondary);
			}
		}
		return null;
	}, [sharedAxes, layers, secondaryXRange, xAxisSecondary]);

	// ---- GPU render function ----
	const renderFrame = (enterProgress: number, seriesVis: number[]) => {
		const renderer = getRenderer();
		if (!renderer) return;

		const rects: Rect[] = [];
		const lines: GpuLine[] = [];
		const circles: Circle[] = [];
		const nextHitRects: HitRect[] = [];
		const nextHitPoints: HitPoint[] = [];

		const priYMin = primaryYTicks.min;
		const priYMax = primaryYTicks.max;
		const secYMin = secondaryYTicks ? secondaryYTicks.min : priYMin;
		const secYMax = secondaryYTicks ? secondaryYTicks.max : priYMax;

		let priXMin = 0;
		let priXMax = 1;
		let secXMin = 0;
		let secXMax = 1;

		if (primaryXTicks) {
			priXMin = primaryXTicks.min;
			priXMax = primaryXTicks.max;
		}
		if (secondaryXTicks) {
			secXMin = secondaryXTicks.min;
			secXMax = secondaryXTicks.max;
		}

		for (let li = 0; li < layers.length; li++) {
			const layer = layers[li]!;
			const isPrimary = li === 0;

			const layerYMin =
				sharedAxes === "y" || sharedAxes === "both" || isPrimary ? priYMin : secYMin;
			const layerYMax =
				sharedAxes === "y" || sharedAxes === "both" || isPrimary ? priYMax : secYMax;

			const layerXMin =
				sharedAxes === "x" || sharedAxes === "both" || isPrimary ? priXMin : secXMin;
			const layerXMax =
				sharedAxes === "x" || sharedAxes === "both" || isPrimary ? priXMax : secXMax;

			const layerLabels =
				sharedAxes === "x" || sharedAxes === "both" || isPrimary
					? sharedCategoryLabels
					: layer.labels.length > 0
						? layer.labels
						: secondaryLabels;

			if (layer.chartType === "bar") {
				drawBarLayer(
					layer,
					allColors,
					seriesVis,
					enterProgress,
					layout,
					layerYMin,
					layerYMax,
					layerLabels,
					totalBarSlots,
					rects,
					nextHitRects,
				);
			} else if (layer.chartType === "stacked-bar") {
				drawStackedBarLayer(
					layer,
					allColors,
					seriesVis,
					enterProgress,
					layout,
					layerYMin,
					layerYMax,
					layerLabels,
					totalBarSlots,
					rects,
					nextHitRects,
				);
			} else if (layer.chartType === "line") {
				drawLineLayer(
					layer,
					allColors,
					seriesVis,
					enterProgress,
					layout,
					layerYMin,
					layerYMax,
					layerLabels,
					lines,
					circles,
					nextHitPoints,
				);
			} else if (layer.chartType === "scatter") {
				drawScatterLayer(
					layer,
					allColors,
					seriesVis,
					enterProgress,
					layout,
					layerXMin,
					layerXMax,
					layerYMin,
					layerYMax,
					circles,
					nextHitPoints,
				);
			}
		}

		hitRectsRef.current = nextHitRects;
		hitPointsRef.current = nextHitPoints;
		renderer.draw(rects, lines, circles, parseRGBA(backgroundColor ?? "#ffffff"));
	};

	// ---- Animation ----
	const { drawOnce } = useChartAnimation(
		totalSeries,
		hiddenSeries,
		ready,
		renderFrame,
		animation?.duration,
		animation?.enabled,
	);

	// ---- Overlay (Canvas 2D) ----
	useEffect(() => {
		if (!ready) return;
		const overlay = overlayRef.current;
		if (!overlay) return;
		overlay.width = width;
		overlay.height = height;
		const ctx = overlay.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		const { plotX, plotWidth, plotY, plotHeight } = layout;

		let pXTicks: { labels: string[]; positions: number[] } | null = null;
		let pYTicks: { values: number[]; positions: number[] } | null = null;
		let sXTicks: { labels: string[]; positions: number[] } | null = null;
		let sYTicks: { values: number[]; positions: number[] } | null = null;

		// Primary Y axis labels
		const pYP = primaryYTicks.ticks.map((v) =>
			mapValue(v, primaryYTicks.min, primaryYTicks.max, plotY + plotHeight, -plotHeight),
		);
		pYTicks = { values: primaryYTicks.ticks, positions: pYP };

		// Primary X axis labels
		if (primaryXTicks) {
			const pXP = primaryXTicks.ticks.map((v) =>
				mapValue(v, primaryXTicks.min, primaryXTicks.max, plotX, plotWidth),
			);
			pXTicks = { labels: primaryXTicks.ticks.map((v) => formatTick(v)), positions: pXP };
		} else if (sharedCategoryLabels.length > 0) {
			const catPositions = sharedCategoryLabels.map(
				(_, i) => plotX + (i + 0.5) * (plotWidth / sharedCategoryLabels.length),
			);
			pXTicks = { labels: sharedCategoryLabels, positions: catPositions };
		}

		// Secondary Y axis labels (right side)
		if (secondaryYTicks) {
			const sYP = secondaryYTicks.ticks.map((v) =>
				mapValue(v, secondaryYTicks.min, secondaryYTicks.max, plotY + plotHeight, -plotHeight),
			);
			sYTicks = { values: secondaryYTicks.ticks, positions: sYP };
		}

		// Secondary X axis labels (top)
		if (sharedAxes === "y" && layers.length > 1) {
			if (secondaryXTicks) {
				const sXP = secondaryXTicks.ticks.map((v) =>
					mapValue(v, secondaryXTicks.min, secondaryXTicks.max, plotX, plotWidth),
				);
				sXTicks = {
					labels: secondaryXTicks.ticks.map((v) => formatTick(v)),
					positions: sXP,
				};
			} else if (secondaryLabels.length > 0) {
				const catPositions = secondaryLabels.map(
					(_, i) => plotX + (i + 0.5) * (plotWidth / secondaryLabels.length),
				);
				sXTicks = { labels: secondaryLabels, positions: catPositions };
			}
		}

		drawCompositeAxes(
			ctx,
			layout,
			sharedAxes,
			pXTicks,
			pYTicks,
			sXTicks,
			sYTicks,
			xAxis,
			yAxis,
			xAxisSecondary,
			yAxisSecondary,
		);

		if (legend?.visible !== false) {
			legendHitRectsRef.current = drawLegend(ctx, layout, allLabels, legend, hiddenSeries);
		}

		drawOnce();
	}, [
		ready,
		layout,
		primaryYTicks,
		secondaryYTicks,
		primaryXTicks,
		secondaryXTicks,
		sharedAxes,
		sharedCategoryLabels,
		secondaryLabels,
		layers,
		allLabels,
		legend,
		xAxis,
		yAxis,
		xAxisSecondary,
		yAxisSecondary,
		width,
		height,
		hiddenSeries,
		drawOnce,
	]);

	// ---- Mouse handlers ----
	const getTooltipInfo = useCallback(
		(globalIdx: number, catIdx: number, mx: number, my: number): TooltipInfo | null => {
			let targetLayer: LayerInfo | null = null;
			let localIdx = 0;
			for (const layer of layers) {
				if (globalIdx >= layer.globalOffset && globalIdx < layer.globalOffset + layer.seriesCount) {
					targetLayer = layer;
					localIdx = globalIdx - layer.globalOffset;
					break;
				}
			}
			if (!targetLayer) return null;

			let seriesName = "";
			let label = "";
			let value = 0;

			if (targetLayer.chartType === "scatter") {
				const ds = targetLayer.scatterDatasets[localIdx];
				if (!ds) return null;
				const pt = ds.data[catIdx];
				if (!pt) return null;
				seriesName = ds.label;
				label = `(${pt.x}, ${pt.y})`;
				value = pt.y;
			} else {
				const ds = targetLayer.datasets[localIdx] as BarDataset | LineDataset | undefined;
				if (!ds) return null;
				seriesName = ds.label;
				label = targetLayer.labels[catIdx] ?? sharedCategoryLabels[catIdx] ?? "";
				value = (ds as BarDataset).data[catIdx] ?? 0;
			}

			return {
				seriesName,
				label,
				value,
				color: allColors[globalIdx]!,
				x: mx,
				y: my,
			};
		},
		[layers, allColors, sharedCategoryLabels],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setContainerRect(rect);
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			const overLegend = legendHitRectsRef.current.some(
				(lr) => mx >= lr.x && mx <= lr.x + lr.w && my >= lr.y && my <= lr.y + lr.h,
			);
			if (containerRef.current) {
				containerRef.current.style.cursor = overLegend ? "pointer" : "default";
			}

			for (const hr of hitRectsRef.current) {
				if (
					mx >= hr.rect.x &&
					mx <= hr.rect.x + hr.rect.w &&
					my >= hr.rect.y &&
					my <= hr.rect.y + hr.rect.h
				) {
					const info = getTooltipInfo(hr.globalIdx, hr.catIdx, mx, my);
					if (info) {
						setTooltipInfo(info);
						return;
					}
				}
			}

			let closest: HitPoint | null = null;
			let closestDist = Number.POSITIVE_INFINITY;
			for (const hp of hitPointsRef.current) {
				const dist = Math.sqrt((mx - hp.cx) ** 2 + (my - hp.cy) ** 2);
				if (dist <= hp.r && dist < closestDist) {
					closest = hp;
					closestDist = dist;
				}
			}
			if (closest) {
				const info = getTooltipInfo(closest.globalIdx, closest.catIdx, mx, my);
				if (info) {
					setTooltipInfo(info);
					return;
				}
			}

			setTooltipInfo(null);
		},
		[getTooltipInfo],
	);

	const handleMouseLeave = useCallback(() => {
		setTooltipInfo(null);
		if (containerRef.current) {
			containerRef.current.style.cursor = "default";
		}
	}, []);

	const handleClick = useCallback((e: React.MouseEvent) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		for (const lr of legendHitRectsRef.current) {
			if (mx >= lr.x && mx <= lr.x + lr.w && my >= lr.y && my <= lr.y + lr.h) {
				setHiddenSeries((prev) => {
					const next = new Set(prev);
					if (next.has(lr.seriesIdx)) {
						next.delete(lr.seriesIdx);
					} else {
						next.add(lr.seriesIdx);
					}
					return next;
				});
				return;
			}
		}
	}, []);

	if (fallback) {
		return (
			<div
				style={{
					width,
					height,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					border: "1px solid #ccc",
				}}
			>
				WebGPU is not supported in this browser.
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			style={{ position: "relative", width, height }}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			onClick={handleClick}
		>
			<canvas
				ref={canvasRef}
				width={width}
				height={height}
				style={{ position: "absolute", top: 0, left: 0 }}
			/>
			<canvas
				ref={overlayRef}
				width={width}
				height={height}
				style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
			/>
			<TooltipOverlay info={tooltipInfo} config={tooltip} containerRect={containerRect} />
		</div>
	);
}

// ============================================================
// Draw layer functions
// ============================================================

function drawBarLayer(
	layer: LayerInfo,
	allColors: string[],
	seriesVis: number[],
	enterProgress: number,
	layout: ChartLayout,
	yMin: number,
	yMax: number,
	categoryLabels: string[],
	totalBarSlots: number,
	rects: Rect[],
	hitRects: HitRect[],
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;
	const datasets = layer.datasets as BarDataset[];
	const groupWidth = plotWidth / (categoryLabels.length || 1);
	const barWidth = totalBarSlots > 0 ? (groupWidth * 0.7) / totalBarSlots : 0;
	const groupPad = groupWidth * 0.15;
	const baseline = mapValue(0, yMin, yMax, plotY + plotHeight, -plotHeight);

	for (let di = 0; di < datasets.length; di++) {
		const gi = layer.globalOffset + di;
		const vis = seriesVis[gi] ?? 1;
		if (vis <= 0.001) continue;
		const ds = datasets[di]!;
		const color = allColors[gi]!;
		const slotIdx = layer.barSlotOffset + di;

		for (let ci = 0; ci < categoryLabels.length; ci++) {
			const val = ds.data[ci] ?? 0;
			const x = plotX + ci * groupWidth + groupPad + slotIdx * barWidth;
			const yTarget = mapValue(val, yMin, yMax, plotY + plotHeight, -plotHeight);
			const animFactor = enterProgress * vis;
			const animatedY = baseline + (yTarget - baseline) * animFactor;
			const rectY = Math.min(baseline, animatedY);
			const rectH = Math.abs(animatedY - baseline);

			if (rectH > 0.1) {
				rects.push({ x, y: rectY, w: barWidth, h: rectH, color });
				hitRects.push({ rect: { x, y: rectY, w: barWidth, h: rectH }, globalIdx: gi, catIdx: ci });
			}
		}
	}
}

function drawStackedBarLayer(
	layer: LayerInfo,
	allColors: string[],
	seriesVis: number[],
	enterProgress: number,
	layout: ChartLayout,
	yMin: number,
	yMax: number,
	categoryLabels: string[],
	totalBarSlots: number,
	rects: Rect[],
	hitRects: HitRect[],
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;
	const datasets = layer.datasets as BarDataset[];
	const groupWidth = plotWidth / (categoryLabels.length || 1);
	const barWidth = totalBarSlots > 0 ? (groupWidth * 0.7) / totalBarSlots : 0;
	const groupPad = groupWidth * 0.15;

	for (let ci = 0; ci < categoryLabels.length; ci++) {
		let cumulative = 0;
		for (let di = 0; di < datasets.length; di++) {
			const gi = layer.globalOffset + di;
			const vis = seriesVis[gi] ?? 1;
			if (vis <= 0.001) continue;
			const val = (datasets[di]?.data[ci] ?? 0) * vis * enterProgress;
			const x = plotX + ci * groupWidth + groupPad + layer.barSlotOffset * barWidth;
			const yBottom = mapValue(cumulative, yMin, yMax, plotY + plotHeight, -plotHeight);
			const yTop = mapValue(cumulative + val, yMin, yMax, plotY + plotHeight, -plotHeight);
			const rectY = Math.min(yBottom, yTop);
			const rectH = Math.abs(yTop - yBottom);
			if (rectH > 0.1) {
				rects.push({ x, y: rectY, w: barWidth, h: rectH, color: allColors[gi]! });
				hitRects.push({ rect: { x, y: rectY, w: barWidth, h: rectH }, globalIdx: gi, catIdx: ci });
			}
			cumulative += val;
		}
	}
}

function drawLineLayer(
	layer: LayerInfo,
	allColors: string[],
	seriesVis: number[],
	enterProgress: number,
	layout: ChartLayout,
	yMin: number,
	yMax: number,
	categoryLabels: string[],
	lines: GpuLine[],
	circles: Circle[],
	hitPoints: HitPoint[],
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;
	const datasets = layer.datasets as LineDataset[];
	const baselineVal = Math.max(yMin, Math.min(yMax, 0));
	const baselineY = mapValue(baselineVal, yMin, yMax, plotY + plotHeight, -plotHeight);

	for (let di = 0; di < datasets.length; di++) {
		const gi = layer.globalOffset + di;
		const vis = seriesVis[gi] ?? 1;
		if (vis <= 0.001) continue;
		const ds = datasets[di]!;
		const color = allColors[gi]!;
		const lineWidth = ds.lineWidth ?? 2;
		const showPoints = ds.showPoints !== false;
		const pointRadius = ds.pointRadius ?? 4;
		const animFactor = enterProgress * vis;

		const points: { x: number; y: number }[] = [];
		for (let ci = 0; ci < ds.data.length; ci++) {
			const val = ds.data[ci] ?? 0;
			const x = plotX + (ci + 0.5) * (plotWidth / (categoryLabels.length || ds.data.length));
			const yTarget = mapValue(val, yMin, yMax, plotY + plotHeight, -plotHeight);
			const y = baselineY + (yTarget - baselineY) * animFactor;
			points.push({ x, y });
		}

		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[i]!;
			const p1 = points[i + 1]!;
			lines.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, color, width: lineWidth });
		}

		if (showPoints) {
			for (let ci = 0; ci < points.length; ci++) {
				const p = points[ci]!;
				const animR = pointRadius * animFactor;
				if (animR > 0.1) {
					circles.push({ cx: p.x, cy: p.y, r: animR, color });
				}
				hitPoints.push({ cx: p.x, cy: p.y, r: pointRadius + 4, globalIdx: gi, catIdx: ci });
			}
		} else {
			for (let ci = 0; ci < points.length; ci++) {
				const p = points[ci]!;
				hitPoints.push({ cx: p.x, cy: p.y, r: 8, globalIdx: gi, catIdx: ci });
			}
		}
	}
}

function drawScatterLayer(
	layer: LayerInfo,
	allColors: string[],
	seriesVis: number[],
	enterProgress: number,
	layout: ChartLayout,
	xMin: number,
	xMax: number,
	yMin: number,
	yMax: number,
	circles: Circle[],
	hitPoints: HitPoint[],
): void {
	const { plotX, plotY, plotWidth, plotHeight } = layout;

	for (let di = 0; di < layer.scatterDatasets.length; di++) {
		const gi = layer.globalOffset + di;
		const vis = seriesVis[gi] ?? 1;
		if (vis <= 0.001) continue;
		const ds = layer.scatterDatasets[di]!;
		const color = allColors[gi]!;
		const radius = ds.pointRadius ?? 4;
		const animR = radius * enterProgress * vis;

		for (let pi = 0; pi < ds.data.length; pi++) {
			const pt = ds.data[pi]!;
			const cx = mapValue(pt.x, xMin, xMax, plotX, plotWidth);
			const cy = mapValue(pt.y, yMin, yMax, plotY + plotHeight, -plotHeight);
			if (animR > 0.1) {
				circles.push({ cx, cy, r: animR, color });
			}
			hitPoints.push({ cx, cy, r: radius + 4, globalIdx: gi, catIdx: pi });
		}
	}
}
