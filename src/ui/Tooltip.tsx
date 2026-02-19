import type { TooltipConfig, TooltipInfo } from "../types.ts";

interface TooltipOverlayProps {
	info: TooltipInfo | null;
	config?: TooltipConfig;
	containerRect: DOMRect | null;
}

export function TooltipOverlay({ info, config, containerRect }: TooltipOverlayProps) {
	if (!info || config?.enabled === false || !containerRect) return null;

	// Custom renderer
	if (config?.render) {
		return (
			<div
				style={{
					position: "absolute",
					left: info.x + 12,
					top: info.y - 8,
					pointerEvents: "none",
					zIndex: 1000,
				}}
			>
				{config.render(info)}
			</div>
		);
	}

	// Default tooltip
	return (
		<div
			style={{
				position: "absolute",
				left: info.x + 12,
				top: info.y - 8,
				pointerEvents: "none",
				zIndex: 1000,
				background: "rgba(0,0,0,0.8)",
				color: "#fff",
				padding: "6px 10px",
				borderRadius: "4px",
				fontSize: "12px",
				fontFamily:
					'"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Helvetica Neue", "Segoe UI", "Yu Gothic UI", "Yu Gothic", sans-serif',
				whiteSpace: "nowrap",
				boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
				<span
					style={{
						display: "inline-block",
						width: 10,
						height: 10,
						borderRadius: "50%",
						backgroundColor: info.color,
					}}
				/>
				<strong>{info.seriesName}</strong>
			</div>
			<div>
				{info.label}: {info.value}
			</div>
		</div>
	);
}
