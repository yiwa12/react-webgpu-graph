import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawLegend } from "../rendering/canvas-overlay.ts";
import type { Circle } from "../rendering/gpu-renderer.ts";
import { useWebGPU } from "../rendering/use-webgpu.ts";
import type { ChartLayout, LegendHitRect, ScatterChartProps, TooltipInfo } from "../types.ts";
import { DEFAULT_COLORS } from "../types.ts";
import { TooltipOverlay } from "../ui/Tooltip.tsx";
import { useChartAnimation } from "../ui/use-chart-animation.ts";
import { computeLayout, computeTicks, mapValue } from "../utils.ts";

export function ScatterChart({
	width = 400,
	height = 300,
	datasets,
	xAxis,
	yAxis,
	legend,
	tooltip,
	animation,
	backgroundColor,
	padding,
}: ScatterChartProps) {
	const { canvasRef, ready, fallback, getRenderer } = useWebGPU(width, height);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
	const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
	const legendHitRectsRef = useRef<LegendHitRect[]>([]);

	const colors = useMemo(
		() =>
			datasets.map((ds, i) => ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] ?? "#4e79a7"),
		[datasets],
	);

	const legendHeight = legend?.visible !== false ? 28 : 0;
	const legendPos = typeof legend?.position === "object" ? "float" : (legend?.position ?? "bottom");

	const layout: ChartLayout = useMemo(
		() =>
			computeLayout(
				width,
				height,
				padding,
				!!xAxis?.title,
				!!yAxis?.title,
				legendHeight,
				legendPos as "top" | "bottom" | "float",
			),
		[width, height, padding, xAxis?.title, yAxis?.title, legendHeight, legendPos],
	);

	// Data ranges
	const allX = useMemo(() => datasets.flatMap((ds) => ds.data.map((p) => p.x)), [datasets]);
	const allY = useMemo(() => datasets.flatMap((ds) => ds.data.map((p) => p.y)), [datasets]);
	const xMin = Math.min(...allX);
	const xMax = Math.max(...allX);
	const yMin = Math.min(...allY);
	const yMax = Math.max(...allY);

	// Compute ticks (shared between overlay and renderFrame)
	const xTickInfo = useMemo(() => computeTicks(xMin, xMax, xAxis), [xMin, xMax, xAxis]);
	const yTickInfo = useMemo(() => computeTicks(yMin, yMax, yAxis), [yMin, yMax, yAxis]);

	const hitPointsRef = useRef<
		{ cx: number; cy: number; r: number; seriesIdx: number; pointIdx: number }[]
	>([]);

	// ---- GPU render function (called on every animation frame) ----
	const renderFrame = (enterProgress: number, seriesVis: number[]) => {
		const renderer = getRenderer();
		if (!renderer) return;

		const circles: Circle[] = [];
		const hitPoints: (typeof hitPointsRef.current)[number][] = [];
		const { plotX, plotY, plotWidth, plotHeight } = layout;

		for (let di = 0; di < datasets.length; di++) {
			const vis = seriesVis[di] ?? 1;
			if (vis <= 0.001) continue;
			const ds = datasets[di]!;
			const color = colors[di]!;
			const radius = ds.pointRadius ?? 4;
			const animR = radius * enterProgress * vis;

			for (let pi = 0; pi < ds.data.length; pi++) {
				const pt = ds.data[pi]!;
				const cx = mapValue(pt.x, xTickInfo.min, xTickInfo.max, plotX, plotWidth);
				const cy = mapValue(pt.y, yTickInfo.min, yTickInfo.max, plotY + plotHeight, -plotHeight);
				if (animR > 0.1) {
					circles.push({ cx, cy, r: animR, color });
				}
				hitPoints.push({ cx, cy, r: radius + 4, seriesIdx: di, pointIdx: pi });
			}
		}

		hitPointsRef.current = hitPoints;
		renderer.draw([], [], circles, parseRGBA(backgroundColor ?? "#ffffff"));
	};

	// ---- Animation hook (drives rAF loop) ----
	const { drawOnce } = useChartAnimation(
		datasets.length,
		hiddenSeries,
		ready,
		renderFrame,
		animation?.duration,
		animation?.enabled,
	);

	// ---- Overlay (Canvas 2D – axes / labels / legend) ----
	useEffect(() => {
		if (!ready) return;
		const { plotX, plotY, plotWidth, plotHeight } = layout;

		const overlay = overlayRef.current;
		if (!overlay) return;
		overlay.width = width;
		overlay.height = height;
		const ctx = overlay.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		const xPositions = xTickInfo.ticks.map((v) =>
			mapValue(v, xTickInfo.min, xTickInfo.max, plotX, plotWidth),
		);
		const yPositions = yTickInfo.ticks.map((v) =>
			mapValue(v, yTickInfo.min, yTickInfo.max, plotY + plotHeight, -plotHeight),
		);

		drawAxes(
			ctx,
			layout,
			{
				labels: xTickInfo.ticks.map((v) => formatTick(v)),
				positions: xPositions,
			},
			{ values: yTickInfo.ticks, positions: yPositions },
			xAxis,
			yAxis,
		);

		if (legend?.visible !== false) {
			legendHitRectsRef.current = drawLegend(
				ctx,
				layout,
				datasets.map((ds, i) => ({ label: ds.label, color: colors[i]! })),
				legend,
				hiddenSeries,
			);
		}

		drawOnce();
	}, [
		ready,
		layout,
		xTickInfo,
		yTickInfo,
		datasets,
		colors,
		legend,
		xAxis,
		yAxis,
		width,
		height,
		hiddenSeries,
		drawOnce,
	]);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setContainerRect(rect);
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			// Check legend hover for cursor
			const overLegend = legendHitRectsRef.current.some(
				(lr) => mx >= lr.x && mx <= lr.x + lr.w && my >= lr.y && my <= lr.y + lr.h,
			);
			if (containerRef.current) {
				containerRef.current.style.cursor = overLegend ? "pointer" : "default";
			}

			let closest: (typeof hitPointsRef.current)[number] | null = null;
			let closestDist = Number.POSITIVE_INFINITY;

			for (const hp of hitPointsRef.current) {
				const dist = Math.sqrt((mx - hp.cx) ** 2 + (my - hp.cy) ** 2);
				if (dist <= hp.r && dist < closestDist) {
					closest = hp;
					closestDist = dist;
				}
			}

			if (closest) {
				const ds = datasets[closest.seriesIdx]!;
				const pt = ds.data[closest.pointIdx]!;
				setTooltipInfo({
					seriesName: ds.label,
					label: `(${pt.x}, ${pt.y})`,
					value: pt.y,
					color: colors[closest.seriesIdx]!,
					x: mx,
					y: my,
				});
			} else {
				setTooltipInfo(null);
			}
		},
		[datasets, colors],
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

ScatterChart.chartType = "scatter" as const;

function formatTick(v: number): string {
	if (Number.isInteger(v)) return v.toString();
	if (Math.abs(v) >= 1) return v.toFixed(1);
	return v.toPrecision(3);
}

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
