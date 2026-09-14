# 名前・商標・ライセンスの扱い

確認日: **2026-09-15**。

## プロジェクト名

名称は **Patchlight**。公開リポジトリ名は `patchlight` とし、Sony や MESH をプロジェクト名、ドメインの中心となる名前、ロゴに含めない。

説明では、参照する製品を特定するために必要な箇所に通常の文字で MESH と記載し、独立したプロジェクトであることを近くに表示する。公式のロゴ、製品写真、アプリのアイコン・スクリーンショットを独自 UI の素材として使用しない。これは本プロジェクトの表示方針であり、世界各国の商標登録を網羅調査した結果ではない。

公式サイトは MESH をソニーの商標または登録商標と説明し、外部リンクの存在が推奨・提携を意味しないことも記載している。[MESH ウェブサイト利用規約](https://support.meshprj.com/hc/ja/articles/360052353073)

## 公開時に採用する説明

### 日本語

> Patchlight は、入力・処理・出力のブロックをつないで遊ぶ、独立したオープンソースのブラウザ教材です。MESH の公開情報を参考に、実機を持たずに仕組みづくりを体験できるよう設計しています。ソニーによる提供・認定・提携を受けた製品ではありません。MESH はソニーの商標または登録商標です。

### English

> Patchlight is an independent, open-source browser playground for connecting input, logic, and output blocks. Informed by public information about MESH, it lets people explore making interactive systems without hardware. It is not provided, endorsed, or affiliated with Sony. MESH is a trademark or registered trademark of Sony.

README の対象範囲には、公式アプリのレシピや SDK カスタムブロックとの互換性を提供しないことも記載する。画面では短い独立性の表記からこの文書へリンクし、体験の導入を長い説明で遮らない。

## 「互換」「対応」の使い分け

| 現在の根拠 | 使用する説明 |
| --- | --- |
| 独自の仮想ブロックで遊べる | 「ブロックをつないで学ぶブラウザ教材」「実機不要のプレイグラウンド」 |
| 公開技術情報を調査した | 「MESH の公開情報を参考にした独立プロジェクト」 |
| 将来、特定の実機・機能を検証した | 「MESH ボタンブロックの入力に対応（検証した型番・firmware・ブラウザを併記）」 |
| 完全な動作一致や公式認定の根拠がない | 「完全互換」「公式エミュレータ」「認定済み」とは表示しない |

技術文書では必要な製品名・型番を正確に書く。一般名への置き換えで出典や検証対象を曖昧にしない。将来の接続対応は、公式アプリの完全互換とは別の項目として説明する。

## ライセンスの境界

- **Patchlight の独自コード・独自 UI 素材・独自サンプル:** リポジトリの MIT ライセンスで提供する。第三者のコードや作品を将来取り込む際は、その時点で条件を確認し帰属表示を追加する。[MIT ライセンス原文](https://opensource.org/license/mit)
- **MESH.js:** 公式リポジトリの `LICENSE` 本文で MIT、`©2022 Sony Marketing Inc.` を確認した。現版ではコードを取り込んでいない。将来コピー・改変・同梱するなら、適用される著作権・許諾表示を保持する。[確認した LICENSE](https://github.com/MESHprj/MESH.js/blob/0f65ff4e8d6d5791db242fbd0be9064d110ab078/LICENSE)
- **公式技術仕様:** 文書は CC BY 4.0、画像は CC BY-ND 4.0。調査文書に出典と指定の帰属表示を残す。画像は取り込まない。SDK・公式アプリ・サイト全体の MIT ライセンスを意味しない。[公式条件](https://developer.meshprj.com/hc/ja/articles/8286280277273)、[本リポジトリの帰属表示](PUBLIC-SPEC.md#7-出典のライセンスと帰属)
- **公式レシピ投稿:** 公式サイトの利用規約には投稿の CC BY-SA 4.0 条件がある。サンプル集に公式投稿を無条件にコピーせず、Patchlight 用の独自サンプルを作る。[レシピ投稿の条件](https://support.meshprj.com/hc/ja/articles/360052353073)

MIT はソフトウェアの利用許諾であり、第三者のブランドを公式表示として使う根拠にはしない。公開文書へのリンクや帰属表示から、権利者による推奨を示唆しない。[MIT 本文](https://opensource.org/license/mit)、[CC BY 4.0 の帰属条件](https://creativecommons.org/licenses/by/4.0/)

この文書は公開物の表示・素材管理方針であり、個別案件の法的判断を保証するものではない。
