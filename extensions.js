// page-transition の拡張。必要なものだけ pageTransition({ use: [...] }) に渡す。
// 拡張は次の関数を持つ(どれも任意)ただのオブジェクトなので、プロジェクト固有のものも同じ形で書いて use に並べればよい。
//   ignore(url, link)                    … true を返した遷移は通常どおりにする(url: URL、link: 押したリンク。分からなければ null)
//   start({ url, navigationType })       … 遷移を始めたとき(navigationType: 'push' / 'replace' / 'traverse'(戻る・進む))
//   beforeSwap({ url, doc, page })       … 差し替える前。Promise を返すと待つ。false(を返す Promise)で通常の読み込みに切り替える
//   afterSwap({ url, doc, page })        … 差し替えたあと(init より前)
// doc は取得したページの Document、page は差し替える container の要素(beforeSwap ではまだ文書に入っていない)

// すぐ表示する画像(loading="lazy" でないもの)の読み込みを、ms を上限に待ってから差し替える(画像が抜けた状態を見せない)
export const waitImages = (ms = 300) => ({
  beforeSwap: ({ page }) => Promise.race([
    Promise.all([...page.querySelectorAll('img[src]:not([loading="lazy"])')].map((img) => img.decode().catch(() => {}))),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]),
});

// 今のページで読み込んでいない CSS・JS(container の外のもの)を使うページは、通常の読み込みに切り替える
// (デプロイで CSS・JS の版が変わったとき・そのページだけで読み込むプラグインがあるときなど)
export const reloadOnNewAssets = () => {
  const selector = 'link[rel="stylesheet"], script[src]';
  const urls = (root) => new Set([...root.querySelectorAll(selector)].map((el) => el.getAttribute('href') ?? el.getAttribute('src')));

  return {
    beforeSwap: ({ doc, page }) => {
      const loaded = urls(document);
      const inPage = urls(page); // 差し替える中のもの(埋め込みコードなど)は対象外
      const hasNew = [...urls(doc)].some((url) => !loaded.has(url) && !inPage.has(url));
      return hasNew ? false : undefined;
    },
  };
};

// body のクラスを移り先のものにする(ページごとのクラスでスタイルを変えているとき)。keep に挙げたクラス(JS が付けたものなど)は残す
export const bodyClass = ({ keep = [] } = {}) => ({
  afterSwap: ({ doc }) => {
    const kept = keep.filter((name) => document.body.classList.contains(name));
    document.body.className = doc.body.className;
    document.body.classList.add(...kept);
  },
});

// 差し替えた中の script(埋め込みコードなど)を実行する(取り込んだ script はそのままでは実行されないので作り直す)
export const runScripts = () => ({
  afterSwap: ({ page }) => {
    for (const old of page.querySelectorAll('script')) {
      const script = document.createElement('script');
      for (const { name, value } of old.attributes) script.setAttribute(name, value);
      script.text = old.text;
      old.replaceWith(script);
    }
  },
});

// WordPress 用。管理画面・ログイン・REST API・アップロードファイルへの遷移は通常どおりにし、
// ログイン中の管理バー(編集リンクがページごとに変わる)を移り先のものに差し替える。差し替えたものは CSS だけでメニューが開くよう nojs にする
export const wordpress = () => ({
  ignore: (url) => /\/wp-(admin|login|content|includes|json)/.test(url.pathname),
  afterSwap: ({ doc }) => {
    const bar = document.querySelector('#wpadminbar');
    const nextBar = doc.querySelector('#wpadminbar');
    if (!bar || !nextBar) return;

    nextBar.classList.add('nojs');
    bar.replaceWith(document.importNode(nextBar, true));
  },
});
