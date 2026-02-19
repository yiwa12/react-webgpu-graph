/**
 * WebGPU renderer – manages device, pipeline, and draw calls for chart primitives.
 *
 * Design:
 *  - All chart primitives (rects, lines, circles) are batched into a single
 *    vertex buffer and drawn in one draw call per frame for maximum throughput.
 *  - Text / axes / legends are rendered via a 2D canvas overlay (Canvas2D is
 *    the pragmatic choice for text; WebGPU text rendering requires an atlas).
 */

// ============================================================
// Vertex layout:  position(x,y)  color(r,g,b,a)   → 6 floats
// ============================================================
const FLOATS_PER_VERTEX = 6;

// ============================================================
// Shader source (WGSL)
// ============================================================
const SHADER_SOURCE = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) position: vec2f, @location(1) color: vec4f) -> VSOut {
  var out: VSOut;
  out.pos = vec4f(position, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(@location(0) color: vec4f) -> @location(0) vec4f {
  return color;
}
`;

// ============================================================
// Color parsing helper
// ============================================================
function parseColor(css: string): [number, number, number, number] {
	// Use an offscreen canvas to let the browser parse any CSS color string.
	if (typeof OffscreenCanvas !== "undefined") {
		const c = new OffscreenCanvas(1, 1);
		const ctx = c.getContext("2d")!;
		ctx.fillStyle = css;
		ctx.fillRect(0, 0, 1, 1);
		const d = ctx.getImageData(0, 0, 1, 1).data;
		return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255, (d[3] ?? 0) / 255];
	}
	// Fallback: simple hex
	const hex = css.replace("#", "");
	if (hex.length === 6) {
		return [
			Number.parseInt(hex.slice(0, 2), 16) / 255,
			Number.parseInt(hex.slice(2, 4), 16) / 255,
			Number.parseInt(hex.slice(4, 6), 16) / 255,
			1,
		];
	}
	return [0.5, 0.5, 0.5, 1];
}

// ============================================================
// Public types
// ============================================================
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
}

export interface Line {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	width?: number;
}

export interface Circle {
	cx: number;
	cy: number;
	r: number;
	color: string;
	segments?: number;
}

// ============================================================
// GPU Renderer class
// ============================================================
export class GPURenderer {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private pipeline: GPURenderPipeline | null = null;
	private format: GPUTextureFormat = "bgra8unorm";
	private canvas: HTMLCanvasElement | null = null;
	private _ready = false;

	// MSAA
	private readonly sampleCount = 4;
	private msaaTexture: GPUTexture | null = null;
	private msaaView: GPUTextureView | null = null;
	private msaaWidth = 0;
	private msaaHeight = 0;

	get ready(): boolean {
		return this._ready;
	}

	async init(canvas: HTMLCanvasElement): Promise<boolean> {
		if (!navigator.gpu) {
			console.warn("WebGPU not supported");
			return false;
		}
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			console.warn("No GPU adapter found");
			return false;
		}
		this.device = await adapter.requestDevice();
		this.context = canvas.getContext("webgpu") as GPUCanvasContext;
		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: "premultiplied",
		});
		this.canvas = canvas;

		const module = this.device.createShaderModule({ code: SHADER_SOURCE });

		this.pipeline = this.device.createRenderPipeline({
			layout: "auto",
			vertex: {
				module,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: FLOATS_PER_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x2" },
							{ shaderLocation: 1, offset: 8, format: "float32x4" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
							alpha: {
								srcFactor: "one",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
						},
					},
				],
			},
			primitive: { topology: "triangle-list" },
			multisample: { count: this.sampleCount },
		});

		this._ready = true;
		return true;
	}

	/**
	 * Render a frame. All primitives are converted to triangles and drawn at once.
	 * When `clipRect` is provided the draw calls are clipped to that pixel rectangle
	 * (useful for zoomed charts where geometry may exceed the plot area).
	 */
	draw(
		rects: Rect[],
		lines: Line[],
		circles: Circle[],
		bgColor: [number, number, number, number] = [1, 1, 1, 1],
		clipRect?: { x: number; y: number; width: number; height: number },
	): void {
		if (!this.device || !this.context || !this.pipeline || !this.canvas) return;

		const w = this.canvas.width;
		const h = this.canvas.height;

		// Helpers to convert pixel coords → NDC (-1..1)
		const nx = (px: number) => (px / w) * 2 - 1;
		const ny = (py: number) => 1 - (py / h) * 2; // flip Y

		const verts: number[] = [];

		const pushTri = (
			x0: number,
			y0: number,
			x1: number,
			y1: number,
			x2: number,
			y2: number,
			c: [number, number, number, number],
		) => {
			verts.push(x0, y0, c[0], c[1], c[2], c[3]);
			verts.push(x1, y1, c[0], c[1], c[2], c[3]);
			verts.push(x2, y2, c[0], c[1], c[2], c[3]);
		};

		// --- Rects → 2 triangles each ---
		for (const r of rects) {
			const c = parseColor(r.color);
			const x0 = nx(r.x);
			const y0 = ny(r.y);
			const x1 = nx(r.x + r.w);
			const y1 = ny(r.y + r.h);
			pushTri(x0, y0, x1, y0, x0, y1, c);
			pushTri(x1, y0, x1, y1, x0, y1, c);
		}

		// --- Lines → thin quads ---
		for (const l of lines) {
			const c = parseColor(l.color);
			const lw = (l.width ?? 1) / 2;
			const dx = l.x2 - l.x1;
			const dy = l.y2 - l.y1;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const px = (-dy / len) * lw;
			const py = (dx / len) * lw;

			const ax = nx(l.x1 + px),
				ay = ny(l.y1 + py);
			const bx = nx(l.x1 - px),
				by = ny(l.y1 - py);
			const cx = nx(l.x2 - px),
				cy = ny(l.y2 - py);
			const ex = nx(l.x2 + px),
				ey = ny(l.y2 + py);

			pushTri(ax, ay, bx, by, cx, cy, c);
			pushTri(ax, ay, ex, ey, cx, cy, c);
		}

		// --- Circles → triangle fans ---
		for (const ci of circles) {
			const c = parseColor(ci.color);
			const seg = ci.segments ?? 24;
			const cxN = nx(ci.cx);
			const cyN = ny(ci.cy);
			for (let i = 0; i < seg; i++) {
				const a0 = (i / seg) * Math.PI * 2;
				const a1 = ((i + 1) / seg) * Math.PI * 2;
				pushTri(
					cxN,
					cyN,
					nx(ci.cx + Math.cos(a0) * ci.r),
					ny(ci.cy + Math.sin(a0) * ci.r),
					nx(ci.cx + Math.cos(a1) * ci.r),
					ny(ci.cy + Math.sin(a1) * ci.r),
					c,
				);
			}
		}

		// Ensure the MSAA texture matches the current canvas size
		this.ensureMsaaTexture(w, h);

		const resolveTarget = this.context.getCurrentTexture().createView();

		if (verts.length === 0) {
			// Just clear
			const encoder = this.device.createCommandEncoder();
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: this.msaaView!,
						resolveTarget,
						clearValue: { r: bgColor[0], g: bgColor[1], b: bgColor[2], a: bgColor[3] },
						loadOp: "clear",
						storeOp: "discard",
					},
				],
			});
			pass.end();
			this.device.queue.submit([encoder.finish()]);
			return;
		}

		const data = new Float32Array(verts);
		const vertexBuffer = this.device.createBuffer({
			size: data.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(vertexBuffer, 0, data);

		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.msaaView!,
					resolveTarget,
					clearValue: { r: bgColor[0], g: bgColor[1], b: bgColor[2], a: bgColor[3] },
					loadOp: "clear",
					storeOp: "discard",
				},
			],
		});
		pass.setPipeline(this.pipeline);
		if (clipRect) {
			const cx = Math.max(0, Math.round(clipRect.x));
			const cy = Math.max(0, Math.round(clipRect.y));
			const cw = Math.min(w - cx, Math.round(clipRect.width));
			const ch = Math.min(h - cy, Math.round(clipRect.height));
			if (cw > 0 && ch > 0) {
				pass.setScissorRect(cx, cy, cw, ch);
			}
		}
		pass.setVertexBuffer(0, vertexBuffer);
		pass.draw(data.length / FLOATS_PER_VERTEX);
		pass.end();

		this.device.queue.submit([encoder.finish()]);
		vertexBuffer.destroy();
	}

	/**
	 * Create or recreate the MSAA render-target texture when the canvas size changes.
	 */
	private ensureMsaaTexture(width: number, height: number): void {
		if (!this.device) return;
		if (this.msaaTexture && this.msaaWidth === width && this.msaaHeight === height) return;

		this.msaaTexture?.destroy();
		this.msaaTexture = this.device.createTexture({
			size: { width, height },
			format: this.format,
			sampleCount: this.sampleCount,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.msaaView = this.msaaTexture.createView();
		this.msaaWidth = width;
		this.msaaHeight = height;
	}

	destroy(): void {
		this.msaaTexture?.destroy();
		this.msaaTexture = null;
		this.msaaView = null;
		this.device?.destroy();
		this.device = null;
		this.context = null;
		this.pipeline = null;
		this._ready = false;
	}
}
