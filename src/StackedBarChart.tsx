import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawAxes, drawAxesHorizontal, drawLegend } from "./canvas-overlay.ts";
import type { Rect } from "./gpu-renderer.ts";
import { TooltipOverlay } from "./Tooltip.tsx";
import type { ChartLayout, StackedBarChartProps, TooltipInfo } from "./types.ts";
import { DEFAULT_COLORS } from "./types.ts";
import { useWebGPU } from "./use-webgpu.ts";
import { computeLayout, computeTicks, mapValue } from "./utils.ts";

export function StackedBarChart({
	width,
	height,
	labels,
	datasets,
	orientation = "vertical",
	xAxis,
	yAxis,
	legend,
	tooltip,
	backgroundColor,
	padding,
}: StackedBarChartProps) {
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

	const hitRectsRef = useRef<
		{ rect: { x: number; y: number; w: number; h: number }; seriesIdx: number; catIdx: number }[]
	>([]);

	useEffect(() => {
		if (!ready) return;
		const renderer = getRenderer();
		if (!renderer) return;

		const rects: Rect[] = [];
		const hitRects: (typeof hitRectsRef.current)[number][] = [];
		const { plotX, plotY, plotWidth, plotHeight } = layout;

		if (orientation === "vertical") {
			const valueAxis = yAxis;
			const { min, max, ticks } = computeTicks(0, stackedMax, valueAxis);
			const groupWidth = plotWidth / labels.length;
			const barWidth = groupWidth * 0.7;
			const groupPad = groupWidth * 0.15;

			for (let ci = 0; ci < labels.length; ci++) {
				let cumulative = 0;
				for (let di = 0; di < datasets.length; di++) {
					const val = datasets[di]?.data[ci] ?? 0;
					const x = plotX + ci * groupWidth + groupPad;
					const yBottom = mapValue(cumulative, min, max, plotY + plotHeight, -plotHeight);
					const yTop = mapValue(cumulative + val, min, max, plotY + plotHeight, -plotHeight);
					const rectY = Math.min(yBottom, yTop);
					const rectH = Math.abs(yTop - yBottom);
					rects.push({ x, y: rectY, w: barWidth, h: rectH, color: colors[di]! });
					hitRects.push({
						rect: { x, y: rectY, w: barWidth, h: rectH },
						seriesIdx: di,
						catIdx: ci,
					});
					cumulative += val;
				}
			}

			hitRectsRef.current = hitRects;
			const bgColor = backgroundColor ?? "#ffffff";
			renderer.draw(rects, [], [], parseRGBA(bgColor));

			// Overlay
			const overlay = overlayRef.current;
			if (overlay) {
				overlay.width = width;
				overlay.height = height;
				const ctx = overlay.getContext("2d");
				if (ctx) {
					ctx.clearRect(0, 0, width, height);
					const yPositions = ticks.map((v) =>
						mapValue(v, min, max, plotY + plotHeight, -plotHeight),
					);
					const xPositions = labels.map((_, i) => plotX + (i + 0.5) * groupWidth);
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
		} else {
			// Horizontal
			const valueAxis = xAxis;
			const { min, max, ticks } = computeTicks(0, stackedMax, valueAxis);
			const groupHeight = plotHeight / labels.length;
			const barHeight = groupHeight * 0.7;
			const groupPad = groupHeight * 0.15;

			for (let ci = 0; ci < labels.length; ci++) {
				let cumulative = 0;
				for (let di = 0; di < datasets.length; di++) {
					const val = datasets[di]?.data[ci] ?? 0;
					const y = plotY + ci * groupHeight + groupPad;
					const xLeft = mapValue(cumulative, min, max, plotX, plotWidth);
					const xRight = mapValue(cumulative + val, min, max, plotX, plotWidth);
					const rectX = Math.min(xLeft, xRight);
					const rectW = Math.abs(xRight - xLeft);
					rects.push({ x: rectX, y, w: rectW, h: barHeight, color: colors[di]! });
					hitRects.push({
						rect: { x: rectX, y, w: rectW, h: barHeight },
						seriesIdx: di,
						catIdx: ci,
					});
					cumulative += val;
				}
			}

			hitRectsRef.current = hitRects;
			const bgColor = backgroundColor ?? "#ffffff";
			renderer.draw(rects, [], [], parseRGBA(bgColor));

			const overlay = overlayRef.current;
			if (overlay) {
				overlay.width = width;
				overlay.height = height;
				const ctx = overlay.getContext("2d");
				if (ctx) {
					ctx.clearRect(0, 0, width, height);
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
		}
	}, [
		ready,
		datasets,
		labels,
		orientation,
		layout,
		xAxis,
		yAxis,
		legend,
		colors,
		backgroundColor,
		stackedMax,
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
