import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawAxesHorizontal, drawLegend } from "../rendering/canvas-overlay.ts";
import type { Rect } from "../rendering/gpu-renderer.ts";
import { useWebGPU } from "../rendering/use-webgpu.ts";
import type { ChartLayout, LegendHitRect, StackedBarChartProps, TooltipInfo } from "../types.ts";
import { DEFAULT_COLORS } from "../types.ts";
import { TooltipOverlay } from "../ui/Tooltip.tsx";
import { useChartAnimation } from "../ui/use-chart-animation.ts";
import { computeLayout, computeTicks, mapValue } from "../utils.ts";

export function StackedBarChart({
	width = 400,
	height = 300,
	labels,
	datasets,
	orientation = "vertical",
	xAxis,
	yAxis,
	legend,
	tooltip,
	animation,
	backgroundColor,
	padding,
}: StackedBarChartProps) {
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

	// Compute stacked max
	const stackedMax = useMemo(() => {
		let maxVal = 0;
		for (let ci = 0; ci < labels.length; ci++) {
			let sum = 0;
			for (const ds of datasets) {
				sum += ds.data[ci] ?? 0;
			}
			maxVal = Math.max(maxVal, sum);
		}
		return maxVal;
	}, [datasets, labels]);

	// Compute ticks (shared between overlay and renderFrame)
	const ticksInfo = useMemo(
		() => computeTicks(0, stackedMax, orientation === "vertical" ? yAxis : xAxis),
		[stackedMax, orientation, xAxis, yAxis],
	);

	const hitRectsRef = useRef<
		{ rect: { x: number; y: number; w: number; h: number }; seriesIdx: number; catIdx: number }[]
	>([]);

	// ---- GPU render function (called on every animation frame) ----
	const renderFrame = (enterProgress: number, seriesVis: number[]) => {
		const renderer = getRenderer();
		if (!renderer) return;

		const rects: Rect[] = [];
		const hitRects: (typeof hitRectsRef.current)[number][] = [];
		const { plotX, plotY, plotWidth, plotHeight } = layout;
		const { min, max } = ticksInfo;

		if (orientation === "vertical") {
			const groupWidth = plotWidth / labels.length;
			const barWidth = groupWidth * 0.7;
			const groupPad = groupWidth * 0.15;

			for (let ci = 0; ci < labels.length; ci++) {
				let cumulative = 0;
				for (let di = 0; di < datasets.length; di++) {
					const vis = seriesVis[di] ?? 1;
					if (vis <= 0.001) continue;
					const val = (datasets[di]?.data[ci] ?? 0) * vis * enterProgress;
					const x = plotX + ci * groupWidth + groupPad;
					const yBottom = mapValue(cumulative, min, max, plotY + plotHeight, -plotHeight);
					const yTop = mapValue(cumulative + val, min, max, plotY + plotHeight, -plotHeight);
					const rectY = Math.min(yBottom, yTop);
					const rectH = Math.abs(yTop - yBottom);
					if (rectH > 0.1) {
						rects.push({ x, y: rectY, w: barWidth, h: rectH, color: colors[di]! });
						hitRects.push({
							rect: { x, y: rectY, w: barWidth, h: rectH },
							seriesIdx: di,
							catIdx: ci,
						});
					}
					cumulative += val;
				}
			}
		} else {
			// Horizontal
			const groupHeight = plotHeight / labels.length;
			const barHeight = groupHeight * 0.7;
			const groupPad = groupHeight * 0.15;

			for (let ci = 0; ci < labels.length; ci++) {
				let cumulative = 0;
				for (let di = 0; di < datasets.length; di++) {
					const vis = seriesVis[di] ?? 1;
					if (vis <= 0.001) continue;
					const val = (datasets[di]?.data[ci] ?? 0) * vis * enterProgress;
					const y = plotY + ci * groupHeight + groupPad;
					const xLeft = mapValue(cumulative, min, max, plotX, plotWidth);
					const xRight = mapValue(cumulative + val, min, max, plotX, plotWidth);
					const rectX = Math.min(xLeft, xRight);
					const rectW = Math.abs(xRight - xLeft);
					if (rectW > 0.1) {
						rects.push({ x: rectX, y, w: rectW, h: barHeight, color: colors[di]! });
						hitRects.push({
							rect: { x: rectX, y, w: rectW, h: barHeight },
							seriesIdx: di,
							catIdx: ci,
						});
					}
					cumulative += val;
				}
			}
		}

		hitRectsRef.current = hitRects;
		renderer.draw(rects, [], [], parseRGBA(backgroundColor ?? "#ffffff"));
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

		if (orientation === "vertical") {
			const groupWidth = plotWidth / labels.length;
			const yPositions = ticks.map((v) => mapValue(v, min, max, plotY + plotHeight, -plotHeight));
			const xPositions = labels.map((_, i) => plotX + (i + 0.5) * groupWidth);
			drawAxes(
				ctx,
				layout,
				{ labels, positions: xPositions },
				{ values: ticks, positions: yPositions },
				xAxis,
				yAxis,
			);
		} else {
			const groupHeight = plotHeight / labels.length;
			const xPositions = ticks.map((v) => mapValue(v, min, max, plotX, plotWidth));
			const yPositions = labels.map((_, i) => plotY + (i + 0.5) * groupHeight);
			drawAxesHorizontal(
				ctx,
				layout,
				{ labels, positions: yPositions },
				{ values: ticks, positions: xPositions },
				xAxis,
				yAxis,
			);
		}

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
		orientation,
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

			for (const hr of hitRectsRef.current) {
				if (
					mx >= hr.rect.x &&
					mx <= hr.rect.x + hr.rect.w &&
					my >= hr.rect.y &&
					my <= hr.rect.y + hr.rect.h
				) {
					const ds = datasets[hr.seriesIdx]!;
					setTooltipInfo({
						seriesName: ds.label,
						label: labels[hr.catIdx] ?? "",
						value: ds.data[hr.catIdx] ?? 0,
						color: colors[hr.seriesIdx]!,
						x: mx,
						y: my,
					});
					return;
				}
			}
			setTooltipInfo(null);
		},
		[datasets, labels, colors],
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

StackedBarChart.chartType = "stacked-bar" as const;

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
