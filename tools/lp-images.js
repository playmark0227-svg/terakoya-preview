/* ============================================================
   公開サイトに載せる「会員ページの実物のスクリーンショット」を作る
   使い方：python3 -m http.server 8770 を動かしたまま
     NODE_PATH=$(npm root -g) node tools/lp-images.js
   → assets/img/shot-<画面>.webp（スマホ幅 390px・2倍の解像度・縦 844px の1画面ぶん）
   - 時計は「今月のなかごろの水曜の夜」に止めて撮る。「今日」「明日」が写ると、公開サイトではいつ見ても
     おかしくなるため（写る範囲にあれば、ほかの水曜・時刻で撮り直す。どれもだめなら知らせる）。
   - 公開サイトは上の帯（56px）を切って、上から h px だけ見せる（site.js の SHOTS と START_SHOT）。
     h はカードの途中で切れないよう、カードとカードの間の高さを探して決め、最後に出す。
     出た h が site.js と違うときは、site.js の SHOTS[].h と START_SHOT.h をその値に直す。
   会員ページを直したら撮り直すこと（公開サイトの見本が古くならないように）。bump.sh --shots でも動く。
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8770';
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.resolve(__dirname, '../assets/img');   // OUT=<フォルダ> で試し撮り
const TOP = 56;   // 上の帯（公開サイトで切る）
// [画面, ファイル名, 見せたい高さの目安, 下限, 上限, 先に送る場所]。公開サイトで横に3枚並ぶもの（講座・タイムライン・案件）は、目安をそろえる。
// タイムラインは、一番上の固定のお知らせが長く投稿の切れ目が写らないので、絞り込みの列が上の帯のすぐ下に来るまで送ってから撮る
const PAGES = [
  ['courses', 'courses', 640, 540, 700],
  ['feed', 'feed', 640, 540, 700, '.feed-chips'],
  ['gigs', 'gigs', 640, 540, 700],
  ['start', 'start', 524, 470, 600],
  ['home', 'home', 600, 480, 720],
  ['card', 'card', 600, 480, 720],
  ['lesson/sns-basic/sb-3', 'lesson', 600, 480, 720],
  ['events', 'events', 600, 480, 720]
];

/** 今月（または次の月）のなかごろの水曜 21:45 の候補。先に試すものから */
function candidates() {
  const now = new Date(), out = [];
  for (const m of [0, -1, 1]) {
    const first = new Date(now.getFullYear(), now.getMonth() + m, 1);
    // 15〜21日の水曜 → 8〜14日 → 22〜28日
    for (const from of [15, 8, 22]) {
      const d = new Date(first.getFullYear(), first.getMonth(), from, 21, 45);
      while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
      out.push(d);
    }
  }
  return out;
}

/** ページより先に時計を止める（data.js が読み込み時に「いま」から日付を作るため）。時間はその時刻から進む */
function pinClock(ms) {
  const Real = Date, t0 = Real.now();
  class Fake extends Real {
    constructor(...a) { if (a.length) super(...a); else super(ms + (Real.now() - t0)); }
    static now() { return ms + (Real.now() - t0); }
  }
  window.Date = Fake;
}

/** 写る範囲（上の帯の下 lo〜hi）で、カードの途中で切れない高さを探す。見つからなければ null。
    切ってよいのは ① 何も描かれていない隙間（カードとカードの間）② 同じ形の行が続く一覧の、行と行の境目 */
function findCut(top, want, lo, hi) {
  const view = document.getElementById('view') || document.body;
  const spans = [];
  const paints = el => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) return true;
    if (/^(IMG|SVG|VIDEO|CANVAS|INPUT|BUTTON|TEXTAREA|SELECT|PROGRESS)$/i.test(el.tagName)) return true;
    if (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) return true;
    if (s.backgroundImage !== 'none' || s.boxShadow !== 'none') return true;
    return ['Top', 'Bottom'].some(k => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none');
  };
  view.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.width < 1 || !paints(el)) return;
    spans.push([r.top, r.bottom]);
  });
  // 何も描かれていない行（カードとカードの間）を集める
  const free = [];
  for (let y = top + lo; y <= top + hi; y++) if (!spans.some(([a, b]) => y > a - 1 && y < b + 1)) free.push(y);
  // ① ひと続きの隙間ごとに、上のカードの下から 14px（隙間が狭ければ真ん中）で切る
  const gaps = [];
  for (let i = 0; i < free.length; i++) {
    const s = free[i]; while (i + 1 < free.length && free[i + 1] === free[i] + 1) i++;
    gaps.push(Math.min(s + 14, Math.floor((s + free[i]) / 2)));
  }
  // ② 同じタグ・同じクラスの行が上下に続くところの境目（投稿と投稿、一覧の行と行）
  view.querySelectorAll('*').forEach(el => {
    const nx = el.nextElementSibling;
    if (!nx || nx.tagName !== el.tagName || nx.className !== el.className) return;
    const a = el.getBoundingClientRect(), b = nx.getBoundingClientRect();
    if (a.height < 32 || b.height < 32 || Math.abs(a.bottom - b.top) > 1.5) return;
    // 次の行の上の区切り線（1px）が写らないよう、行の下の余白の中で 2px 上を切る
    // （境目ちょうどで切ると、公開サイトで縮めて描くときに線がにじんで、枠の線と二重に見える）
    const y = Math.floor(a.bottom) - 2;
    if (y >= top + lo && y <= top + hi) gaps.push(y);
  });
  if (!gaps.length) return null;
  gaps.sort((a, b) => Math.abs(a - top - want) - Math.abs(b - top - want));
  return gaps[0] - top;
}

