// page-transition: サイト内の遷移を、ページを読み込み直さずに行う小さなライブラリ(依存なし・ES モジュール)。
// ブラウザの Navigation API で遷移を受け取り、次のページの HTML を取得して container の要素だけを差し替える。
// URL・戻る/進む・スクロール位置・フォーカス・取得中の遷移の取り消しはブラウザに任せる。
// リンクはふつうの <a href> のままなので、JS が動かない・Navigation API の無いブラウザ・取得に失敗したときは通常の遷移になる。
// 本体はこれだけ。画像の読み込み待ち・body のクラスの更新などは、use に渡す拡張で足す(extensions.js)。
// https://github.com/yotashiraishi/page-transition(使い方は README.md)
const defaults = {
  container: 'main', // 差し替える要素のセレクタ。どのページにも1つずつある要素にする(ヘッダーごと替えたいときは、それを囲む要素に data-page などを付けて指定する)
  init: () => {}, // ページに各機能をかける関数。最初は document.body、以後は差し替えた container の要素を受け取る。後始末の関数を返すと、次のページへ移る前に呼ばれる
  prefetch: 80, // リンクにマウスを乗せて(指を置いて)から先読みを始めるまでの時間(ms)。素通り・指でなぞってスクロールしただけのリンクは読まない。false で先読みしない
  cacheTime: 5 * 60 * 1000, // 取得したページを使い回す時間(ms)。この間に開き直すページ(戻る・進む・先読み済み)は通信せずに表示する
  cacheSize: 30, // 取っておくページ数の上限。超えたら古いものから捨てる
  use: [], // 拡張の配列。拡張は ignore / start / beforeSwap / afterSwap を持つオブジェクトで、並べた順に呼ばれる
};

// ハッシュを除いた URL(取っておくページの鍵に使う)
const pageUrl = (href) => href.split('#')[0];

// ファイル(拡張子付き。.html / .htm / .php のページは除く)の URL か
const isFile = (url) => /\.(?!html?$|php$)\w+$/i.test(url.pathname);

export function pageTransition(options = {}) {
  const config = { ...defaults, ...options };
  // 拡張の name の関数を並べた順に集める
  const hooks = (name) => config.use.map((extension) => extension[name]).filter((hook) => typeof hook === 'function');

  // init をかけ、後始末の関数を返す(init が返さなければ何もしない関数)
  const init = (root) => {
    const cleanup = config.init(root);
    return typeof cleanup === 'function' ? cleanup : () => {};
  };

  // Navigation API の無いブラウザ・差し替える要素の無いページでは、init だけかけて通常の遷移のままにする
  if (!window.navigation || !document.querySelector(config.container)) {
    init(document.body);
    return { prefetch() {} };
  }

  // 最初のページの HTML は init より前に取る(下で取っておくページに入れる)。init のあとに取ると、各機能が書き換えた状態
  // (初期化済みの印など)のまま同じページへ差し替えることになり、機能がかけ直されない(トップで自分自身へのリンクを押したときなど)
  const firstPage = document.documentElement.outerHTML;
  let cleanup = init(document.body);

  // URL(ハッシュなし)→ { time: 取得を始めた時刻, page: Promise<html> }
  const cache = new Map();

  const fetchPage = (href, { priority, signal } = {}) => {
    const url = pageUrl(href);
    const hit = cache.get(url);
    if (hit && Date.now() - hit.time < config.cacheTime) return hit.page;

    const page = fetch(url, { headers: { Accept: 'text/html' }, priority, signal }).then((res) => {
      // リダイレクト・HTML 以外は通常の読み込みに任せる
      if (!res.ok || res.redirected || !res.headers.get('content-type')?.includes('text/html')) throw new Error(`${res.status}`);
      return res.text();
    });
    // 失敗したもの(取り消したものを含む)は取っておかない(次に開くときに取り直す)
    page.catch(() => {
      if (cache.get(url)?.page === page) cache.delete(url);
    });
    cache.set(url, { time: Date.now(), page });
    if (cache.size > config.cacheSize) cache.delete(cache.keys().next().value);

    return page;
  };

  // 最初のページを、init で書き換える前の HTML のまま取っておく(戻ってきたときに通信せずに表示する)
  cache.set(pageUrl(location.href), { time: Date.now(), page: Promise.resolve(firstPage) });

  // 差し替えて開く URL か(ファイル・拡張の ignore が true を返したものは通常の遷移)
  const isTarget = (url, link) => !isFile(url) && !hooks('ignore').some((ignore) => ignore(url, link));

  const swap = async (url, event) => {
    const { signal } = event; // 次の遷移が始まると取り消される
    hooks('start').forEach((start) => start({ url: url.href, navigationType: event.navigationType }));

    try {
      const html = await fetchPage(url.href, { signal });
      if (signal.aborted) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.querySelector(config.container);
      if (!next) throw new Error('container not found');

      // 差し替える前に文書へ取り込む(すぐ表示する画像はここで読み込みが始まる)
      const page = document.importNode(next, true);
      const context = { url: url.href, doc, page };

      // beforeSwap は順に待つ。false を返したら通常の読み込みに切り替える
      for (const beforeSwap of hooks('beforeSwap')) {
        if ((await beforeSwap(context)) === false) throw new Error('reload');
        if (signal.aborted) return;
      }

      cleanup();
      document.querySelector(config.container).replaceWith(page);
      document.title = doc.title;
      document.documentElement.lang = doc.documentElement.lang;
      hooks('afterSwap').forEach((afterSwap) => afterSwap(context));
      cleanup = init(page);
    } catch (error) {
      // 取得・表示できなかったときは通常の読み込みに切り替える(URL は移り先になっている)
      if (!signal.aborted) location.reload();
    }
  };

  navigation.addEventListener('navigate', (event) => {
    const url = new URL(event.destination.url);

    // 別オリジン・同じページの中(アンカー)・ダウンロード・フォームの送信(POST)・再読み込みは通常どおり
    if (
      !event.canIntercept
      || event.hashChange
      || typeof event.downloadRequest === 'string'
      || event.formData
      || event.navigationType === 'reload'
      || !isTarget(url, event.sourceElement ?? null)
    ) return;

    // スクロール位置(移ったら上端かアンカー・戻る/進むなら離れたときの位置)とフォーカスは、差し替えたあとにブラウザが戻す
    event.intercept({ handler: () => swap(url, event) });
  });

  // href のページを取得しておく
  const prefetch = (href) => {
    const url = new URL(href, location.href);
    if (pageUrl(url.href) !== pageUrl(location.href)) fetchPage(url.href, { priority: 'low' });
  };

  // 先読み(データセーバー時はしない)
  if (config.prefetch !== false && !navigator.connection?.saveData) {
    let hovered = null;
    let timer = 0;
    const schedule = (event) => {
      const link = event.target.closest('a[href]');
      if (link === hovered) return;

      hovered = link;
      clearTimeout(timer);
      if (link && link.origin === location.origin && !link.target && isTarget(new URL(link.href), link)) {
        timer = setTimeout(prefetch, config.prefetch, link.href);
      }
    };

    document.addEventListener('mouseover', schedule);
    document.addEventListener('touchstart', schedule, { passive: true });
    // 指がリンクの上から動き出したら(スクロール)読まない。一覧をなぞってスクロールするたびにリクエストが飛ばないように
    document.addEventListener('touchmove', () => {
      clearTimeout(timer);
      hovered = null;
    }, { passive: true });
  }

  return { prefetch };
}
