/**
 * Development server using Bun's built-in bundler and HTTP server.
 * No Vite dependency.
 */

const PORT = 3000;

const _server = Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Serve index.html for root
		if (pathname === "/" || pathname === "/index.html") {
			const html = await Bun.file("sample/index.html").text();
			return new Response(html, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		// Handle .tsx / .ts files – bundle on the fly
		if (pathname.endsWith(".tsx") || pathname.endsWith(".ts")) {
			const filePath = `sample${pathname}`;
			try {
				const result = await Bun.build({
					entrypoints: [filePath],
					target: "browser",
					format: "esm",
					minify: false,
					sourcemap: "inline",
					define: {
						"process.env.NODE_ENV": '"development"',
					},
				});

				if (!result.success) {
					console.error("Build errors:", result.logs);
					return new Response(`Build failed:\n${result.logs.join("\n")}`, {
						status: 500,
						headers: { "Content-Type": "text/plain" },
					});
				}

				const output = result.outputs[0];
				if (!output) {
					return new Response("No output", { status: 500 });
				}
				const text = await output.text();
				return new Response(text, {
					headers: { "Content-Type": "application/javascript; charset=utf-8" },
				});
			} catch (e) {
				console.error(e);
				return new Response(String(e), { status: 500 });
			}
		}

		// Static files
		const file = Bun.file(`sample${pathname}`);
		if (await file.exists()) {
			return new Response(file);
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`🚀 Dev server running at http://localhost:${PORT}`);
