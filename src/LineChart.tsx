import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawLegend } from "./canvas-overlay.ts";
import type { Circle, Line as GpuLine } from "./gpu-renderer.ts";
import { TooltipOverlay } from "./Tooltip.tsx";
import type { ChartLayout, LineChartProps, TooltipInfo } from "./types.ts";
import { DEFAULT_COLORS } from "./types.ts";
import { useWebGPU } from "./use-webgpu.ts";
import { computeLayout, computeTicks, mapValue } from "./utils.ts";

export function LineChart({
	width,
	height,
	labels,
	datasets,
	xAxis,
	yAxis,
	legend,
	tooltip,
	backgroundColor,
	padding,
}: LineChartProps) {
	const { canvasRef, ready, fallback, getRenderer } = useWebGPU(width, height);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

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

	// Hit points for tooltip
	const hitPointsRef = useRef<
		{ cx: number; cy: number; r: number; seriesIdx: number; catIdx: number }[]
	>([]);

	useEffect(() => {
		if (!ready) return;
		const renderer = getRenderer();
		if (!renderer) return;

		const lines: GpuLine[] = [];
		const circles: Circle[] = [];
		const hitPoints: (typeof hitPointsRef.current)[number][] = [];
		const { plotX, plotY, plotWidth, plotHeight } = layout;

		const { min, max, ticks } = computeTicks(dataMin, dataMax, yAxis);

		for (let di = 0; di < datasets.length; di++) {
			const ds = datasets[di]!;
			const color = colors[di]!;
			const lineWidth = ds.lineWidth ?? 2;
			const showPoints = ds.showPoints !== false;
			const pointRadius = ds.pointRadius ?? 4;

			const points: { x: number; y: number }[] = [];
			for (let ci = 0; ci < ds.data.length; ci++) {
				const val = ds.data[ci] ?? 0;
				const x = plotX + (ci + 0.5) * (plotWidth / labels.length);
				const y = mapValue(val, min, max, plotY + plotHeight, -plotHeight);
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
					circles.push({ cx: p.x, cy: p.y, r: pointRadius, color });
					hitPoints.push({ cx: p.x, cy: p.y, r: pointRadius + 4, seriesIdx: di, catIdx: ci });
				}
			} else {
				// Still add invisible hit points for tooltip
				for (let ci = 0; ci < points.length; ci++) {
					const p = points[ci]!;
					hitPoints.push({ cx: p.x, cy: p.y, r: 8, seriesIdx: di, catIdx: ci });
				}
			}
		}

		hitPointsRef.current = hitPoints;

		const bgColor = backgroundColor ?? "#ffffff";
		renderer.draw([], lines, circles, parseRGBA(bgColor));

		// Overlay
		const overlay = overlayRef.current;
		if (overlay) {
			overlay.width = width;
			overlay.height = height;
			const ctx = overlay.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, width, height);
				const yPositions = ticks.map((v) => mapValue(v, min, max, plotY + plotHeight, -plotHeight));
				const xPositions = labels.map((_, i) => plotX + (i + 0.5) * (plotWidth / labels.length));
				drawAxes(
					ctx,
					layout,
					{ labels, positions: xPositions },
					{ values: ticks, positions: yPositions },
					xAxis,
					yAxis,
				);
				if (legend?.visible !== false) {
					drawLegend(
						ctx,
						layout,
						datasets.map((ds, i) => ({ label: ds.label, color: colors[i]! })),
						legend,
					);
				}
			}
		}
	}, [
		ready,
		datasets,
		labels,
		layout,
		xAxis,
		yAxis,
		legend,
		colors,
		backgroundColor,
		dataMin,
		dataMax,
		getRenderer,
		width,
		height,
	]);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setContainerRect(rect);
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

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
		[datasets, labels, colors],
	);

	const handleMouseLeave = useCallback(() => setTooltipInfo(null), []);

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
