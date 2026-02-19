import { useState } from "react";
import {
	BarChart,
	CompositeChart,
	LineChart,
	ScatterChart,
	StackedBarChart,
	TimelineChart,
} from "../src/index.ts";

type ChartTab =
	| "bar"
	| "barH"
	| "stacked"
	| "stackedH"
	| "line"
	| "scatter"
	| "composite"
	| "timeline";

export function App() {
	const [tab, setTab] = useState<ChartTab>("bar");

	const tabs: { key: ChartTab; label: string }[] = [
		{ key: "bar", label: "棒グラフ(縦)" },
		{ key: "barH", label: "棒グラフ(横)" },
		{ key: "stacked", label: "積み上げ(縦)" },
		{ key: "stackedH", label: "積み上げ(横)" },
		{ key: "line", label: "折れ線グラフ" },
		{ key: "scatter", label: "散布図" },
		{ key: "composite", label: "複合チャート" },
		{ key: "timeline", label: "タイムライン" },
	];

	return (
		<div style={{ fontFamily: "sans-serif", padding: 24 }}>
			<h1 style={{ fontSize: 22, marginBottom: 16 }}>react-webgpu-graph サンプル</h1>

			<div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
				{tabs.map((t) => (
					<button
						key={t.key}
						type="button"
						onClick={() => setTab(t.key)}
						style={{
							padding: "8px 16px",
							border: tab === t.key ? "2px solid #4e79a7" : "1px solid #ccc",
							borderRadius: 4,
							background: tab === t.key ? "#e8f0fe" : "#fff",
							cursor: "pointer",
							fontWeight: tab === t.key ? "bold" : "normal",
						}}
					>
						{t.label}
					</button>
				))}
			</div>

			<div style={{ background: "#fafafa", padding: 16, borderRadius: 8, display: "inline-block" }}>
				{tab === "bar" && <BarChartDemo />}
				{tab === "barH" && <BarChartHorizontalDemo />}
				{tab === "stacked" && <StackedBarChartDemo />}
				{tab === "stackedH" && <StackedBarChartHorizontalDemo />}
				{tab === "line" && <LineChartDemo />}
				{tab === "scatter" && <ScatterChartDemo />}
				{tab === "composite" && <CompositeChartDemo />}
				{tab === "timeline" && <TimelineChartDemo />}
			</div>
		</div>
	);
}

// ──────────────────────────────────────────
// Bar Chart (Vertical)
// ──────────────────────────────────────────
function BarChartDemo() {
	return (
		<BarChart
			width={700}
			height={400}
			labels={["1月", "2月", "3月", "4月", "5月", "6月"]}
			datasets={[
				{ label: "売上A", data: [120, 200, 150, 80, 70, 110] },
				{ label: "売上B", data: [90, 160, 130, 100, 40, 95], color: "#e15759" },
			]}
			xAxis={{ title: "月" }}
			yAxis={{ title: "売上 (万円)" }}
			legend={{ position: "top" }}
		/>
	);
}

// ──────────────────────────────────────────
// Bar Chart (Horizontal)
// ──────────────────────────────────────────
function BarChartHorizontalDemo() {
	return (
		<BarChart
			width={700}
			height={400}
			labels={["製品A", "製品B", "製品C", "製品D", "製品E"]}
			datasets={[
				{ label: "2024年", data: [300, 450, 200, 350, 180], color: "#4e79a7" },
				{ label: "2025年", data: [350, 420, 280, 300, 220], color: "#f28e2b" },
			]}
			orientation="horizontal"
			xAxis={{ title: "売上 (万円)" }}
			yAxis={{ title: "製品" }}
			legend={{ position: "bottom" }}
		/>
	);
}

// ──────────────────────────────────────────
// Stacked Bar Chart (Vertical)
// ──────────────────────────────────────────
function StackedBarChartDemo() {
	return (
		<StackedBarChart
			width={700}
			height={400}
			labels={["Q1", "Q2", "Q3", "Q4"]}
			datasets={[
				{ label: "国内", data: [200, 250, 180, 300] },
				{ label: "海外", data: [150, 180, 220, 200] },
				{ label: "オンライン", data: [80, 120, 160, 140] },
			]}
			xAxis={{ title: "四半期" }}
			yAxis={{ title: "売上 (万円)" }}
			legend={{ position: "top" }}
		/>
	);
}

// ──────────────────────────────────────────
// Stacked Bar Chart (Horizontal)
// ──────────────────────────────────────────
function StackedBarChartHorizontalDemo() {
	return (
		<StackedBarChart
			width={700}
			height={400}
			labels={["部門A", "部門B", "部門C"]}
			datasets={[
				{ label: "人件費", data: [500, 400, 350], color: "#e15759" },
				{ label: "設備費", data: [200, 300, 250], color: "#76b7b2" },
				{ label: "その他", data: [100, 150, 120], color: "#edc948" },
			]}
			orientation="horizontal"
			xAxis={{ title: "金額 (万円)" }}
			yAxis={{ title: "部門" }}
			legend={{ position: "bottom" }}
		/>
	);
}

