// Tutorial content: an illustrated explainer + context tips shown during a guided practice game.
export const PAGES = [
  { title: 'ゲームの目的', cards: ['if-u'],
    body: ['音ゲーの曲を「課題曲」にして、サイコロとカードでスコアを競う対戦ゲームです。', '課題曲は1戦で最大5曲。**先に3曲**スコアで勝った方が勝利です。', 'サイコロ運だけでなく、カードの使い方と「何を温存するか」が勝負を分けます。'] },
  { title: 'デッキ', cards: ['hikari', 'ph-combo', 'if-u'],
    body: ['デッキは3種類のカードでできています。', '**キャラ5枚 + スキル20枚** (同じスキルは2枚まで) が山札になり、**譜面10枚**は別の山札になります。', '機種カード(最大3枚)で使える譜面の機種が決まり、**得意譜面傾向**を1つ宣言します。'] },
  { title: '1曲の流れ', cards: [],
    body: ['① 課題曲が決まる (選んだ人が**先攻**)。', '② 自分のターン: 手札から**最大2枚**カードを使える (使わなくてもOK)。', '③ ターンの最後に**サイコロ**を振る。両者が終わったら**全員が1枚ドロー**して、②③を**もう1ラウンド**くり返す (1曲=2ラウンド)。', '④ スコア = 2ラウンド分のサイコロの出目 + カードなどの加点の**合計**。高い方が課題曲を獲得。', '⑤ 曲が終わるたびに、山札から最大2枚引ける。(山札が尽きると負けるので引きすぎ注意!)'] },
  { title: 'カードの種類', cards: ['hikari', 'ph-combo', 'if-u'],
    body: ['**キャラ**: 場に出すと、その対戦中ずっと残って効果を発揮します。', '**スキル**: 使うと墓地に行く使い切りの効果です。', '**譜面**: 課題曲になるカード。曲ごとに独自の効果があります。', 'どのカードも1ターンに使える枚数(標準2枚)に数えます。'] },
  { title: '得意傾向ボーナス', cards: [],
    body: ['課題曲には傾向(NOTES / PEAK / TECH …)があります。', 'デッキで宣言した**得意傾向と一致**すると、その曲のスコア＋1。', '両プレイヤーが同じ傾向を選んでいると、一致したとき**＋2ずつ**。'] },
  { title: '操作方法', cards: [],
    body: ['**手札**は画面の下から顔を出しています。マウスを乗せると持ち上がります。', 'カードを**2回タップ(クリック)**するか、**上にドラッグ**すると使えます。', 'ターンの終わりは「サイコロを振って終了」。', '**キーボード**: ←→↑↓で移動、Enter / Spaceで決定、Escで戻る。対戦中は 1〜9 で手札を選択、**E**でターン終了(サイコロ)、**L**でログ。',
    '右下の📜でログ、🔊で音量を変えられます。', 'それでは練習対戦で試してみましょう！ (やさしいCPUが相手です)'] },
];

// Context tips for the guided game. First matching, not-yet-seen tip is shown.
// target: CSS selector to highlight.  v = sanitized view, me = my seat.
export const TIPS = [
  { id: 'roll', when: (v, me) => v.phase === 'rolloff' && v.players[me].rolled == null, target: '.actionp .pri',
    text: 'まず**サイコロを振って**、最初に課題曲を選ぶ人を決めます。大きい目を出した方が先に選曲します。' },
  { id: 'task', when: (v) => v.phase === 'song' && v.song, target: '.center > div:first-child',
    text: '左が今回の**課題曲**です。選曲した人から先にターンが始まります。曲ごとに傾向と効果があります。' },
  { id: 'hand', when: (v, me) => v.phase === 'song' && v.cur === me && v.stage === 'main' && !v.prompt, target: '.hand',
    text: '画面下に**あなたの手札**があります。マウスを乗せると持ち上がります。**2回タップ**か**上へドラッグ**で使えます。キャラは場に残り、スキルは使い切りです。' },
  { id: 'limit', when: (v, me, seen) => seen.hand && v.phase === 'song' && v.cur === me && v.stage === 'main' && v.song.plays[me] >= 1 && !v.prompt, target: '.actionp',
    text: 'カードは**1ターンに最大2枚**まで、1曲は2ラウンド(合計4枚まで)です。右の「カード使用」で残りが分かります。どの2枚を使うか考えましょう。' },
  { id: 'end', when: (v, me, seen) => seen.hand && v.phase === 'song' && v.cur === me && v.stage === 'main' && !v.prompt && (v.song.plays[me] >= 2 || seen.limit), target: '.actionp button:last-child',
    text: '使いたいカードを使い終えたら**「サイコロを振って終了」**。出目がスコアに加算されます。' },
  { id: 'opp', when: (v, me) => v.phase === 'song' && v.cur !== me, target: '.pbar',
    text: '相手のターンです。使われたカードは画面中央に表示され、スコアの内訳が**中央のスコア欄**に増えていきます。' },
  { id: 'result', when: (v) => v.phase === 'draw' && v.lastResult, target: '.score',
    text: '両者のターンが終わるとスコアを比べ、**高い方が課題曲を獲得**します。「得意傾向」の＋1もここに入ります。' },
  { id: 'draw', when: (v, me) => v.phase === 'draw' && v.drawAns[me] == null, target: '.actionp',
    text: '曲が終わったら**山札から引く枚数**(0〜2)を選びます。引きすぎると山札が尽きて負けるので、山札の残り枚数にも注意しましょう。' },
  { id: 'sudden', when: (v) => v.phase === 'song' && v.song?.sudden, target: '.center > div:first-child',
    text: '**サドンデス**です！ 2-2になると最終曲は全譜面からランダムに選ばれます。ここを取った方の勝ち。' },
  { id: 'over', when: (v) => v.phase === 'over', target: null,
    text: '対戦終了！ これで一通りの流れは分かりました。デッキ構築で自分だけのデッキを作ってみましょう。' },
];
