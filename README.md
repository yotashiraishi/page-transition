# page-transition

ふつうのマークアップのサイトに足すだけで、サイト内の遷移をページの読み込み直しなしにする小さなライブラリ(依存なし・ES モジュール・本体は圧縮して約2.5KB / gzip 約1.2KB)。
次のページの HTML を取得し、`<main>`(指定可)だけを差し替える。CSS・JS・フォントは読み込み直さない。

- ブラウザの [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API) で遷移を受け取るので、URL・戻る/進む・スクロール位置・フォーカスはブラウザがふつうの遷移と同じように扱う
- リンクにマウスを乗せた(指を置いた)時点で先読みし、取得したページはしばらく取っておく(戻る・進むは通信なし)
- リンクはふつうの `<a href>` のまま。JS が動かない・Navigation API の無いブラウザ・取得に失敗したときは、通常の遷移になる

本体([index.js](index.js))はこれだけ。画像の読み込み待ち・body のクラスの更新などは、必要なものだけ拡張([extensions.js](extensions.js))で足す。

対応: Chrome / Edge 102+、Safari 26.2+、Firefox 147+(それ以外は通常の遷移)。

## 入れ方

マークアップはそのままでよい。

**npm で入れる**(バンドラーを使うプロジェクト)。`#v0.1.0` の部分で版を固定する。

```bash
npm install github:yotashiraishi/page-transition#v0.1.0
```

```js
import { pageTransition } from 'page-transition';
import { waitImages } from 'page-transition/extensions';

pageTransition();
```

**ファイルを置く**(バンドラーなしのサイト)。`index.js`(と、使うなら `extensions.js`)をサイトに置き、読み込む。

```html
<script type="module">
  import { pageTransition } from '/js/page-transition/index.js';
  pageTransition();
</script>
```

## 使い方

差し替えるのは、どのページにも1つずつある `<main>`。ヘッダーの「いま表示中」の印などもページごとに替えたいときは、ヘッダーと本文を囲む要素を指定する。
ページを替えても残すもの(モーダルなど)はその外に置く。

```html
<body>
  <div data-page>
    <header>…</header>
    <main>…</main>
  </div>
  <div class="modal">…</div>
</body>
```

```js
import { pageTransition } from './page-transition/index.js';
import { waitImages, bodyClass } from './page-transition/extensions.js';

pageTransition({
  container: '[data-page]',
  init(root) {
    // ページごとに動かす処理はここに書く。root の中だけを対象にする(最初は document.body、以後は差し替えた要素)
    const timer = setInterval(tick, 1000);
    // ページを離れても残るもの(タイマー・window へのリスナーなど)は、止める関数を返す
    return () => clearInterval(timer);
  },
  use: [waitImages(300), bodyClass({ keep: ['is-init'] })],
});
```

- `DOMContentLoaded` で動かしていた処理は、差し替えたページでは動かない。`init` に移す
- `init` の中で `document` 全体を探すと、差し替えていない要素にも二重にかかる。必ず `root` から探す
- JS から移るときは、ふつうに `location.href = url` か `navigation.navigate(url)` でよい(同じように差し替わる)

## オプション

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `container` | `'main'` | 差し替える要素のセレクタ |
| `init` | なし | ページに各機能をかける関数。後始末の関数を返すと、次のページへ移る前に呼ばれる |
| `prefetch` | `80` | マウスを乗せて(指を置いて)から先読みするまでの時間(ms)。`false` で先読みしない |
| `cacheTime` | `300000` | 取得したページを使い回す時間(ms) |
| `cacheSize` | `30` | 取っておくページ数の上限 |
| `use` | `[]` | 拡張の配列。並べた順に呼ばれる |

返り値は `{ prefetch(url) }`。JS から先読みしたいときに使う。

## 拡張

### 同梱のもの([extensions.js](extensions.js))

| 名前 | 内容 |
| --- | --- |
| `waitImages(ms)` | すぐ表示する画像の読み込みを、最大 ms 待ってから差し替える |
| `reloadOnNewAssets()` | 今のページで読み込んでいない CSS・JS を使うページ(デプロイ後など)は通常の読み込みにする |
| `bodyClass({ keep })` | body のクラスを移り先のものにする。`keep` のクラスは残す |
| `runScripts()` | 差し替えた中の `<script>`(埋め込みコードなど)を実行する |
| `wordpress()` | 管理画面・アップロードファイルなどへの遷移は通常どおりにし、管理バーを差し替える |

### 自分で書く

拡張は次の関数を持つ(どれも任意)ただのオブジェクト。`use` に並べるだけで使える。

| 関数 | 呼ばれるとき |
| --- | --- |
| `ignore(url, link)` | 遷移の前・先読みの前。`true` を返すと通常の遷移にする(`url`: URL、`link`: 押したリンク。分からなければ `null`) |
| `start({ url, navigationType })` | 遷移を始めたとき(`navigationType`: `'push'` / `'replace'` / `'traverse'`(戻る・進む)) |
| `beforeSwap({ url, doc, page })` | 差し替える前。Promise を返すと待つ。`false` を返すと通常の読み込みにする |
| `afterSwap({ url, doc, page })` | 差し替えたあと(`init` より前) |

`doc` は取得したページの Document、`page` は差し替える要素。

```js
// 例: 遷移のたびにアクセス解析へページビューを送る
const analytics = {
  afterSwap: ({ url }) => gtag('event', 'page_view', { page_location: url, page_title: document.title }),
};

// 例: data-no-transition を付けたリンクは通常の遷移にする
const noTransition = {
  ignore: (url, link) => link?.hasAttribute('data-no-transition'),
};

pageTransition({ use: [analytics, noTransition] });
```

## 動作の要点

- 差し替えるのは、同じオリジンのページへの遷移(リンク・`location.href` の代入・GET のフォーム・戻る/進む)。同じページの中(アンカー)・ダウンロード・POST のフォーム・再読み込み・ファイル(拡張子付き。`.html` `.htm` `.php` は除く)への遷移は通常どおり
- 別タブで開く操作(`target="_blank"`・修飾キー付きクリック)や、ほかの処理が `preventDefault()` したクリック(拡大表示など)には触らない
- 移り先がリダイレクトする・HTML でない・container が無いときは、通常の読み込みに切り替わる
- 最初のページは `init` で書き換える前の HTML を取っておくので、戻ってきたときも通信しない
- 先読みは優先度を下げて取得する(画像などの読み込みを邪魔しない)。データセーバー時はしない
