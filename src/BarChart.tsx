import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawAxesHorizontal, drawLegend } from "./canvas-overlay.ts";
import type { Rect } from "./gpu-renderer.ts";
import { TooltipOverlay } from "./Tooltip.tsx";
import type { BarChartProps, ChartLayout, LegendHitRect, TooltipInfo } from "./types.ts";
import { DEFAULT_COLORS } from "./types.ts";
import { useChartAnimation } from "./use-chart-animation.ts";
import { useWebGPU } from "./use-webgpu.ts";
import { computeLayout, computeTicks, mapValue } from "./utils.ts";

export function BarChart({
	width,
	height,
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
}: BarChartProps) {
	const { canvasRef, ready, fallback, getRenderer } = useWebGPU(width, height);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
	const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());
	const legendHitRectsRef = useRef<LegendHitRect[]>([]);

	// Assign colors
	const colors = useMemo(
		() =>
			datasets.map((ds, i) => ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] ?? "#4e79a7"),
		[datasets],
	);

	// Compute layout
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

	// Compute value range
	const allValues = useMemo(() => datasets.flatMap((ds) => ds.data), [datasets]);
	const dataMin = Math.min(0, ...allValues);
	const dataMax = Math.max(0, ...allValues);

	// Hit-test data for tooltip
	const hitRectsRef = useRef<
		{ rect: { x: number; y: number; w: number; h: number }; seriesIdx: number; catIdx: number }[]
	>([]);

	// Compute ticks (shared between overlay and renderFrame)
	const ticksInfo = useMemo(
		() => computeTicks(dataMin, dataMax, orientation === "vertical" ? yAxis : xAxis),
		[dataMin, dataMax, orientation, xAxis, yAxis],
	);

	const drawOverlayVertical = useCallback(
		(lay: ChartLayout, ticks: number[], cats: string[], min: number, max: number) => {
			const overlay = overlayRef.current;
			if (!overlay) return;
			overlay.width = width;
			overlay.height = height;
			const ctx = overlay.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, width, height);

			const yPositions = ticks.map((v) =>
				mapValue(v, min, max, lay.plotY + lay.plotHeight, -lay.plotHeight),
			);
			const xPositions = cats.map((_, i) => lay.plotX + (i + 0.5) * (lay.plotWidth / cats.length));

			drawAxes(
				ctx,
				lay,
				{ labels: cats, positions: xPositions },
				{ values: ticks, positions: yPositions },
				xAxis,
				yAxis,
			);

			if (legend?.visible !== false) {
				legendHitRectsRef.current = drawLegend(
					ctx,
					lay,
					datasets.map((ds, i) => ({ label: ds.label, color: colors[i]! })),
					legend,
					hiddenSeries,
				);
			}
		},
		[width, height, xAxis, yAxis, legend, datasets, colors, hiddenSeries],
	);

	const drawOverlayHorizontal = useCallback(
		(lay: ChartLayout, ticks: number[], cats: string[], min: number, max: number) => {
			const overlay = overlayRef.current;
			if (!overlay) return;
			overlay.width = width;
			overlay.height = height;
			const ctx = overlay.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, width, height);

			const xPositions = ticks.map((v) => mapValue(v, min, max, lay.plotX, lay.plotWidth));
			const yPositions = cats.map((_, i) => lay.plotY + (i + 0.5) * (lay.plotHeight / cats.length));

			drawAxesHorizontal(
				ctx,
				lay,
				{ labels: cats, positions: yPositions },
				{ values: ticks, positions: xPositions },
				xAxis,
				yAxis,
			);

			if (legend?.visible !== false) {
				legendHitRectsRef.current = drawLegend(
					ctx,
					lay,
					datasets.map((ds, i) => ({ label: ds.label, color: colors[i]! })),
					legend,
					hiddenSeries,
				);
			}
		},
		[width, height, xAxis, yAxis, legend, datasets, colors, hiddenSeries],
	);

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
			const barWidth = datasets.length > 0 ? (groupWidth * 0.7) / datasets.length : 0;
			const groupPad = groupWidth * 0.15;
			const baseline = mapValue(0, min, max, plotY + plotHeight, -plotHeight);

			for (let di = 0; di < datasets.length; di++) {
				const vis = seriesVis[di] ?? 1;
				if (vis <= 0.001) continue;
				const ds = datasets[di]!;
				const color = colors[di]!;

				for (let ci = 0; ci < labels.length; ci++) {
					const val = ds.data[ci] ?? 0;
					const x = plotX + ci * groupWidth + groupPad + di * barWidth;
					const yTarget = mapValue(val, min, max, plotY + plotHeight, -plotHeight);

					const animFactor = enterProgress * vis;
					const animatedY = baseline + (yTarget - baseline) * animFactor;
					const rectY = Math.min(baseline, animatedY);
					const rectH = Math.abs(animatedY - baseline);

					if (rectH > 0.1) {
						rects.push({ x, y: rectY, w: barWidth, h: rectH, color });
						hitRects.push({
							rect: { x, y: rectY, w: barWidth, h: rectH },
							seriesIdx: di,
							catIdx: ci,
						});
					}
				}
			}
		} else {
			// Horizontal
			const groupHeight = plotHeight / labels.length;
			const barHeight = datasets.length > 0 ? (groupHeight * 0.7) / datasets.length : 0;
			const groupPad = groupHeight * 0.15;
			const baseline = mapValue(0, min, max, plotX, plotWidth);

			for (let di = 0; di < datasets.length; di++) {
				const vis = seriesVis[di] ?? 1;
				if (vis <= 0.001) continue;
				const ds = datasets[di]!;
				const color = colors[di]!;

				for (let ci = 0; ci < labels.length; ci++) {
					const val = ds.data[ci] ?? 0;
					const y = plotY + ci * groupHeight + groupPad + di * barHeight;
					const xTarget = mapValue(val, min, max, plotX, plotWidth);

					const animFactor = enterProgress * vis;
					const animatedX = baseline + (xTarget - baseline) * animFactor;
					const rectX = Math.min(baseline, animatedX);
					const rectW = Math.abs(animatedX - baseline);

					if (rectW > 0.1) {
						rects.push({ x: rectX, y, w: rectW, h: barHeight, color });
						hitRects.push({
							rect: { x: rectX, y, w: rectW, h: barHeight },
							seriesIdx: di,
							catIdx: ci,
						});
					}
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
		if (orientation === "vertical") {
			drawOverlayVertical(layout, ticks, labels, min, max);
		} else {
			drawOverlayHorizontal(layout, ticks, labels, min, max);
		}
		drawOnce();
	}, [
		ready,
		orientation,
		layout,
		ticksInfo,
		labels,
		drawOnce,
		drawOverlayVertical,
		drawOverlayHorizontal,
	]);

	// Mouse hover
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
