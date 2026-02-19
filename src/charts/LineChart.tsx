import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawLegend } from "../rendering/canvas-overlay.ts";
import type { Circle, Line as GpuLine } from "../rendering/gpu-renderer.ts";
import { useWebGPU } from "../rendering/use-webgpu.ts";
import type { ChartLayout, LegendHitRect, LineChartProps, TooltipInfo } from "../types.ts";
import { DEFAULT_COLORS } from "../types.ts";
import { TooltipOverlay } from "../ui/Tooltip.tsx";
import { useChartAnimation } from "../ui/use-chart-animation.ts";
import { useChartZoom } from "../ui/use-chart-zoom.ts";
import { computeLayout, computeTicks, mapValue } from "../utils.ts";

export function LineChart({
	width = 400,
	height = 300,
	labels,
	datasets,
	xAxis,
	yAxis,
	legend,
	tooltip,
	animation,
	backgroundColor,
	padding,
}: LineChartProps) {
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

	const allValues = useMemo(() => datasets.flatMap((ds) => ds.data), [datasets]);
	const dataMin = Math.min(...allValues);
	const dataMax = Math.max(...allValues);

	// Zoom / pan
	const {
		isZoomed,
		selectionStyle,
		applyZoom,
		getEffectivePlot,
		handleZoomMouseDown,
		handleZoomMouseMove,
		handleZoomMouseUp,
		handleZoomDoubleClick,
		handleContextMenu,
		cancelDrag,
	} = useChartZoom(layout);

	// Compute ticks (shared between overlay and renderFrame)
	const ticksInfo = useMemo(() => {
		const z = applyZoom(dataMin, dataMax, "y");
		return computeTicks(z.min, z.max, yAxis);
	}, [dataMin, dataMax, yAxis, applyZoom]);

	// Hit points for tooltip
	const hitPointsRef = useRef<
		{ cx: number; cy: number; r: number; seriesIdx: number; catIdx: number }[]
	>([]);

	// ---- GPU render function (called on every animation frame) ----
	const renderFrame = (enterProgress: number, seriesVis: number[]) => {
		const renderer = getRenderer();
		if (!renderer) return;

		const lines: GpuLine[] = [];
		const circles: Circle[] = [];
		const hitPoints: (typeof hitPointsRef.current)[number][] = [];
		const { plotX, plotY, plotWidth, plotHeight } = layout;
		const { min, max } = ticksInfo;

		// Baseline Y position (value = midpoint or clamped 0)
		const baselineVal = Math.max(min, Math.min(max, 0));
		const baselineY = mapValue(baselineVal, min, max, plotY + plotHeight, -plotHeight);

		const effX = getEffectivePlot("x");

		for (let di = 0; di < datasets.length; di++) {
			const vis = seriesVis[di] ?? 1;
			if (vis <= 0.001) continue;
			const ds = datasets[di]!;
			const color = colors[di]!;
			const lineWidth = ds.lineWidth ?? 2;
			const showPoints = ds.showPoints !== false;
			const pointRadius = ds.pointRadius ?? 4;

			const animFactor = enterProgress * vis;

			const points: { x: number; y: number }[] = [];
			for (let ci = 0; ci < ds.data.length; ci++) {
				const val = ds.data[ci] ?? 0;
				const x = effX.start + (ci + 0.5) * (effX.size / labels.length);
				const yTarget = mapValue(val, min, max, plotY + plotHeight, -plotHeight);
				const y = baselineY + (yTarget - baselineY) * animFactor;
				points.push({ x, y });
			}

			// Lines between points
			for (let i = 0; i < points.length - 1; i++) {
				const p0 = points[i]!;
				const p1 = points[i + 1]!;
				lines.push({
					x1: p0.x,
					y1: p0.y,
					x2: p1.x,
					y2: p1.y,
					color,
					width: lineWidth,
				});
			}

			// Points
			if (showPoints) {
				for (let ci = 0; ci < points.length; ci++) {
					const p = points[ci]!;
					const animR = pointRadius * animFactor;
					if (animR > 0.1) {
						circles.push({ cx: p.x, cy: p.y, r: animR, color });
					}
					hitPoints.push({ cx: p.x, cy: p.y, r: pointRadius + 4, seriesIdx: di, catIdx: ci });
				}
			} else {
				// Invisible hit points for tooltip
				for (let ci = 0; ci < points.length; ci++) {
					const p = points[ci]!;
					hitPoints.push({ cx: p.x, cy: p.y, r: 8, seriesIdx: di, catIdx: ci });
				}
			}
		}

		hitPointsRef.current = hitPoints;
		renderer.draw(
			[],
			lines,
			circles,
			parseRGBA(backgroundColor ?? "#ffffff"),
			isZoomed ? { x: plotX, y: plotY, width: plotWidth, height: plotHeight } : undefined,
		);
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
		const { ticks, min, max } = ticksInfo;
		const { plotX, plotY, plotWidth, plotHeight } = layout;

		const overlay = overlayRef.current;
		if (!overlay) return;
		overlay.width = width;
		overlay.height = height;
		const ctx = overlay.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		const yPositions = ticks.map((v) => mapValue(v, min, max, plotY + plotHeight, -plotHeight));

		// Effective X for categories (may be expanded when zoomed)
		const effX = getEffectivePlot("x");
		const allXPos = labels.map((_, i) => effX.start + (i + 0.5) * (effX.size / labels.length));
		const visLabels: string[] = [];
		const visXPos: number[] = [];
		for (let i = 0; i < labels.length; i++) {
			if (allXPos[i]! >= plotX - 20 && allXPos[i]! <= plotX + plotWidth + 20) {
				visLabels.push(labels[i]!);
				visXPos.push(allXPos[i]!);
			}
		}

		drawAxes(
			ctx,
			layout,
			{ labels: visLabels, positions: visXPos },
			{ values: ticks, positions: yPositions },
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
		ticksInfo,
		labels,
		datasets,
		colors,
		legend,
		xAxis,
		yAxis,
		width,
		height,
		hiddenSeries,
		drawOnce,
		getEffectivePlot,
	]);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (handleZoomMouseMove(e)) return;
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
				setTooltipInfo({
					seriesName: ds.label,
					label: labels[closest.catIdx] ?? "",
					value: ds.data[closest.catIdx] ?? 0,
					color: colors[closest.seriesIdx]!,
					x: mx,
					y: my,
				});
			} else {
				setTooltipInfo(null);
			}
		},
		[datasets, labels, colors, handleZoomMouseMove],
	);

	const handleMouseLeave = useCallback(() => {
		setTooltipInfo(null);
		cancelDrag();
		if (containerRef.current) {
			containerRef.current.style.cursor = "default";
		}
	}, [cancelDrag]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			handleZoomMouseDown(e);
		},
		[handleZoomMouseDown],
	);

	const handleMouseUp = useCallback(
		(e: React.MouseEvent) => {
			handleZoomMouseUp(e);
		},
		[handleZoomMouseUp],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			handleZoomDoubleClick(e);
		},
		[handleZoomDoubleClick],
	);

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
			onMouseDown={handleMouseDown}
			onMouseUp={handleMouseUp}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
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
			{selectionStyle && <div style={selectionStyle} />}
			<TooltipOverlay info={tooltipInfo} config={tooltip} containerRect={containerRect} />
		</div>
	);
}

LineChart.chartType = "line" as const;

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
