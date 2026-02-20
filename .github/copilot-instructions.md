# react-webgpu-graph — Copilot 開発ガイド

## プロジェクト概要

WebGPU を用いた高パフォーマンスな React チャートコンポーネントライブラリ。  
GPU で図形（矩形・線・円）を描画し、Canvas 2D オーバーレイでテキスト（軸ラベル・凡例・タイトル）を描画する二層構造を採用する。

---

## 技術スタック

| 項目 | 技術 |
|---|---|
| ランタイム | Bun |
| 言語 | TypeScript (strict モード) |
| UI フレームワーク | React 19 |
| レンダリング | WebGPU (GPU 図形) + Canvas 2D (テキスト) |
| リンター / フォーマッター | Biome |
| 型チェック | `bunx tsc --noEmit` |
| リント | `bunx biome lint .` |
| 開発サーバー | `bun --hot run sample/server.ts` (Bun 内蔵バンドラー使用、Vite 不要) |

---

## ディレクトリ構成

```
src/
├── charts/              # チャートコンポーネント
│   ├── BarChart.tsx        # 棒グラフ (縦/横対応)
│   ├── StackedBarChart.tsx # 積み上げ棒グラフ (縦/横対応)
│   ├── LineChart.tsx       # 折れ線グラフ
│   ├── ScatterChart.tsx    # 散布図
│   ├── CompositeChart.tsx  # 複合チャート (複数種重ね描き)
│   └── TimelineChart.tsx   # タイムラインチャート (ガントチャート風)
├── rendering/           # 描画エンジン
│   ├── gpu-renderer.ts     # WebGPU レンダラー (パイプライン・描画コール管理)
│   ├── canvas-overlay.ts   # Canvas 2D テキスト描画 (軸・凡例・タイトル)
│   └── use-webgpu.ts       # GPURenderer ライフサイクル管理フック
├── ui/                  # UI 部品・フック
│   ├── Tooltip.tsx         # ツールチップコンポーネント
│   ├── use-chart-animation.ts  # アニメーション駆動フック
│   └── use-chart-zoom.ts      # ズーム/パン操作フック
├── types.ts             # 全型定義
├── utils.ts             # レイアウト計算・ティック計算・マッピング等ユーティリティ
└── index.ts             # 公開 API エクスポート
sample/
├── App.tsx              # 全チャートの使用例 (8 タブ)
├── main.tsx             # エントリーポイント
├── index.html           # HTML テンプレート
└── server.ts            # 開発サーバー (Bun.serve)
```

---

## アーキテクチャ

### 二層レンダリング

```
┌─────────────────────────────────────┐
│  Canvas 2D オーバーレイ (テキスト)    │  ← pointerEvents: "none"
├─────────────────────────────────────┤
│  WebGPU Canvas (図形)               │  ← GPU レンダリング
└─────────────────────────────────────┘
```

- **WebGPU 層**: 矩形 (Rect)・線 (Line)・円 (Circle) を GPU プリミティブとしてバッチ描画。1 draw call で全図形を処理。
- **Canvas 2D 層**: テキスト描画（軸ラベル、タイトル、凡例）を担当。WebGPU でのテキストはグリフアトラス生成が必要なため、Canvas 2D で実用的に解決している。

### GPU レンダラー仕様 (`gpu-renderer.ts`)

- **頂点フォーマット**: `position(float32x2) + color(float32x4)` = 6 floats / 頂点 (24 bytes stride)
- **MSAA**: sampleCount = 4
- **ブレンドモード**: src-alpha / one-minus-src-alpha (半透明対応)
- **シェーダー**: WGSL。座標は CPU 側で NDC (-1..1) に変換済み
- **プリミティブ展開**:
  - `Rect` → 2 三角形
  - `Line` → 法線ベクトルによる幅付きクワッド (2 三角形)
  - `Circle` → triangle-fan (24 セグメント)
- **clipRect**: ズーム時にプロットエリアへのシザーレクトクリップを適用

### 共通フックパターン (TimelineChart を除く全チャート共通)

```
1. useWebGPU(width, height)           → GPU レンダラー取得
2. useChartZoom(layout)               → ズーム/パン状態管理
3. useChartAnimation(config)          → アニメーション駆動 (renderRef パターン)
4. renderFrame(enterProgress, seriesVis)  → GPU プリミティブ生成
5. Canvas 2D オーバーレイ描画              → 軸・凡例・テキスト
6. マウスイベント                          → ツールチップ + 凡例クリック + ズーム操作
```

### renderRef パターン

`useChartAnimation` は `renderFn` を `useRef` に格納し、`requestAnimationFrame` ループ内で毎フレーム最新のクロージャを呼び出す。  
これにより不要な React 再レンダーを回避しつつ、常に最新の state/props を参照できる。

---

## チャートコンポーネント仕様

### 共通 Props (`BaseChartProps`)

