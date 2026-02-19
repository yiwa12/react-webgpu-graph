import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	drawTimelineAxes,
	resolveColumnWidths,
	totalTableWidth,
} from "../rendering/canvas-overlay.ts";
import type { Rect } from "../rendering/gpu-renderer.ts";
import { useWebGPU } from "../rendering/use-webgpu.ts";
import type {
	ChartLayout,
	TimelineChartProps,
	TimelineColumnWidths,
	TooltipInfo,
} from "../types.ts";
import { DEFAULT_COLORS } from "../types.ts";
import { TooltipOverlay } from "../ui/Tooltip.tsx";
import { useChartAnimation } from "../ui/use-chart-animation.ts";

// ============================================================
// Constants
// ============================================================

/** Height of the column header row in table */
const TABLE_HEADER_HEIGHT = 24;
/** Drag handle hit zone (px each side of separator) */
const DRAG_HIT_ZONE = 4;
/** Minimum column width */
const MIN_COL_WIDTH = 30;

// ============================================================
// X-axis header height based on unit
// ============================================================

function xHeaderHeight(unit: "time" | "day" | "week" | "month"): number {
	if (unit === "day") return 40;
	if (unit === "week" || unit === "month") return 38;
	return 22;
}

// ============================================================
// Layout computation for timeline chart (X-axis on top)
// ============================================================

function computeTimelineLayout(
	width: number,
	height: number,
	unit: "time" | "day" | "week" | "month",
	tableWidth: number,
	padding?: [number, number, number, number],
): ChartLayout {
	const [pt, pr, pb, pl] = padding ?? [20, 20, 20, 20];

	const xHeaderH = xHeaderHeight(unit);

	const plotX = pl + tableWidth;
	const plotY = pt + xHeaderH;
	const plotWidth = width - plotX - pr;
	const plotHeight = height - plotY - pb;

	return {
		canvasWidth: width,
		canvasHeight: height,
		plotX,
		plotY,
		plotWidth: Math.max(plotWidth, 10),
		plotHeight: Math.max(plotHeight, 10),
	};
}

// ============================================================
// helpers
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

