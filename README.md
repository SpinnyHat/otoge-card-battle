# Rhythm Card Battle

音ゲー × カードバトル。ブラウザだけで動く 1v1 対戦カードゲーム (将来 4 人対応予定)。ビルド不要の静的サイトなので GitHub Pages にそのまま置けます。

## 遊ぶ / 開発
```
./serve.sh                      # ES modules なので file:// では動きません
# → http://localhost:8000  (0.0.0.0 ではなく localhost で開く)
node test/engine.test.mjs       # CPU同士で500戦、デッドロック/不正手が無いか
node test/host.test.mjs         # ロビー〜対戦〜再接続のプロトコル
node test/cards.test.mjs        # スライドのカードがテキスト通りに動くか (カードごとのシナリオ)
node test/fuzz.test.mjs         # 全カードからランダムにデッキを組んで800戦 (効果のクラッシュ/固まり検出)
node test/ai.test.mjs           # CPUの強さの順序
node test/assets.test.mjs       # 画像の著作権ガード (許可リスト)
node test/balance.mjs 200000    # カードごとの勝率への影響レポート (調整用。合否判定ではない)
```
デバッグ用: `#demo=3` (CPU戦を即開始し自分の手を3手自動プレイ) / `#page=library&tab=skill` / `#room=ABCDE` (参加画面)

## GitHub Pages
Settings → Pages → Deploy from branch → `main` / root。

## 構成
| ファイル | 役割 |
|---|---|
| `js/cards.js` | **カードデータ** (ここに足すだけで図鑑・デッキ構築に出ます)。`placeholder:true` は仮カード |
| `js/effects.js` | 効果の動詞 (score / draw / discard / chooseDie …)。カード効果は `when` + `ops` の宣言的データ |
| `js/engine.js` | ルール本体 (`RULES` で枚数・勝利数などを調整)。純粋ロジック、ホストだけが動かす |
| `js/host.js` | 部屋・席・ロビー・CPU。非公開情報は `viewFor()` で席ごとに隠して配信 |
| `js/net.js` | PeerJS (WebRTC) 接続。ルームコード = Peer ID |
| `js/fx.js` | 効果音 (WebAudio合成、音声ファイル無し) と演出 (バナー・ダイス・カード登場)。新しい演出はここ。`onView(prev, view)` が状態の差分から鳴らす |
| `js/ui.js`, `js/card.js`, `css/` | 画面とカード描画 |

## ネットワークの注意
- 接続の仲介 (シグナリング) は PeerJS の公開サーバー、対戦中の通信は P2P。ホストが落ちると部屋は消えます。
- STUNのみでTURNは無いので、厳しいNAT/企業ネットワークでは繋がらないことがあります。必要なら `net.js` の `ICE` に TURN を追加。
- ホストが全ルールを判定する方式なので、改造したホストなら不正は可能です (友達内対戦向け)。

## バランス調整メモ
`test/balance.mjs` は「つよいCPU同士・ランダムデッキ」で各カードを入れた時の勝率差を出します。目安は ±3% 以内、一部だけ+4〜5%の「強カード」を意図的に残しています (救xi / 一xi合xi / メンダコ / 光 / 粘着)。
調整済み: 緊張しいの子(仮)、フルコンボ(仮)、一xi合xi (使用後このターンカード使用不可)、ダイス系キャラは場に出した次の曲から。

## 未実装 / 次の候補
進化カード、ゴママヨ抑止の無効化、Black Market Blues の効果、`negate` / `putTopBottom` / `skipTask` / `addTendency` 操作、3〜4人対戦のUI、機種カードの固有効果。

## 著作権について
- ゲームの**公式ロゴ・楽曲ジャケット・スクリーンショットは使用不可**です。許可のあるイラスト(東雲つむぎ / ぬいぬいグレイス / コナステ / QQ / 皆伝 など、オーナーが許可したもの)だけを `assets/art/` に置き、`assets/art/allowed.json` に登録してください。
- `node test/assets.test.mjs` が未登録の画像を検出します。
- 画像のないカードは自動生成のプレースホルダー画像になります (例: Black Market Blues は公式ジャケットを外しました)。
- カード名・楽曲名・機種名などの「テキスト」はそのまま使っています。