| Prop | 型 | デフォルト | 説明 |
|---|---|---|---|
| `width` | `number` | `400` | キャンバス幅 (px) |
| `height` | `number` | `300` | キャンバス高さ (px) |
| `backgroundColor` | `Color` | `"#ffffff"` | 背景色 |
| `xAxis` / `yAxis` | `AxisConfig` | - | 軸設定 (タイトル, 色, min/max, tickCount) |
| `legend` | `LegendConfig` | - | 凡例 (位置, 色, フォントサイズ) |
| `tooltip` | `TooltipConfig` | - | ツールチップ (有効/無効, カスタムレンダー) |
| `animation` | `AnimationConfig` | `{ enabled: true, duration: 600 }` | アニメーション設定 |
| `padding` | `[T, R, B, L]` | `[20, 20, 20, 20]` | 外側パディング |

### BarChart

- **追加 Props**: `labels: string[]`, `datasets: BarDataset[]`, `orientation?: "vertical" | "horizontal"`
- **GPU 描画**: 各棒を Rect として描画。バー幅 = `groupWidth * 0.7 / seriesCount`
- **静的プロパティ**: `BarChart.chartType = "bar"` (CompositeChart が種別判定に使用)

### StackedBarChart

- **BarChart との違い**: 全系列で 1 本のバーを共有し累積描画。バー幅 = `groupWidth * 0.7`
- **値範囲**: 常に 0 〜 各カテゴリの合計最大値
- **静的プロパティ**: `StackedBarChart.chartType = "stacked-bar"`

### LineChart

- **追加データセットプロパティ**: `lineWidth` (デフォルト 2), `showPoints` (デフォルト true), `pointRadius` (デフォルト 4)
- **GPU 描画**: 線 = Line プリミティブ (幅付きクワッド)、点 = Circle プリミティブ (24-gon)
- **データ範囲**: 0 を強制的に含めない (BarChart とは異なる)

### ScatterChart

- **特徴**: 両軸が値軸 (カテゴリ軸なし)。データは `{ x, y }[]`
- **GPU 描画**: Circle プリミティブ。`pointRadius` デフォルト 4

### CompositeChart

- **目的**: 複数チャート種 (Bar, StackedBar, Line, Scatter) をレイヤーとして重ねて描画
- **Props**: `width`, `height` は必須。`sharedAxes` で軸共有モードを指定
- **軸共有モード**:
  - `"x"` (デフォルト): X 軸共有、Y 軸独立 (左=primary, 右=secondary)
  - `"y"`: Y 軸共有、X 軸独立 (下=primary, 上=secondary)
  - `"both"`: 全軸共有
- **子要素の処理**: `React.Children.forEach` + `(child.type as { chartType? }).chartType` で種別判定
- **バースロット**: 複数 Bar/StackedBar レイヤーが正しく並置されるよう `totalBarSlots` を算出

### TimelineChart

- **他チャートとの違い**: 独自構造。`useChartZoom` 不使用
- **Y 軸**: リサイズ可能な列テーブル (タスク名, 開始, 終了, 進捗)
  - 列幅はドラッグで変更可能 (最小 30px)
  - `onColumnWidthsChange` コールバックで親へ通知
- **X 軸**: プロットエリア**上部**に配置
- **表示単位** (`unit`):
  - `"time"`: 自動ティック (1秒〜1日の候補から最適間隔選択)
  - `"day"`: 3 段表示 (YYYY年MM月 / DD / 曜日)。日=赤、土=青
  - `"week"`: 2 段 (YYYY年MM月 / 週番号)
  - `"month"`: 2 段 (YYYY年 / MM月)
- **週末ティント**: `unit === "day"` 時、土日の列を `rgba(255, 230, 230, 0.3)` で着色 (GPU Rect、バーの背面に描画)
- **プログレスバー**: タスクバー上に `darkenColor(factor=0.35)` で進捗部分を重ね描き

---

## ズーム/パン機能 (`use-chart-zoom.ts`)

**対象**: TimelineChart 以外の全チャート

### 操作方法

| マウス操作 | 動作 |
|---|---|
| 左ドラッグ | 範囲選択ズーム (方向ロック: 最初の 5px 移動で X/Y 決定) |
| 左マウスアップ | 選択範囲にズーム (8px 未満は無視) |
| 右ドラッグ | パン (ズーム中のみ、[0,1] にクランプ) |
| 左ダブルクリック | ズームリセット |
| 右クリック | プロットエリア内はコンテキストメニュー抑制 |

### 内部状態

- **`ZoomRange`**: `{ xMin, xMax, yMin, yMax }` — 0〜1 の分数でデータ範囲の表示部分を表現。`NO_ZOOM = { 0, 1, 0, 1 }`
- **`SelectionRect`**: ピクセル単位の選択矩形。半透明オーバーレイ `rgba(128, 128, 128, 0.3)` で表示

### 主要関数

