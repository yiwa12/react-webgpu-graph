import { useCallback, useEffect, useRef } from "react";

// ============================================================
// Configuration
// ============================================================
const DEFAULT_DURATION = 600; // ms

/**
 * Easing – fast start, gentle deceleration.
 */
function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

// ============================================================
// Types
// ============================================================
type RenderFn = (enterProgress: number, seriesVisibility: number[]) => void;

// ============================================================
// Hook
// ============================================================

/**
 * Drives requestAnimationFrame-based chart animation, leveraging WebGPU's
 * low-overhead draw calls for smooth 60 fps transitions.
 *
 * Two independent animation tracks:
 *  1. **Enter animation** – progress goes 0 → 1 once when `ready` becomes true.
 *  2. **Per-series visibility** – each series smoothly transitions between
 *     0 (hidden) and 1 (visible) when `hiddenSeries` changes.
 *
 * `renderFn` is stored in a ref and called on every rAF tick; it always
 * captures the latest React closure without causing extra re-renders.
 *
 * @returns `drawOnce` – call after data/layout changes to commit one static
 *          frame when no animation is running.
 */
export function useChartAnimation(
	seriesCount: number,
	hiddenSeries: ReadonlySet<number>,
	ready: boolean,
	renderFn: RenderFn,
	duration = DEFAULT_DURATION,
	enabled = true,
): { drawOnce: () => void } {
	// ---- refs -------------------------------------------------------
	const renderRef = useRef<RenderFn>(renderFn);
	renderRef.current = renderFn;

	const rafRef = useRef(0);
	const animatingRef = useRef(false);
	const durationRef = useRef(duration);
	durationRef.current = duration;

	const hasEnteredRef = useRef(false);

	// Enter
	const enterStartRef = useRef(0);
	const enterProgressRef = useRef(enabled ? 0 : 1);

	// Visibility per series
	const visCurrentRef = useRef<number[]>([]);
	const visFromRef = useRef<number[]>([]);
	const visToRef = useRef<number[]>([]);
	const visStartTimeRef = useRef(0);
	const seriesCountRef = useRef(seriesCount);
	seriesCountRef.current = seriesCount;

	// Resize visibility arrays when series count changes
	if (visCurrentRef.current.length !== seriesCount) {
		const prev = visCurrentRef.current;
		visCurrentRef.current = Array.from({ length: seriesCount }, (_, i) =>
			i < prev.length ? (prev[i] ?? 1) : hiddenSeries.has(i) ? 0 : 1,
		);
		visFromRef.current = visCurrentRef.current.slice();
		visToRef.current = visCurrentRef.current.slice();
	}

	// ---- animation loop ---------------------------------------------
	const startLoop = useCallback(() => {
		if (animatingRef.current) return;
		animatingRef.current = true;

		const tick = () => {
			const now = performance.now();
			const dur = durationRef.current;
			let allDone = true;

			// --- enter track ---
			if (enterProgressRef.current < 1) {
				const t = Math.max(0, (now - enterStartRef.current) / dur);
				enterProgressRef.current = Math.min(1, easeOutCubic(t));
				if (enterProgressRef.current < 1) allDone = false;
			}

			// --- visibility track ---
			const visT = Math.min(1, easeOutCubic(Math.max(0, (now - visStartTimeRef.current) / dur)));
			const count = seriesCountRef.current;
			for (let i = 0; i < count; i++) {
				const from = visFromRef.current[i] ?? 1;
				const to = visToRef.current[i] ?? 1;
				if (Math.abs(from - to) < 0.001) {
					visCurrentRef.current[i] = to;
				} else {
					const val = from + (to - from) * visT;
					if (Math.abs(val - to) < 0.001) {
						visCurrentRef.current[i] = to;
					} else {
						visCurrentRef.current[i] = val;
						allDone = false;
					}
				}
			}

			// --- draw ---
			renderRef.current(enterProgressRef.current, visCurrentRef.current);

			if (allDone) {
				animatingRef.current = false;
				return;
			}

			rafRef.current = requestAnimationFrame(tick);
		};

		rafRef.current = requestAnimationFrame(tick);
	}, []);

	// ---- enter trigger ----------------------------------------------
	useEffect(() => {
		if (!ready) return;
		if (!hasEnteredRef.current && enabled) {
			hasEnteredRef.current = true;
			enterStartRef.current = performance.now();
			enterProgressRef.current = 0;
			startLoop();
		} else {
			// Resize / animation-disabled → draw one static frame
			enterProgressRef.current = 1;
		}
	}, [ready, enabled, startLoop]);

	// ---- visibility toggle trigger ----------------------------------
	const prevHiddenRef = useRef<ReadonlySet<number> | null>(null);
	useEffect(() => {
		if (!ready) return;
		// First invocation – just store the reference
		if (prevHiddenRef.current === null) {
			prevHiddenRef.current = hiddenSeries;
			return;
		}
		if (prevHiddenRef.current === hiddenSeries) return;
		prevHiddenRef.current = hiddenSeries;

		visFromRef.current = visCurrentRef.current.slice();
		const count = seriesCountRef.current;
		for (let i = 0; i < count; i++) {
			visToRef.current[i] = hiddenSeries.has(i) ? 0 : 1;
		}
		visStartTimeRef.current = performance.now();

		if (enabled) {
			startLoop();
		} else {
			for (let i = 0; i < count; i++) {
				visCurrentRef.current[i] = visToRef.current[i]!;
			}
			renderRef.current(enterProgressRef.current, visCurrentRef.current);
		}
	}, [hiddenSeries, ready, enabled, startLoop]);

	// ---- cleanup ----------------------------------------------------
	useEffect(
		() => () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			animatingRef.current = false;
		},
		[],
	);

	// ---- public API -------------------------------------------------
	const drawOnce = useCallback(() => {
		renderRef.current(enterProgressRef.current, visCurrentRef.current);
	}, []);

	return { drawOnce };
}