/** Darken a hex color */
function darkenColor(hex: string, factor = 0.35): string {
	const h = hex.replace("#", "");
	if (h.length !== 6) return hex;
	const r = Math.max(0, Math.round(Number.parseInt(h.slice(0, 2), 16) * (1 - factor)));
	const g = Math.max(0, Math.round(Number.parseInt(h.slice(2, 4), 16) * (1 - factor)));
	const b = Math.max(0, Math.round(Number.parseInt(h.slice(4, 6), 16) * (1 - factor)));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ============================================================
// Component
// ============================================================

export function TimelineChart({
	width = 800,
	height = 400,
	items,
	unit = "day",
	timeFormat,
	xAxis,
	labelConfig,
	columnWidths: columnWidthsProp,
	tooltip,
	animation,
	backgroundColor,
	padding,
	barColor,
	progressColor,
	barHeightRatio = 0.6,
	onColumnWidthsChange,
}: TimelineChartProps) {
	const { canvasRef, ready, fallback, getRenderer } = useWebGPU(width, height);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

	// ---- Column widths state (for drag resize) ----
	const [internalColWidths, setInternalColWidths] = useState<TimelineColumnWidths>(
		columnWidthsProp ?? {},
	);
	useEffect(() => {
		if (columnWidthsProp) setInternalColWidths(columnWidthsProp);
	}, [columnWidthsProp]);

	const columns = useMemo(
		() => resolveColumnWidths(labelConfig, internalColWidths),
		[labelConfig, internalColWidths],
	);
	const tableWidth = useMemo(() => totalTableWidth(columns), [columns]);

	// ---- Drag state ----
	const dragRef = useRef<{
		colIdx: number;
		startX: number;
		startWidth: number;
	} | null>(null);

	// Assign colors per item
	const colors = useMemo(
		() =>
			items.map(
				(it, i) => it.color ?? barColor ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] ?? "#4e79a7",
			),
		[items, barColor],
	);

	// Progress colors
	const progColors = useMemo(
		() => items.map((_, i) => progressColor ?? darkenColor(colors[i]!)),
		[items, progressColor, colors],
	);

	// Time range
	const { minTime, maxTime } = useMemo(() => {
		if (items.length === 0) return { minTime: 0, maxTime: 1 };
		let mn = Number.POSITIVE_INFINITY;
		let mx = Number.NEGATIVE_INFINITY;
		for (const it of items) {
			mn = Math.min(mn, it.start.getTime());
			mx = Math.max(mx, it.end.getTime());
		}
		const range = mx - mn || 1;
		return { minTime: mn - range * 0.02, maxTime: mx + range * 0.02 };
	}, [items]);

	// Layout
	const layout: ChartLayout = useMemo(
		() => computeTimelineLayout(width, height, unit, tableWidth, padding),
		[width, height, unit, tableWidth, padding],
	);

	// Hit-test rects
	const hitRectsRef = useRef<
		{ rect: { x: number; y: number; w: number; h: number }; itemIdx: number }[]
	>([]);

	// Data area (below header row inside plot area)
	const dataTop = layout.plotY + TABLE_HEADER_HEIGHT;
	const dataHeight = layout.plotHeight - TABLE_HEADER_HEIGHT;

	// Draw overlay
	const drawOverlay = useCallback(() => {
		const overlay = overlayRef.current;
		if (!overlay) return;
		overlay.width = width;
		overlay.height = height;
		const ctx = overlay.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		drawTimelineAxes(
			ctx,
			layout,
			minTime,
			maxTime,
			unit,
			items.map((it) => it.label),
			xAxis,
			timeFormat,
			labelConfig,
			items.map((it) => ({
				start: it.start,
				end: it.end,
				progress: it.progress,
			})),
			columns,
			xHeaderHeight(unit),
		);
	}, [
		width,
		height,
		layout,
		minTime,
		maxTime,
		unit,
		items,
		xAxis,
		timeFormat,
		labelConfig,
		columns,
	]);

	// GPU render function
	const renderFrame = (enterProgress: number, _seriesVis: number[]) => {
		const renderer = getRenderer();
		if (!renderer) return;

		const rects: Rect[] = [];
		const hitRects: (typeof hitRectsRef.current)[number][] = [];
		const { plotX, plotWidth } = layout;
		const rowHeight = items.length > 0 ? dataHeight / items.length : dataHeight;
		const barH = rowHeight * barHeightRatio;
		const barYOffset = (rowHeight - barH) / 2;

		const timeToX = (t: number) => plotX + ((t - minTime) / (maxTime - minTime || 1)) * plotWidth;

		// Weekend tint rects (behind task bars)
		if (unit === "day") {
			const wkStart = new Date(minTime);
			wkStart.setHours(0, 0, 0, 0);
			const wkEnd = new Date(maxTime);
			const wkDays: Date[] = [];
			const wd = new Date(wkStart);
			while (wd.getTime() <= wkEnd.getTime()) {
				wkDays.push(new Date(wd));
				wd.setDate(wd.getDate() + 1);
			}
			if (wkDays.length > 0) {
				const dayW = plotWidth / wkDays.length;
				for (let di = 0; di < wkDays.length; di++) {
					const dow = wkDays[di]!.getDay();
					if (dow === 0 || dow === 6) {
						rects.push({
							x: plotX + di * dayW,
							y: dataTop,
							w: dayW,
							h: dataHeight,
							color: "rgba(255, 230, 230, 0.3)",
						});
					}
				}
			}
		}

		for (let i = 0; i < items.length; i++) {
			const it = items[i]!;
			const color = colors[i]!;
			const progColor = progColors[i]!;
			const rowY = dataTop + i * rowHeight + barYOffset;

			const x0 = timeToX(it.start.getTime());
			const x1 = timeToX(it.end.getTime());
			const barW = Math.max((x1 - x0) * enterProgress, 0.5);

			rects.push({ x: x0, y: rowY, w: barW, h: barH, color });

			if (it.progress != null && it.progress > 0) {
				const progW = barW * Math.min(it.progress, 1);
				if (progW > 0.5) {
					rects.push({ x: x0, y: rowY, w: progW, h: barH, color: progColor });
				}
			}

			hitRects.push({
				rect: { x: x0, y: rowY, w: x1 - x0, h: barH },
				itemIdx: i,
			});
		}

		hitRectsRef.current = hitRects;
		renderer.draw(rects, [], [], parseRGBA(backgroundColor ?? "#ffffff"));
	};

	// Animation hook
	const { drawOnce } = useChartAnimation(
		1,
		new Set(),
		ready,
		renderFrame,
		animation?.duration,
		animation?.enabled,
	);

	useEffect(() => {
		if (!ready) return;
		drawOverlay();
		drawOnce();
	}, [ready, drawOverlay, drawOnce]);

	// ---- Column separator positions (for drag detection) ----
	const getColSepPositions = useCallback(() => {
		const [, , , pl] = padding ?? [20, 20, 20, 20];
		const positions: { x: number; colIdx: number }[] = [];
		let colX = pl;
		for (let i = 0; i < columns.length; i++) {
			colX += columns[i]!.width;
			positions.push({ x: colX, colIdx: i });
		}
		return positions;
	}, [columns, padding]);

	// ---- Apply column width update ----
	const applyColWidths = useCallback(
		(newColumns: { name: string; width: number }[]) => {
			const widths: TimelineColumnWidths = {};
			for (const col of newColumns) {
				if (col.name === "タスク名") widths.label = col.width;
				else if (col.name === "開始") widths.start = col.width;
				else if (col.name === "終了") widths.end = col.width;
				else if (col.name === "進捗") widths.progress = col.width;
			}
			setInternalColWidths(widths);
			onColumnWidthsChange?.(widths);
		},
		[onColumnWidthsChange],
	);

	// ---- Mouse handlers ----
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const headerTop = layout.plotY;
			if (my < headerTop || my > headerTop + TABLE_HEADER_HEIGHT) return;

			const seps = getColSepPositions();
			for (const sep of seps) {
				if (Math.abs(mx - sep.x) <= DRAG_HIT_ZONE) {
					e.preventDefault();
					dragRef.current = {
						colIdx: sep.colIdx,
						startX: e.clientX,
						startWidth: columns[sep.colIdx]!.width,
					};
					return;
				}
			}
		},
		[layout.plotY, getColSepPositions, columns],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setContainerRect(rect);
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			// Drag in progress
			if (dragRef.current) {
				const dx = e.clientX - dragRef.current.startX;
				const newWidth = Math.max(MIN_COL_WIDTH, dragRef.current.startWidth + dx);
				const updated = columns.map((c, i) =>
					i === dragRef.current!.colIdx ? { ...c, width: newWidth } : c,
				);
				applyColWidths(updated);
				if (containerRef.current) containerRef.current.style.cursor = "col-resize";
				return;
			}

			// Cursor for header separators
			const headerTop = layout.plotY;
			if (my >= headerTop && my <= headerTop + TABLE_HEADER_HEIGHT) {
				const seps = getColSepPositions();
				for (const sep of seps) {
					if (Math.abs(mx - sep.x) <= DRAG_HIT_ZONE) {
						if (containerRef.current) containerRef.current.style.cursor = "col-resize";
						return;
					}
				}
			}
			if (containerRef.current) containerRef.current.style.cursor = "default";

			// Tooltip hit test
			for (const hr of hitRectsRef.current) {
				if (
					mx >= hr.rect.x &&
					mx <= hr.rect.x + hr.rect.w &&
					my >= hr.rect.y &&
					my <= hr.rect.y + hr.rect.h
				) {
					const it = items[hr.itemIdx]!;
					const progress = it.progress != null ? ` (${Math.round(it.progress * 100)}%)` : "";
					setTooltipInfo({
						seriesName: it.label,
						label: `${formatDate(it.start)} ~ ${formatDate(it.end)}${progress}`,
						value: it.progress ?? 0,
						color: colors[hr.itemIdx]!,
						x: mx,
						y: my,
					});
					return;
				}
			}
			setTooltipInfo(null);
		},
		[items, colors, columns, applyColWidths, layout.plotY, getColSepPositions],
	);

	const handleMouseUp = useCallback(() => {
		dragRef.current = null;
		if (containerRef.current) containerRef.current.style.cursor = "default";
	}, []);

	const handleMouseLeave = useCallback(() => {
		dragRef.current = null;
		setTooltipInfo(null);
		if (containerRef.current) containerRef.current.style.cursor = "default";
	}, []);

	// Global mouseup for dragging
	useEffect(() => {
		const up = () => {
			dragRef.current = null;
		};
		window.addEventListener("mouseup", up);
		return () => window.removeEventListener("mouseup", up);
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
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
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

TimelineChart.chartType = "timeline" as const;

function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const h = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${y}/${m}/${day} ${h}:${min}`;
}