- **`applyZoom(dataMin, dataMax, axis)`**: データ範囲にズーム分数を適用し、新しい `{ min, max }` を返す (値軸用)
- **`getEffectivePlot(axis)`**: カテゴリ軸の仮想プロットエリアを算出 (`plotWidth / (xMax - xMin)` で拡大)
- **`clipRect`**: ズーム時に GPU の `setScissorRect` でプロットエリアにクリップ

---

## アニメーション (`use-chart-animation.ts`)

### 2 トラック構成

1. **Enter アニメーション**: `ready` → `progress: 0 → 1` (初期表示時)
2. **Series visibility**: `hiddenSeries` 変更で各系列を `0 ↔ 1` でスムーズ遷移 (凡例クリック時)

### 設定

- デフォルト duration: `600ms`
- イージング: `easeOutCubic(t) = 1 - (1-t)³`
- `enabled` デフォルト: `true`

---

## 凡例

- **位置**: `"top"` | `"bottom"` | `{ type: "float", x, y }` (フロート配置)
- **クリック**: 系列の表示/非表示トグル (`hiddenSeries: Set<number>`)
- **非表示表示**: スウォッチに対角線 + テキスト打ち消し線 + 半透明

---

## ツールチップ

- `position: absolute` で `left: x+12, top: y-8` に配置
- `pointerEvents: "none"` でマウスイベント透過
- **ヒット判定**: BarChart/StackedBarChart は `hitRectsRef` (矩形)、LineChart/ScatterChart は `hitPointsRef` (距離ベース)
- **カスタムレンダー**: `tooltip.render` に `(info: TooltipInfo) => ReactNode` を指定可能

---

## レイアウト計算 (`utils.ts`)

### `computeLayout`

通常チャート用。Y ラベル幅 = `50 + (hasYTitle ? 20 : 0)`、X ラベル高さ = `30 + (hasXTitle ? 20 : 0)`。  
戻り値: `ChartLayout { canvasWidth, canvasHeight, plotX, plotY, plotWidth, plotHeight }`

### `computeCompositeLayout`

複合チャート用。`sharedAxes` に応じて secondary 軸用のスペース (`rightExtra`, `topExtra`) を確保。

### `computeTicks(dataMin, dataMax, axis?, tickCountHint=6)`

「nice」ティック値を計算。ステップは `1, 2, 5, 10` の倍数に丸め。`axis.min` / `axis.max` でオーバーライド可能。  
戻り値: `{ min, max, ticks: number[] }`

### `mapValue(value, dataMin, dataMax, pixelStart, pixelLength)`

データ値をピクセル位置にリニアマッピング。

---

## フォント設定

```
"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans",
"Helvetica Neue", "Segoe UI", "Yu Gothic UI", "Yu Gothic", sans-serif
```

- 通常テキスト: `12px`
- タイトル: `13px`
- ツールチップ: `12px`

---

## カラーパレット

デフォルト 10 色 (Tableau 10 系):

```
#4e79a7, #f28e2b, #e15759, #76b7b2, #59a14f,
#edc948, #b07aa1, #ff9da7, #9c755f, #bab0ac
```

色指定は CSS カラー文字列 (hex, rgb, hsl, named) を受け付ける。  
内部では `parseColor` で RGBA に変換 (`OffscreenCanvas` ベース、フォールバックは hex 解析)。

---

## コーディング規約

### Biome 設定

- **インデント**: タブ (幅 2)
- **行幅**: 100 文字
- **クオート**: ダブルクオート
- **セミコロン**: 必須
- **非 null アサーション**: 許可 (`noNonNullAssertion: off`)
- **未使用変数**: 警告 (エラーではない)
- **a11y**: `noStaticElementInteractions`, `useKeyWithClickEvents` は無効化

### TypeScript 設定

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `jsx: react-jsx`
- `module: Preserve` / `moduleResolution: bundler`
- `verbatimModuleSyntax: true` (型インポートには `import type` を使用すること)

### 品質チェックコマンド

```bash
bunx tsc --noEmit     # 型チェック
bunx biome lint .     # リント
bunx biome check --write .  # リント + フォーマット自動修正
```

---

## 開発サーバー

```bash
bun run dev   # → bun --hot run sample/server.ts (ポート 3000)
```

Bun 内蔵の HTTP サーバーとバンドラーを使用。`.tsx` / `.ts` ファイルへのリクエストはオンザフライでバンドルされる。  
HMR: `--hot` フラグによる Bun ネイティブのホットリロード。

---

## 新しいチャートを追加する際のチェックリスト

1. `src/charts/NewChart.tsx` を作成
2. 必要な型を `src/types.ts` に追加
3. `src/index.ts` にコンポーネントと型をエクスポート
4. ズーム対応の場合は `useChartZoom` を統合
5. `CompositeChart` に組み込む場合は `static chartType` を定義し、`CompositeChart.tsx` の `extractLayers` に対応を追加
6. `sample/App.tsx` に使用例を追加
7. `bunx tsc --noEmit` と `bunx biome lint .` で検証

