# 公開仕様の調査と実装境界

確認日: **2026-09-15**。公式サイト・公式技術文書・公式 GitHub を一次情報として確認した。以下は仕様の転載ではなく、Patchlight の設計判断のための要約である。

## 結論

**MESH の BLE/GATT 通信仕様は公開されている。** ボタンなどの実機を公式アプリを介さず操作するための情報と JavaScript ライブラリがある。一方、公開資料から公式アプリ全体の互換実装が成立するとは判断できない。Patchlight は、入力・処理・出力を線でつなぐ考え方を学ぶ、独自のブラウザ教材として実装する。[公式技術仕様の目的](https://developer.meshprj.com/hc/ja/articles/8286280277273)

## 1. 何が公開されているか

| 層 | 公開されている内容 | Patchlight の扱い |
| --- | --- | --- |
| 製品の考え方 | センサー・スイッチなどを組み合わせて仕組みを作る体験 | 入力→処理→出力という考え方を、独自の画面・作品・教材で体験する |
| MESH ブロックの通信仕様 | 発見情報、GATT、接続手順、コマンドフレーム、共通操作、7 種のブロック固有操作 | 調査・将来の実機接続の根拠。初期公開版は通信を行わない |
| MESH.js | ブロックとの通信データを扱う公式 TypeScript / JavaScript ライブラリと API 資料 | 初期公開版の依存には加えない |
| MESH SDK | 公式アプリに追加するカスタムソフトウェアブロックの作成方法、設定、メソッド | SDK 互換コード実行環境は実装しない |
| 公式アプリ全体 | 上記 SDK の局所的な実行規則は公開。アプリ全体のソース、完全な実行仕様、レシピ交換形式の安定した公開仕様は今回の資料では確認できない | 独自のグラフ形式と実行規則を明記する。公式レシピの読み書き・動作一致を約束しない |

出典: [製品紹介](https://meshprj.com/jp/)、[通信仕様一覧](https://developer.meshprj.com/hc/ja/sections/8286186030105)、[MESH.js](https://github.com/MESHprj/MESH.js)、[SDK 紹介](https://meshprj.com/jp/sdk/)、[SDK 設定](https://developer.meshprj.com/hc/ja/articles/53137230210201)、[SDK コード](https://developer.meshprj.com/hc/ja/articles/53139721859865)。

「今回確認できない」は「絶対に公開されていない」という断定ではない。新しい一次情報が見つかった場合は、この境界を更新する。

## 2. BLE/GATT の公開範囲

公開仕様の適用対象は **ブロックソフトウェア 1.2.5 以上**。通信は BLE 4.0。製品の名前が MESH であることから Bluetooth Mesh ネットワーク規格の実装を推定しない。[通信仕様概要](https://developer.meshprj.com/hc/ja/articles/8286360648089)

公開されている GATT 識別子は次のとおり。これは参照情報であり、Patchlight のシミュレーターはこのサービスを広告・接続・エミュレートしない。

| 役割 | UUID |
| --- | --- |
| Primary Service | `72c90001-57a9-4d40-b746-534e22ec9f9e` |
| Write | `72c90004-57a9-4d40-b746-534e22ec9f9e` |
| Write Without Response | `72c90002-57a9-4d40-b746-534e22ec9f9e` |
| Indicate | `72c90005-57a9-4d40-b746-534e22ec9f9e` |
| Notify | `72c90003-57a9-4d40-b746-534e22ec9f9e` |

機能ごとに別サービスを設ける構成ではなく、操作・通知の種類で特性を使い分ける。発見時の名前・種別 ID・製造者データも記載されている。[通信仕様概要](https://developer.meshprj.com/hc/ja/articles/8286360648089)

さらに以下の情報まで公開されている。

- **フレーム**: ヘッダ・データ・チェックサム、最大 20 バイト、リトルエンディアン、総和の下位 1 バイトによるチェックサム。公開範囲では分割フレームを使わない。[コマンドフレーム](https://developer.meshprj.com/hc/ja/articles/9951447433241)
- **初期接続**: Indicate / Notify の有効化、基本情報受信、ブロック機能の有効化。ボンディング不要。更新中のブロックは対象外。[接続方法](https://developer.meshprj.com/hc/ja/articles/8286377144729)
- **共通機能**: ステータスバー、機能の有効化、応答要求、電源オフ、電池残量・アイコンイベント・基本情報の通知。[全ブロック共通](https://developer.meshprj.com/hc/ja/articles/8286379681945)
- **ファームウェア準備**: バージョン確認と更新は公式アプリで行う手順がある。Patchlight は更新機構を実装しない。[バージョンについて](https://developer.meshprj.com/hc/ja/articles/9950635230873)

## 3. 7 種類の実機と、教材としての抽象化

この表の「公開機能」は各公式仕様の要約。「教材で扱う考え方」は Patchlight の独自設計であり、実機精度・判定アルゴリズム・通知周期の再現を意味しない。実装済みのブロックと操作は [README](../README.md) を参照。

| 実機の種類 | 公開機能の例 | 教材で扱う考え方 |
| --- | --- | --- |
| [ボタン / BU](https://developer.meshprj.com/hc/ja/articles/8286402535577) | 1 回押し・長押し・2 回押しのイベント | 画面で押すとイベントが流れる |
| [LED / LE](https://developer.meshprj.com/hc/ja/articles/9231602345497) | RGB 強度、点灯時間・サイクル・パターンの指示 | 受け取ったイベントで画面の光が変わる |
| [動き / AC](https://developer.meshprj.com/hc/ja/articles/8286418941977) | タップ・シェイク・フリップ・向きのイベント、加速度値の解釈 | 画面操作で動きのイベントを作る |
| [人感 / MD](https://developer.meshprj.com/hc/ja/articles/8286408492057) | 検知状態と通知モード・保持時間などの設定 | 人の動きがきっかけになる仕組みを試す |
| [明るさ / PA](https://developer.meshprj.com/hc/ja/articles/8286460847897) | 照度・近接センサー、状態通知・通知モード | 明るさを変えて条件を試す |
| [温度・湿度 / TH](https://developer.meshprj.com/hc/ja/articles/8286425847961) | 温湿度値、範囲・条件・通知モード | 数値入力を変え、条件とのつながりを見る |
| [GPIO / GP](https://developer.meshprj.com/hc/ja/articles/8286477623961) | デジタル入出力、アナログ入力、PWM・電源出力など | 仮想入出力の因果関係を試す。電気回路の解析は行わない |

シミュレーターのスライダー範囲、しきい値、反応時間、色、音、画面効果は教材用の設定である。実測値、実機のセンサー校正値、公式アプリ内部の変換式とは扱わない。画面上の人感入力は在室の実測ではなく、GPIO の表示は配線の安全性を検証するものではない。

## 4. MESH SDK と MESH.js は別のもの

### MESH SDK

公式アプリに取り込むカスタムソフトウェアブロックをブラウザで作る仕組み。コネクター、プロパティ、`Initialize` / `Receive` / `Execute` / `Result`、処理の続行・停止・一時停止、メッセージと状態、スケジューラーの説明が公開されている。したがって「実行規則が一切公開されていない」という説明は正しくない。[SDK 設定](https://developer.meshprj.com/hc/ja/articles/53137230210201)、[SDK コード](https://developer.meshprj.com/hc/ja/articles/53139721859865)

2026-09-15 に公式紹介ページを開き、SDK 起動リンクが [サインイン画面](https://meshprj.com/signin/) に到達することを確認した。紹介は登録者向けベータ版である。**アカウント登録承認、ログイン後の作成・配信・公式アプリへの取り込みまでは検証していない。** 公開文書の存在とサービス全体の動作確認を区別する。[SDK 紹介と利用手順](https://meshprj.com/jp/sdk/)

Patchlight は SDK へのサインインを要求せず、SDK スクリプトを読み込まず、任意 JavaScript を実行する機能を設けない。

### MESH.js

公式 Node.js ガイドでは BLE 接続に `@abandonware/noble`、通信データの変換に MESH.js を使う。ライブラリそのものと BLE の接続層は別である。Node.js 向けサンプルがあることだけを根拠に、全ブラウザの Web Bluetooth 動作保証を導かない。[公式 Node.js ガイド](https://developer.meshprj.com/hc/ja/articles/9156078954649)、[公式 API 文書](https://meshprj.github.io/MESH.js/)

確認した `main` のコミットは `0f65ff4e8d6d5791db242fbd0be9064d110ab078`。`LICENSE` 本文は MIT、著作権表示は `©2022 Sony Marketing Inc.`。これは MESH.js に対するライセンスであり、公式アプリ・SDK サービス・サイト素材全体が MIT であるという意味ではない。[固定コミットの LICENSE](https://github.com/MESHprj/MESH.js/blob/0f65ff4e8d6d5791db242fbd0be9064d110ab078/LICENSE)

## 5. 公開資料からは実装を正当化できない範囲

調査対象は技術仕様全 11 記事、SDK の設定・コード・利用案内、MESH.js の README / API / LICENSE、製品サイトである。この範囲では次を確立できないため実装しない。

- 公式レシピファイルの互換読み込み・書き出し、未公開 API へのアクセス。
- 公式アプリの全実行順序、競合・並行・ループ・バックグラウンド処理の完全再現。
- 公式 SDK カスタムブロックの完全互換実行と公式クラウド連携の代替。
- センサー判定の内部アルゴリズム、実機の物理挙動、未記載のコマンド・予約領域の推定。
- 仮想 BLE ペリフェラルとして実機を装い、公式アプリを接続させる機能。

公式技術仕様には、公開目的が実機の操作であり、互換品・代替品の作成や製造を目的とするものではないという注意もある。この記載を踏まえ、プロジェクトは独自教材と、将来の実機操作用アダプターに範囲を限定する。法的に実装全般が許可されたとの解釈はしていない。[公開目的・利用条件](https://developer.meshprj.com/hc/ja/articles/8286280277273)

## 6. 任意の追加フェーズ: 実機入力アダプター

**この公開版には実機接続機能を含めない。** 次の追加フェーズは、公式仕様に沿って所有者の実機を操作する Web Bluetooth アダプターにする。教材の実行エンジンから接続・デコードを分離し、仮想入力と実機入力を画面に明示する。

追加時の順序と完了条件:

1. **対象をボタン 1 台に限定。** 公開仕様・対象 firmware・採用するライブラリのコミットとライセンスを固定する。公開された例と異常フレームによる単体テストを作る。
2. **ユーザーの接続操作から開始。** Web Bluetooth の有無と secure context を確認し、ブラウザのデバイス選択を使う。拒否・キャンセル・タイムアウトを扱う。Chrome の公式文書は secure context とユーザー操作を要件にしている。[Chrome 公式 Web Bluetooth ガイド](https://developer.chrome.com/docs/capabilities/bluetooth)
3. **公式接続シーケンスを実装。** 通知・通告の購読、基本情報の検証、機能の有効化の順を守る。未知のフレームを機能へ推測変換せず、実行を止めて診断可能にする。[公式接続方法](https://developer.meshprj.com/hc/ja/articles/8286377144729)
4. **実機で確認。** OS、ブラウザ版、型番、firmware、再接続、電源断、通知数と操作の対応を記録する。公開する記録ではシリアル番号などの個体情報を除く。モックテストだけで「実機対応済み」としない。
5. **検証済みの型番・機能だけ追加。** LED は出力停止と切断時処理も確認する。各センサー・GPIO・複数台の同時使用は独立して検証し、対応表に未検証を残す。再接続時は GATT のサービス・特性を取り直す。[Chrome 公式ガイドの切断処理](https://developer.chrome.com/docs/capabilities/bluetooth)

ブラウザの対応差はこの任意機能の中で扱い、実機なしの体験が接続許可や Bluetooth 対応に依存しない構造を維持する。

## 7. 出典のライセンスと帰属

公式技術仕様の**文書は CC BY 4.0、画像・イラストは CC BY-ND 4.0** と明示されている。本稿は技術情報を短く要約して設計判断を加えた。公式図版・スクリーンショット・ロゴは同梱せず、参照元の文書を Patchlight の MIT として再配布しない。[公式ライセンス記載](https://developer.meshprj.com/hc/ja/articles/8286280277273)

公式の指定に従う参照元表記:

> Original document by Sony Marketing Inc., is licensed under CC BY 4.0.

[原文: MESH 技術ドキュメント](https://developer.meshprj.com) / [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

参照文書の要約と独自の実装判断を区別し、上記の出典リンクを保持する。商標表記と公開時の説明は [TRADEMARKS.md](TRADEMARKS.md) を参照。