/** 写る範囲に「今日」「明日」があるか */
function relWords(limit) {
  const hits = [];
  const tw = document.createTreeWalker(document.getElementById('root') || document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (!/今日|明日/.test(n.nodeValue)) continue;
    const el = n.parentElement, r = el && el.getBoundingClientRect();
    if (!r || r.height < 1 || r.top > limit || r.bottom < 0) continue;
    if (el.closest('[hidden],.sr-only,[aria-hidden="true"]')) continue;
    const dt = el.closest('details:not([open])');
    if (dt && !(dt.querySelector(':scope > summary') || { contains: () => false }).contains(el)) continue;   // 閉じた <details> の中は写らない
    hits.push(n.nodeValue.trim().slice(0, 30));
  }
  return hits;
}

async function shootAll(browser, at, write) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(pinClock, at.getTime());
  await page.goto(BASE + '/member.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('about:blank');
  await page.goto(BASE + '/member.html?demo=1#/home', { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  const res = [];
  for (const [route, name, want, lo, hi, from] of PAGES) {
    await page.evaluate(h => { location.hash = h; }, '#/' + route);
    await new Promise(r => setTimeout(r, 450));
    await page.evaluate(async (sel, top) => {
      scrollTo(0, 0);
      const el = sel && document.querySelector(sel);
      if (el) scrollTo(0, Math.max(0, el.getBoundingClientRect().top - top - 12));
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // 焦点の輪を写さない
      await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
    }, from || '', TOP);
    await new Promise(r => setTimeout(r, 150));
    const h = await page.evaluate(findCut, TOP, want, lo, hi);
    const words = await page.evaluate(relWords, TOP + (h || hi));
    res.push({ route, name, h, words });
    if (write) await page.screenshot({ path: path.join(OUT, 'shot-' + name + '.webp'), type: 'webp', quality: 82 });
  }
  await ctx.close();
  return res;
}

(async () => {
  // 画面（ディスプレイ）が眠っている Mac では、headless の Chrome に描く合図（vsync）が来ず、requestAnimationFrame が止まって
  // 撮影・送りの動きの待ちが時間切れになる。合図を待たずに描かせる（夜中に回しても同じ結果になるように）
  const browser = await puppeteer.launch({ headless: 'new', args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let pick = null, best = null;
  for (const at of candidates()) {
    const res = await shootAll(browser, at, false);
    const n = res.reduce((a, r) => a + r.words.length, 0);
    if (n) console.log(`${at.getMonth() + 1}/${at.getDate()} ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')} は見送り：` + res.filter(r => r.words.length).map(r => r.name + '「' + r.words.join('／') + '」').join(' '));
    if (!best || n < best.n) best = { at, n, res };
    if (!n) { pick = at; break; }
  }
  if (!pick) {
    pick = best.at;
    console.log('どの候補の日時でも「今日」「明日」が写る。いちばん少ない日時で撮る：');
    best.res.filter(r => r.words.length).forEach(r => console.log('  ' + r.name + '：' + r.words.join(' / ')));
  }
  const res = await shootAll(browser, pick, true);
  await browser.close();
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  console.log(`撮った日時（止めた時計）：${pick.getFullYear()}-${pick.getMonth() + 1}-${pick.getDate()}(${W[pick.getDay()]}) ${pick.getHours()}:${String(pick.getMinutes()).padStart(2, '0')}`);
  res.forEach(r => console.log(`  shot-${r.name}.webp  h: ${r.h == null ? '（切れ目なし）' : r.h}${r.words.length ? '  「今日」「明日」：' + r.words.join(' / ') : ''}`));
  // site.js の高さとくらべる（違えば直す値を出す）
  try {
    const src = fs.readFileSync(path.resolve(__dirname, '../assets/js/site.js'), 'utf8');
    const now = {};
    for (const m of src.matchAll(/name: '(\w+)'[^}]*?\bh: (\d+)/g)) now[m[1]] = +m[2];
    const diff = res.filter(r => now[r.name] != null && r.h != null && now[r.name] !== r.h);
    if (diff.length) console.log('site.js の高さを直す：' + diff.map(r => `${r.name} ${now[r.name]} → ${r.h}`).join('、'));
    else console.log('site.js の高さはこのままでよい');
  } catch (e) {}
  if (res.some(r => r.h == null)) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