// ──────────────────────────────────────────
// Line Chart
// ──────────────────────────────────────────
function LineChartDemo() {
	return (
		<LineChart
			width={700}
			height={400}
			labels={[
				"1月",
				"2月",
				"3月",
				"4月",
				"5月",
				"6月",
				"7月",
				"8月",
				"9月",
				"10月",
				"11月",
				"12月",
			]}
			datasets={[
				{
					label: "気温 (東京)",
					data: [5.2, 5.7, 8.7, 13.9, 18.2, 21.4, 25.0, 26.4, 22.8, 17.5, 12.1, 7.6],
					color: "#e15759",
				},
				{
					label: "気温 (札幌)",
					data: [-3.6, -3.1, 0.6, 7.1, 12.4, 16.7, 20.5, 22.3, 18.1, 11.8, 4.9, -0.9],
					color: "#4e79a7",
				},
			]}
			xAxis={{ title: "月" }}
			yAxis={{ title: "気温 (℃)" }}
			legend={{
				position: { type: "float", x: 520, y: 40 },
			}}
		/>
	);
}

// ──────────────────────────────────────────
// Scatter Chart
// ──────────────────────────────────────────
function ScatterChartDemo() {
	// Generate random data
	const genPoints = (cx: number, cy: number, n: number, spread: number) =>
		Array.from({ length: n }, () => ({
			x: cx + (Math.random() - 0.5) * spread,
			y: cy + (Math.random() - 0.5) * spread,
		}));

	return (
		<ScatterChart
			width={700}
			height={400}
			datasets={[
				{ label: "クラスタA", data: genPoints(30, 50, 40, 30), color: "#4e79a7" },
				{ label: "クラスタB", data: genPoints(70, 30, 40, 25), color: "#f28e2b" },
				{ label: "クラスタC", data: genPoints(50, 80, 30, 20), color: "#e15759" },
			]}
			xAxis={{ title: "X値" }}
			yAxis={{ title: "Y値" }}
			legend={{ position: "bottom" }}
		/>
	);
}

// ──────────────────────────────────────────
// Composite Chart (Bar + Line)
// ──────────────────────────────────────────
// ──────────────────────────────────────────
// Timeline Chart
// ──────────────────────────────────────────
function TimelineChartDemo() {
	const base = new Date(2026, 1, 1); // 2026-02-01
	const d = (offset: number) => {
		const dt = new Date(base);
		dt.setDate(dt.getDate() + offset);
		return dt;
	};

	return (
		<TimelineChart
			width={900}
			height={350}
			unit="day"
			items={[
				{ label: "要件定義", start: d(0), end: d(5), progress: 1.0, color: "#4e79a7" },
				{ label: "基本設計", start: d(3), end: d(10), progress: 0.8, color: "#f28e2b" },
				{ label: "詳細設計", start: d(8), end: d(15), progress: 0.5, color: "#e15759" },
				{ label: "実装", start: d(12), end: d(25), progress: 0.3, color: "#76b7b2" },
				{ label: "テスト", start: d(22), end: d(30), progress: 0.0, color: "#59a14f" },
				{ label: "リリース", start: d(28), end: d(32), progress: 0.0, color: "#edc948" },
			]}
			xAxis={{ title: "スケジュール" }}
			labelConfig={{ showStart: true, showEnd: true, showProgress: true, timeFormat: "MM/DD" }}
		/>
	);
}

// ──────────────────────────────────────────
// Composite Chart (Bar + Line)
// ──────────────────────────────────────────
function CompositeChartDemo() {
	const labels = ["1月", "2月", "3月", "4月", "5月", "6月"];

	return (
		<CompositeChart
			width={700}
			height={400}
			sharedAxes="x"
			yAxis={{ title: "売上 (万円)" }}
			yAxisSecondary={{ title: "成長率 (%)" }}
			xAxis={{ title: "月" }}
			legend={{ position: "top" }}
		>
			<BarChart
				labels={labels}
				datasets={[
					{ label: "売上A", data: [120, 200, 150, 80, 70, 110] },
					{ label: "売上B", data: [90, 160, 130, 100, 40, 95], color: "#f28e2b" },
				]}
			/>
			<LineChart
				labels={labels}
				datasets={[
					{
						label: "成長率",
						data: [5, 15, -8, 12, -5, 20],
						color: "#e15759",
						lineWidth: 3,
					},
				]}
			/>
		</CompositeChart>
	);
}
