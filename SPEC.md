# 習格uploader 仕様書

キントーンの KDI/KBI マネジメントアプリにスクリーンショットを自動登録する Chrome 拡張機能。

- **対象ドメイン**: astecpaint.cybozu.com
- **最新ソース**: `C:\dev\shukakulog\dev`
- **GitHub**: https://github.com/tsu-umemoto/shukaku-uploader.git
- **最新バージョン**: v2.5（クリップボード貼り付け機能 追加）

---

## 認証方式

セッション認証（Cookie）+ CSRF トークン方式。

- ログイン済み Cookie をそのまま利用してキントーン API を呼び出す
- CSRF トークンは `chrome.scripting.executeScript({ world: "MAIN" })` でページコンテキストの `kintone.getRequestToken()` を実行して取得する
- `world: "MAIN"` 指定が必須（拡張のサンドボックスからは `kintone` グローバルが見えないため）

---

## 処理フロー

1. ポップアップ起動 → 認証情報（従業員番号）を確認、未設定なら設定画面へ誘導
2. アプリ選択タブを生成（前回選択を `chrome.storage.local` に記憶）
3. 画像を取得（次のいずれか）
   - **撮り直し**: `chrome.tabs.captureVisibleTab()` で現在タブをキャプチャ
   - **クリップボード貼り付け**（v2.5〜）: `navigator.clipboard.read()` で画像を取得
4. 実施日・項目・説明を入力 → 「キントーンに登録」
5. 当月レコードを検索 → 画像をアップロード → サブテーブルに行追加（PUT）

---

## 対応アプリ一覧（DCO版）

| アプリ名 | アプリID | 従業員番号Field | 項目Field | 証拠Field |
|---|---|---|---|---|
| 職遂 / Work | 841 | Lookup | T | Attachment_7 |
| 目標 / KPI | 821 | Lookup_0 | L | Attachment_9 |
| AI / Intelli | 989 | Lookup_1 | T | Attachment_1 |
| 改善 / Kaizen | 1068 | Lookup_0 | T | Attachment_7 |
| 教育 / Training | 826 | Lookup_0 | T | Attachment_7 |
| 協力 / Teamwork | 827 | Lookup_0 | T | Attachment_8 |
| 感謝 / Thanks | 593 | Lookup_0 | Tilte | Attachment_7 |
| 環境 / 5S | 828 | Lookup_1 | S | Attachment_7 |
| 方針 / Policy | 829 | Lookup_1 | P | Attachment_7 |

> 「感謝 / Thanks」の項目Fieldは `Tilte`（綴り誤りがそのままフィールドコードになっている点に注意）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 拡張定義（MV3）。権限・バックグラウンド・ポップアップ |
| `popup.html` / `popup.js` | メイン UI と登録ロジック |
| `apps.js` | アプリ別フィールド設定（`APP_CONFIG`） |
| `background.js` | キントーン API 呼び出し・CSRF トークン取得 |
| `options.html` / `options.js` | 従業員番号などの設定画面 |

### 主要権限（manifest）
`activeTab`, `tabs`, `storage`, `scripting`, `clipboardRead`（v2.5〜）

---

## バージョン履歴

| Ver | 内容 |
|---|---|
| v2.1 | 認証方式確立（Basic→Cookie→world:MAIN）で動作確認 |
| v2.4 | フィールドコード修正・デザイン刷新・全9アプリ対応・セキュリティ対応・名称変更。課員へ配布 |
| **v2.5** | **クリップボード貼り付け機能（パターンA）+ よく使う項目の強調機能を追加** |

---

## 技術的ポイント（詰まった箇所と解決策）

| 課題 | 解決策 |
|---|---|
| Basic認証が組織ポリシーで無効 | Cookie（セッション）認証に変更 |
| `content.js` のキャッシュ問題 | `chrome.scripting.executeScript()` 方式に変更 |
| CSRF トークン取得失敗 | `world: "MAIN"` 指定で解決 |
| フィールドコードが不明 | `/k/v1/app/form/fields.json` API で一括取得 |

---

## 今後の対応（保留事項）

- **GS部対応**（スペース `/k/#/space/4`）: 7月の kintone 刷新後に改めて対応
- 配布物のZIPファイル名・解凍フォルダ名は英語固定（例: `shukaku-uploader-v2.5`）

---

## v2.5 追加機能: クリップボード貼り付け（パターンA）

`popup.html` の「撮り直し」ボタンの下に「📋 クリップボードから貼り付け」ボタンを追加。

- Win+Shift+S 等でコピーした画像を `navigator.clipboard.read()` で読み取り
- 取得 blob を dataURL 化 → プレビュー表示 → そのまま登録に使用
- 画像が無い場合・読取失敗時はアラートで通知
- プレビューラベルを「現在のタブ」/「クリップボード画像」で動的切替
- `register()` は `screenshotDataUrl` を参照するだけなので追加変更なしで動作

## v2.5 追加機能: よく使う項目の強調（手動設定）

プルダウンの項目が多く選びにくいため、お気に入り項目を先頭にまとめて表示する。

- **設定画面**（`options.html` / `options.js`）に「★ よく使う項目」カードを追加
  - アプリを選択 → そのアプリの選択肢をチェックボックスで一覧表示（静的になければ `fields.json` API で動的取得）
  - チェックして保存 → `chrome.storage.local` の `favorites: { [appId]: [option, ...] }` に格納
- **ポップアップ**（`popup.js` の `switchApp`）でプルダウンを `optgroup` で2分割
  - 先頭に「★ よく使う」グループ（保存済みお気に入り）
  - その下に「すべて」グループ（全選択肢）
  - お気に入り未設定のアプリは従来通りフラット表示
- `select` の option は太字/色がブラウザ依存で効かないため、`optgroup` で位置を上げる方式を採用
