import { useCallback, useEffect, useRef, useState } from "react";
import { GPURenderer } from "./gpu-renderer.ts";

/**
 * React hook that manages a GPURenderer lifecycle tied to a canvas element.
 */
export function useWebGPU(width: number, height: number) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<GPURenderer | null>(null);
	const [ready, setReady] = useState(false);
	const [fallback, setFallback] = useState(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		canvas.width = width;
		canvas.height = height;

		const renderer = new GPURenderer();
		rendererRef.current = renderer;

		renderer.init(canvas).then((ok) => {
			if (ok) {
				setReady(true);
			} else {
				setFallback(true);
			}
		});

		return () => {
			renderer.destroy();
			rendererRef.current = null;
			setReady(false);
		};
	}, [width, height]);

	const getRenderer = useCallback(() => rendererRef.current, []);

	return { canvasRef, ready, fallback, getRenderer };
}
