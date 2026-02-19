import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartLayout } from "../types.ts";

/**
 * Zoom range as fractions 0..1 of the data range.
 *  - xMin=0, xMax=1 means full X range (no zoom)
 *  - yMin=0, yMax=1 means full Y range (no zoom)
 */
export interface ZoomRange {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

/** Pixel-space rectangle for the selection overlay. */
export interface SelectionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const NO_ZOOM: ZoomRange = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
const DIR_THRESHOLD = 5; // px – direction lock threshold
const MIN_SELECTION = 8; // px – minimum selection size to trigger zoom

type DragMode = "none" | "select" | "pan";
type DragDir = "undecided" | "x" | "y";

interface DragState {
	mode: DragMode;
	dir: DragDir;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	/** Zoom at the start of a pan drag. */
	zoomAtStart: ZoomRange;
}

/**
 * Hook that adds zoom / pan behaviour to any chart.
 *
 * - Left-drag  → range selection  (horizontal OR vertical, decided by first move)
 * - Mouse-up   → zoom to selection (ignored if too small)
 * - Right-drag → pan (only while zoomed)
 * - Right-up   → stop pan
 * - Left dbl-click → reset zoom
 */
export function useChartZoom(layout: ChartLayout) {
	const { plotX, plotY, plotWidth, plotHeight } = layout;

	const [zoom, setZoom] = useState<ZoomRange>(NO_ZOOM);
	const [selection, setSelection] = useState<SelectionRect | null>(null);
	const dragRef = useRef<DragState>({
		mode: "none",
		dir: "undecided",
		startX: 0,
		startY: 0,
		lastX: 0,
		lastY: 0,
		zoomAtStart: NO_ZOOM,
	});

	const isZoomed = zoom.xMin !== 0 || zoom.xMax !== 1 || zoom.yMin !== 0 || zoom.yMax !== 1;

	// ---- Derived helpers ----

	/**
	 * Apply zoom to a value-axis data range.
	 * Returns the zoomed { min, max } that should be passed to computeTicks.
	 */
	const applyZoom = useCallback(
		(dataMin: number, dataMax: number, axis: "x" | "y"): { min: number; max: number } => {
			const range = dataMax - dataMin;
			if (axis === "x") {
				return { min: dataMin + range * zoom.xMin, max: dataMin + range * zoom.xMax };
			}
			return { min: dataMin + range * zoom.yMin, max: dataMin + range * zoom.yMax };
		},
		[zoom.xMin, zoom.xMax, zoom.yMin, zoom.yMax],
	);

	/**
	 * Compute effective (virtual) plot origin & size for a categorical axis.
	 * Categories are positioned within these virtual dimensions; the GPU scissor
	 * rect clips them to the actual plot area.
	 */
	const getEffectivePlot = useCallback(
		(axis: "x" | "y"): { start: number; size: number } => {
			if (axis === "x") {
				const ew = plotWidth / (zoom.xMax - zoom.xMin);
				return { start: plotX - zoom.xMin * ew, size: ew };
			}
			const eh = plotHeight / (zoom.yMax - zoom.yMin);
			return { start: plotY - (1 - zoom.yMax) * eh, size: eh };
		},
		[plotX, plotY, plotWidth, plotHeight, zoom.xMin, zoom.xMax, zoom.yMin, zoom.yMax],
	);

	// ---- Mouse event handlers ----

	const inPlot = useCallback(
		(mx: number, my: number) =>
			mx >= plotX && mx <= plotX + plotWidth && my >= plotY && my <= plotY + plotHeight,
		[plotX, plotY, plotWidth, plotHeight],
	);

	/**
	 * Call from the container's onMouseDown.
	 * Returns `true` if the zoom hook consumed the event (caller should skip its own handling).
	 */
	const handleZoomMouseDown = useCallback(
		(e: React.MouseEvent): boolean => {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			if (!inPlot(mx, my)) return false;

			if (e.button === 0) {
				// Left button → start selection
				dragRef.current = {
					mode: "select",
					dir: "undecided",
					startX: mx,
					startY: my,
					lastX: mx,
					lastY: my,
					zoomAtStart: zoom,
				};
				return true;
			}

			if (e.button === 2 && isZoomed) {
				// Right button → start pan
				dragRef.current = {
					mode: "pan",
					dir: "undecided",
					startX: mx,
					startY: my,
					lastX: mx,
					lastY: my,
					zoomAtStart: { ...zoom },
				};
				return true;
			}

			return false;
		},
		[inPlot, zoom, isZoomed],
	);

	/**
	 * Call from the container's onMouseMove.
	 * Returns `true` if a drag is in progress (caller should skip tooltip logic).
	 */
	const handleZoomMouseMove = useCallback(
		(e: React.MouseEvent): boolean => {
			const drag = dragRef.current;
			if (drag.mode === "none") return false;

			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			drag.lastX = mx;
			drag.lastY = my;

			if (drag.mode === "select") {
				// Determine direction if undecided
				if (drag.dir === "undecided") {
					const dx = Math.abs(mx - drag.startX);
					const dy = Math.abs(my - drag.startY);
					if (dx >= DIR_THRESHOLD || dy >= DIR_THRESHOLD) {
						drag.dir = dx >= dy ? "x" : "y";
					} else {
						return true; // still undecided, consume event but don't show selection yet
					}
				}

				// Build selection rect (clamped to plot area)
				if (drag.dir === "x") {
					const x1 = Math.max(plotX, Math.min(mx, drag.startX));
					const x2 = Math.min(plotX + plotWidth, Math.max(mx, drag.startX));
					setSelection({ x: x1, y: plotY, width: x2 - x1, height: plotHeight });
				} else {
					const y1 = Math.max(plotY, Math.min(my, drag.startY));
					const y2 = Math.min(plotY + plotHeight, Math.max(my, drag.startY));
					setSelection({ x: plotX, y: y1, width: plotWidth, height: y2 - y1 });
				}
				return true;
			}

			if (drag.mode === "pan") {
				const dxPx = mx - drag.startX;
				const dyPx = my - drag.startY;
				const zs = drag.zoomAtStart;
				const spanX = zs.xMax - zs.xMin;
				const spanY = zs.yMax - zs.yMin;

				// Convert pixel deltas to fraction deltas
				const dfx = -(dxPx / plotWidth) * spanX;
				const dfy = (dyPx / plotHeight) * spanY; // pixel Y is inverted vs data Y

				let newXMin = zs.xMin + dfx;
				let newXMax = zs.xMax + dfx;
				let newYMin = zs.yMin + dfy;
				let newYMax = zs.yMax + dfy;

				// Clamp to [0, 1]
				if (newXMin < 0) {
					newXMax -= newXMin;
					newXMin = 0;
				}
				if (newXMax > 1) {
					newXMin -= newXMax - 1;
					newXMax = 1;
				}
				if (newYMin < 0) {
					newYMax -= newYMin;
					newYMin = 0;
				}
				if (newYMax > 1) {
					newYMin -= newYMax - 1;
					newYMax = 1;
				}
				newXMin = Math.max(0, newXMin);
				newXMax = Math.min(1, newXMax);
				newYMin = Math.max(0, newYMin);
				newYMax = Math.min(1, newYMax);

				setZoom({ xMin: newXMin, xMax: newXMax, yMin: newYMin, yMax: newYMax });
				return true;
			}

			return false;
		},
		[plotX, plotY, plotWidth, plotHeight],
	);

	/**
	 * Call from the container's onMouseUp.
	 */
	const handleZoomMouseUp = useCallback(
		(e: React.MouseEvent): void => {
			const drag = dragRef.current;
			if (drag.mode === "none") return;

			if (drag.mode === "select" && drag.dir !== "undecided") {
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;

				if (drag.dir === "x") {
					const x1 = Math.max(plotX, Math.min(mx, drag.startX));
					const x2 = Math.min(plotX + plotWidth, Math.max(mx, drag.startX));
					if (x2 - x1 >= MIN_SELECTION) {
						// Convert pixel range to fraction of current zoom
						const fracLeft = (x1 - plotX) / plotWidth;
						const fracRight = (x2 - plotX) / plotWidth;
						const curSpan = zoom.xMax - zoom.xMin;
						const newXMin = zoom.xMin + fracLeft * curSpan;
						const newXMax = zoom.xMin + fracRight * curSpan;
						setZoom((prev) => ({ ...prev, xMin: newXMin, xMax: newXMax }));
					}
				} else {
					const y1 = Math.max(plotY, Math.min(my, drag.startY));
					const y2 = Math.min(plotY + plotHeight, Math.max(my, drag.startY));
					if (y2 - y1 >= MIN_SELECTION) {
						const fracTop = (y1 - plotY) / plotHeight;
						const fracBottom = (y2 - plotY) / plotHeight;
						const curSpan = zoom.yMax - zoom.yMin;
						// Pixel top = high data value, pixel bottom = low data value
						const newYMax = zoom.yMax - fracTop * curSpan;
						const newYMin = zoom.yMax - fracBottom * curSpan;
						setZoom((prev) => ({ ...prev, yMin: newYMin, yMax: newYMax }));
					}
				}
			}

			// Reset drag
			dragRef.current = { ...dragRef.current, mode: "none", dir: "undecided" };
			setSelection(null);
		},
		[plotX, plotY, plotWidth, plotHeight, zoom],
	);

	/** Left double-click resets zoom. */
	const handleZoomDoubleClick = useCallback(
		(e: React.MouseEvent): boolean => {
			if (!isZoomed) return false;
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			if (!inPlot(mx, my)) return false;
			setZoom(NO_ZOOM);
			return true;
		},
		[isZoomed, inPlot],
	);

	/** Prevent default context menu on the chart (we use right-click for pan). */
	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			if (inPlot(mx, my)) {
				e.preventDefault();
			}
		},
		[inPlot],
	);

	/** Cancel any ongoing drag (e.g. on mouse-leave). */
	const cancelDrag = useCallback(() => {
		if (dragRef.current.mode !== "none") {
			dragRef.current = { ...dragRef.current, mode: "none", dir: "undecided" };
			setSelection(null);
		}
	}, []);

	// Window-level mouseup so drags ending outside the container still complete
	useEffect(() => {
		const onUp = () => {
			if (dragRef.current.mode !== "none") {
				dragRef.current = { ...dragRef.current, mode: "none", dir: "undecided" };
				setSelection(null);
			}
		};
		window.addEventListener("mouseup", onUp);
		return () => window.removeEventListener("mouseup", onUp);
	}, []);

	// ---- Selection overlay style ----
	const selectionStyle = useMemo((): React.CSSProperties | null => {
		if (!selection) return null;
		return {
			position: "absolute",
			left: selection.x,
			top: selection.y,
			width: selection.width,
			height: selection.height,
			backgroundColor: "rgba(128,128,128,0.3)",
			pointerEvents: "none",
			zIndex: 5,
		};
	}, [selection]);

	return {
		zoom,
		isZoomed,
		selection,
		selectionStyle,
		applyZoom,
		getEffectivePlot,
		handleZoomMouseDown,
		handleZoomMouseMove,
		handleZoomMouseUp,
		handleZoomDoubleClick,
		handleContextMenu,
		cancelDrag,
	};
}
