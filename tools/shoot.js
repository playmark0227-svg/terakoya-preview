/* ============================================================
   全画面のスクリーンショットを撮り、見た目の崩れを見回る（ブラウザ・puppeteer）
   使い方：
     python3 -m http.server 8770 を動かしたまま
     NODE_PATH=$(npm root -g) node tools/shoot.js <出力フォルダ> [名前の絞り込み]
   - 絞り込みは名前の一部（カンマで複数）：site- / member- / fresh- / veteran- / plan- / admin- / login / modal など
   - 幅は SIZES で選ぶ（既定は desktop,mobile。all で全部）：
       small 320 / mobile 390 / tablet 768 / laptop 1024x768 / desktop 1280 / hd 1366x768 / wide 1440 /
       short 1280x720（左の帯だけ撮る）
   - TILES=1：縦に分けた画像も作る（長いページは縮小すると字が読めないため）。SHOTS=0：撮らずに見回りだけ
   - BASELINE=<前の report.json>：前より増えたものを「後退」として失敗にする（無ければ出力フォルダの前回の report.json）
   撮るもの（名前）：site-*（公開サイト・申込みとお問い合わせの段）/ member-login・-forgot・-reset・-set-password・
     -suspended・-login-blocked（ログインまわり）/ member-<画面>（在籍24日。feed/<id>・members/<id>・ranking?month=last など）/
     member-modal-*（窓・スマホのメニュー・メニューの上の一言の知らせ）/ member-sidebar*（左の帯・試作版の札。641px 以上）/
     plan-<状態>-*（契約の状態ごとの home・courses・account・cancel・card・menu）/ veteran-* / fresh-* / admin-*
   - ?focus= ?c= ?post= と公開サイトの ?c= ?art= のような「途中の場所へ送る」URL と、窓・小さなメニューは、見えている範囲だけを
     撮る（viewport）。ページ全体を撮ると先頭から写って送った先に着いたかが分からず、画面に留まる窓はページの途中に写るため
   - 撮る前に待つもの：読み込み中の形（skeleton）が消えるまで。そのあと送りの動き（U.smoothScroll など）が止まるまで
     （公開サイトはハッシュで移ったあと少なくとも1秒）。遅延読み込みの写真（読み込ませたら元の位置に戻す）
   - 動かせなかった・待てなかった・撮れなかったページは errors に残して、次のページへ進む（全体は止めない）。
     サーバーが CSS・JS の読み込みを落とした（net::ERR_CONNECTION_RESET など）ページは、読み込み直してもう一度だけ撮る
     （続きの動き chain の途中は読み込み直せないので、失敗に残る。撮り直すこと）
   見回ること（ページごと。結果は <出力フォルダ>/report.json）：
     overflow  横にはみ出す（ページの横スクロール・画面の端から出る要素）              → 1つでも失敗
     junk      画面の文字に undefined・NaN・[object Object]                            → 1つでも失敗
     errors    ページの JavaScript の例外・console.error                              → 1つでも失敗
     small     押せるものが 40px 未満（860px 以下の幅だけ。文の中のリンクは除く。
               文字のあるリンクは高さ40px・幅24px以上なら可。行ごと押せる表の、行と同じ先へのリンクは行で測る）
                                                                                        → 1つでも失敗（運営画面は前より増えたら失敗）
     clip      overflow:hidden の箱で文字が切れている・画面より高い固定の帯              → 前より増えたら失敗
     orphan    段落の最後の行が1文字だけ（大きさの違う字が並ぶ行は、字の箱の縦の重なりで同じ行とみる） → 前より増えたら失敗
     covered   固定の帯（上の帯・下のタブ・試作版の札）に隠れて、どこまで送っても押せない
               （横に送れる列の外に送られているものは、列を送れば押せるので数えない）  → 前より増えたら失敗
     contrast  小さい文字（24px 未満・太字は 18.66px 未満）のコントラストが 4.5:1 未満    → 前より増えたら失敗
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8770';
const OUT = path.resolve(process.argv[2] || 'shots');
const ONLY = (process.argv[3] || '').split(',').map(s => s.trim()).filter(Boolean);
const TAKE = process.env.SHOTS !== '0';
const ALL_SIZES = {
  small: { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1280, height: 900 },
  hd: { width: 1366, height: 768 },
  wide: { width: 1440, height: 900 },
  short: { width: 1280, height: 720, only: /sidebar/ }
};
const SIZES = {};
const wantSizes = (process.env.SIZES || 'desktop,mobile').split(',').map(s => s.trim());
(wantSizes.includes('all') ? Object.keys(ALL_SIZES) : wantSizes).forEach(k => { if (ALL_SIZES[k]) SIZES[k] = ALL_SIZES[k]; });
const NO_MOTION = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';
const HARD = ['overflow', 'junk', 'errors', 'small'];
const SOFT = ['clip', 'orphan', 'covered', 'contrast'];
// 運営画面はパソコンで使う道具なので、スマホ幅の押す大きさは「前より増えたら失敗」にとどめる
const hardOf = key => /\/admin-/.test(key) ? HARD.filter(c => c !== 'small') : HARD;
const softOf = key => /\/admin-/.test(key) ? SOFT.concat(['small']) : SOFT;

// サーバーが接続を落とした印（ページの誤りではない。読み込み直して撮る）。404 などの「無いファイル」はページの誤りなので入れない
const NET_DROP = /net::ERR_(CONNECTION_RESET|CONNECTION_REFUSED|CONNECTION_CLOSED|EMPTY_RESPONSE|SOCKET_NOT_CONNECTED)/;
const want = name => !ONLY.length || ONLY.some(f => name.includes(f));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- ページの中で動かす見回り ---------- */
function audit(opt) {
  const out = { overflow: [], clip: [], orphan: [], small: [], covered: [], contrast: [], junk: [] };
  const de = document.documentElement, W = de.clientWidth, H = innerHeight;
  // 見回りで送った位置（ページ・窓の中・横に送れる列）は、終わったら全部戻す（続きの動き chain が同じ場所から始まるように）。
  // 押せる大きさを測るときの scrollIntoView は、中の箱や横の列も動かすので、測る前の位置を覚えておく
  const startY = scrollY;
  const keepScroll = [...document.querySelectorAll('*')]
    .filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    .map(el => [el, el.scrollTop, el.scrollLeft]);
  const CS = el => getComputedStyle(el);
  function name(el) {
    const bits = [];
    for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) { bits.unshift(s + '#' + e.id); break; }
      const c = [...e.classList].filter(x => !/^(is-|has-)/.test(x)).slice(0, 2);
      if (c.length) s += '.' + c.join('.');
      bits.unshift(s);
    }
    return bits.join(' > ');
  }
  function label(el) {
    const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
    return t.length > 24 ? t.slice(0, 24) + '…' : t;
  }
  function shown(el) {
    if (el.closest('[hidden],[inert],.sr-only')) return false;
    // 閉じた <details> の中（見出しの summary は除く）。いまの Chrome は、閉じていても中の箱の位置を返すため
    const dt = el.closest('details:not([open])');
    if (dt) { const sm = dt.querySelector(':scope > summary'); if (!sm || !sm.contains(el)) return false; }
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    for (let e = el; e && e !== de; e = e.parentElement) {
      const s = CS(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || +s.opacity === 0) return false;
      if (s.clipPath && s.clipPath !== 'none' && /inset\(50%|circle\(0/.test(s.clipPath)) return false;
      if (s.clip && /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip)) return false;
    }
    return true;
  }
  const all = [...document.body.querySelectorAll('*')].filter(el => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|BR|WBR)$/.test(el.tagName));
  const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());

  // 1. 横のはみ出し：ページの横スクロールと、画面の端から出ている要素（横に流れる列・切る箱の中は除く）
  if (de.scrollWidth > W + 1) out.overflow.push({ el: 'ページ', note: '横幅 ' + de.scrollWidth + 'px（画面 ' + W + 'px）' });
  const scroller = el => {
    for (let e = el.parentElement; e && e !== de; e = e.parentElement) {
      const s = CS(e);
      if (/(auto|scroll)/.test(s.overflowX)) return e;
      if (/(hidden|clip)/.test(s.overflowX) && e !== document.body) return e;
    }
    return null;
  };
  const past = new Set();
  all.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || (r.right <= W + 1 && r.left >= -1)) return;
    if (!shown(el) || scroller(el)) return;
    if (el.parentElement && past.has(el.parentElement)) { past.add(el); return; }
    past.add(el);
    out.overflow.push({ el: name(el), note: '画面の外に ' + Math.round(Math.max(r.right - W, -r.left)) + 'px' });
  });

  // 2. 切れている：overflow:hidden の箱の外に文字が出ている。画面より高い固定の帯（中が見られない）
  all.forEach(box => {
    const s = CS(box);
    if (s.position === 'fixed' && !/(auto|scroll)/.test(s.overflowY) && shown(box)) {
      const r = box.getBoundingClientRect();
      if (r.height > H + 1) out.clip.push({ el: name(box), note: '固定の帯が画面より高い（' + Math.round(r.height) + 'px）' });
    }
    const hx = /(hidden|clip)/.test(s.overflowX), hy = /(hidden|clip)/.test(s.overflowY);
    if ((!hx && !hy) || box === document.body || box.classList.contains('sr-only')) return;
    // 行の省略（…）や行数の制限は、わざと切っているので数えない
    if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) return;
    if (!(box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1) || !shown(box)) return;
    const br = box.getBoundingClientRect();
    const bad = [...box.querySelectorAll('*')].find(el => {
      if (!hasText(el) || !shown(el)) return false;
      const es = CS(el);
      if (es.textOverflow === 'ellipsis' || (es.webkitLineClamp && es.webkitLineClamp !== 'none')) return false;
      const r = el.getBoundingClientRect();
      return (hx && (r.right > br.right + 2 || r.left < br.left - 2)) || (hy && (r.bottom > br.bottom + 2 || r.top < br.top - 2));
    });
    if (bad) out.clip.push({ el: name(box), note: '文字が切れている：' + label(bad) });
  });

  // 3. 最後の行が1文字だけ（自分の中の文字で見る。中の箱の文字は、その箱が自分で見る）
  const blocks = all.filter(el => hasText(el) && !/^(inline|contents|none)$/.test(CS(el).display) && !/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(el.tagName));
  blocks.forEach(el => {
    const s = CS(el);
    if (/nowrap|pre$/.test(s.whiteSpace) || !shown(el)) return;
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.5;
    if (el.getBoundingClientRect().height < lh * 1.6) return;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      for (let p = n.parentElement; p && p !== el; p = p.parentElement) if (!/^(inline|contents)$/.test(CS(p).display)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = []; let n; while ((n = tw.nextNode())) nodes.push(n);
    const rg = document.createRange();
    // 同じ行かどうかは、字の箱の縦の範囲が重なるかで見る（「<b>1</b>回」のように大きさの違う字が並ぶ行は、
    // 字の上端がずれるので、上端どうしをくらべると2行に見えてしまう）
    const sameLine = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= Math.min(a.height, b.height) * 0.5;
    let last = null, count = 0, lines2 = false;
    outer: for (let i = nodes.length - 1; i >= 0; i--) {
      const t = nodes[i].nodeValue;
      for (let j = t.length - 1; j >= 0; j--) {
        if (/\s/.test(t[j])) continue;
        rg.setStart(nodes[i], j); rg.setEnd(nodes[i], j + 1);
        const rr = rg.getClientRects()[0];
        if (!rr || rr.height < 1) continue;
        if (last && !sameLine(last, rr)) { lines2 = true; break outer; }
        last = last || rr;
        if (++count > 1) break outer;
      }
    }
    if (lines2 && count === 1) out.orphan.push({ el: name(el), note: '「…' + label(el).slice(-12) + '」' });
  });

  // 4. 押せるものの大きさ。::before などで広げた押せる範囲は、点を当てて測る
  const TAB = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]';
  const tabbable = [...document.querySelectorAll(TAB)].filter(el => el.tabIndex >= 0 && !el.disabled && !el.closest('.skip-link,[inert]') && shown(el));
  function target(el) {
    // チェックとラジオは、包んでいる label が押す場所
    if (el.tagName === 'INPUT' && /checkbox|radio/.test(el.type)) {
      const l = el.closest('label') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
      if (l) return l;
    }
    // 行ごと押せる表（運営画面の tr[data-tb-href]）の中の、行と同じ先へのリンクは、行が押す場所
    if (el.tagName === 'A') {
      const tr = el.closest('tr[data-tb-href]');
      const strip = s => String(s || '').replace(/^#/, '');
      if (tr && strip(el.getAttribute('href')) === strip(tr.getAttribute('data-tb-href'))) return tr;
    }
    return el;
  }
  function inSentence(el) {
    if (CS(el).display !== 'inline') return false;
    const p = el.parentElement; if (!p) return false;
    return (p.innerText || '').trim().length > (el.innerText || '').trim().length + 4;
  }
  if (opt.small) {
    tabbable.forEach(el0 => {
      const el = target(el0);
      if (inSentence(el)) return;
      let r = el.getBoundingClientRect();
      if (r.width >= 40 && r.height >= 40) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (el === h || el.contains(h)); };
      const hOk = r.height >= 40 || (hits(cx, cy - 19.5) && hits(cx, cy + 19.5));
      const text = (el.innerText || '').trim().length > 0;
      const wOk = r.width >= 40 || (hits(cx - 19.5, cy) && hits(cx + 19.5, cy)) || (text && r.width >= 24);
      if (!wOk || !hOk) out.small.push({ el: name(el), note: Math.round(r.width) + '×' + Math.round(r.height) + ' ' + label(el) });
    });
    scrollTo(0, 0);
  }

  // 5. 固定の帯に隠れて押せないもの。上の帯は一番上まで戻しても、下の帯は一番下まで送っても隠れたままのものだけ
  function fixedOf(el) { for (let e = el; e && e !== de; e = e.parentElement) { const p = CS(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; }
  /** 横に送れる列（運営画面のタブの列 .ad-tabs・絞り込みの列など）の外に送られていて、いまは見えていないもの。
      列を横に送れば押せるので「隠れて押せない」には数えない */
  function outOfStrip(el, r) {
    const cx = r.left + r.width / 2;
    for (let e = el.parentElement; e && e !== de; e = e.parentElement) {
      if (!/(auto|scroll)/.test(CS(e).overflowX) || e.scrollWidth <= e.clientWidth + 1) continue;
      const br = e.getBoundingClientRect();
      if (cx < br.left || cx > br.right) return true;
    }
    return false;
  }
  const coveredSeen = new Set();
  const inner = all.filter(el => /(auto|scroll)/.test(CS(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
  for (const [y, edge] of [[0, 'top'], [de.scrollHeight, 'bottom']]) {
    scrollTo(0, y);
    inner.forEach(el => { el.scrollTop = edge === 'top' ? 0 : el.scrollHeight; });   // 窓の中など、中だけスクロールする箱も端まで送る
    tabbable.forEach(el0 => {
      const el = target(el0);
      if (coveredSeen.has(el) || el.closest('[aria-hidden="true"]')) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cy < 0 || cy > H || cx < 0 || cx > W) return;
      if (outOfStrip(el, r)) return;
      const h = document.elementFromPoint(cx, cy);
      if (!h || h === el || el.contains(h) || h.contains(el)) return;
      if (h.closest('.pop:not([hidden]), [role="menu"], [role="listbox"]')) return;   // 開いている小さなメニューは、わざと上に重ねている
      const f = fixedOf(h);
      if (!f || f.contains(el)) return;
      const fr = f.getBoundingClientRect();
      if (edge === 'top' ? fr.top > H / 3 : fr.bottom < H * 2 / 3) return;
      coveredSeen.add(el);
      out.covered.push({ el: name(el), note: label(el) + ' が ' + name(f) + ' の下' });
    });
  }
  scrollTo(0, 0);
  keepScroll.forEach(([el, t, l]) => { el.scrollTop = t; el.scrollLeft = l; });

  // 6. 小さい文字のコントラスト。背景に画像があるところは測らない
  // color-mix() の色は Chrome が color(srgb r g b / a)（0〜1）で返す。読めないと白とみなして、頭文字の丸・色の付いた札を見逃す
  function rgba(c) {
    const cs = String(c).match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/);
    if (cs) return [cs[1] * 255, cs[2] * 255, cs[3] * 255, cs[4] != null ? +cs[4] : 1];
    const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function over(top, bot) { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [255, 255, 255, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat([a]); }
  function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = CS(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  }
  const seenC = new Set();
  blocks.concat(all.filter(el => hasText(el) && CS(el).display === 'inline')).forEach(el => {
    if (!shown(el) || el.closest(':disabled,[aria-disabled="true"]')) return;
    const s = CS(el), size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
    if (size >= 24 || (bold && size >= 18.66)) return;
    const fg = rgba(s.color); if (!fg) return;
    let op = 1; for (let e = el; e && e !== de; e = e.parentElement) op *= +CS(e).opacity;
    const bg = bgOf(el); if (!bg) return;
    const f = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio >= 4.48) return;   // 4.496 のような丸めの差は数えない
    const key = name(el) + '|' + s.color;
    if (seenC.has(key)) return; seenC.add(key);
    out.contrast.push({ el: name(el), note: ratio.toFixed(2) + ':1 ' + Math.round(size) + 'px ' + s.color + ' / rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ') 「' + label(el).slice(0, 14) + '」' });
  });

  // 7. 出てはいけない文字
  const j = (document.body.innerText || '').match(/undefined|NaN|\[object Object\]/g);
  if (j) out.junk.push({ el: 'ページ', note: [...new Set(j)].join(',') });
  scrollTo(0, startY);
  return out;
}

/* ---------- 撮る・待つ ---------- */
async function settle(page) {
  // ページが入れ替わった直後（frame が外れた）などで待てないときは、待たずに進む（撮るほうで例外を記録する）
  try { await settleIn(page); } catch (e) { if (current) current.errors.push('待てなかった：' + String(e.message || e).split('\n')[0]); }
}
async function settleIn(page) {
  // 読み込み中の形（U.skeleton・AU.skeleton）が消えるまで。消えないまま撮ると、灰色の箱だけの画像になる。
  // 画面は読み込みのあとで ?focus= の場所へ送るので、送りの動きを待つより先に待つ
  await page.waitForFunction(() => !document.querySelector('.skel[aria-busy="true"], .ad-skel[aria-busy="true"]'), { timeout: 4000 }).catch(() => {});
  // 送りの動きが止まるのを待つ（?focus= の U.smoothScroll、公開サイトの見出しへの送り・先頭へ戻る送り）。
  // 公開サイトは、ハッシュで移ったあとに送り始めることがあるので、少なくとも1秒待つ
  const site = !/\/(member|admin)\.html/.test(page.url());
  await page.evaluate(async minMs => {
    const t0 = Date.now(); let last = null, still = 0;
    while (Date.now() - t0 < 3000) {
      await new Promise(r => setTimeout(r, 50));
      const y = Math.round(scrollY);
      still = y === last ? still + 1 : 0; last = y;
      if (still >= 4 && Date.now() - t0 >= minMs) break;
    }
  }, site ? 1000 : 0).catch(() => {});
  await page.addStyleTag({ content: NO_MOTION }).catch(() => {});
  // 遅延読み込み（loading=lazy）の写真は、一度スクロールしないと読み込まれず空白で写る。送ったら元の位置に戻す
  await page.evaluate(async () => {
    if ([...document.images].every(i => i.complete)) return;
    const y0 = scrollY;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
    scrollTo(0, y0);
    await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
    scrollTo(0, y0);
  }).catch(() => {});
  await sleep(200);
}

const report = { at: new Date().toISOString(), base: BASE, sizes: {}, pages: {} };
let current = null;   // いま見ているページの結果（ページの例外をここに足す）

async function shot(page, name, kind, vp, opt) {
  opt = opt || {};
  const file = name.replace(/[/?=&:%]/g, '_');
  if (TAKE) {
    await page.screenshot({ path: path.join(OUT, kind, file + '.png'), fullPage: !opt.viewport });
    if (process.env.TILES && !opt.viewport) {
      const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      const step = Math.round(vp.height * 1.25);
      fs.mkdirSync(path.join(OUT, kind + '-tiles'), { recursive: true });
      for (let y = 0, i = 1; y < h; y += step, i++) {
        await page.screenshot({ path: path.join(OUT, kind + '-tiles', file + '-' + String(i).padStart(2, '0') + '.png'),
          clip: { x: 0, y, width: vp.width, height: Math.min(step, h - y) }, captureBeyondViewport: true });
      }
    }
  }
  const res = await page.evaluate(audit, { small: vp.width <= 860 }).catch(e => ({ errors: ['見回りが止まった：' + e.message] }));
  res.errors = (current.errors || []).concat(res.errors || []);
  const rec = report.pages[kind + '/' + name] = res;
  const n = HARD.concat(SOFT).map(k => (rec[k] || []).length ? k + ' ' + rec[k].length : '').filter(Boolean).join(' ');
  console.log(kind, name, n ? '  … ' + n : '');
}

/* ---------- 撮るもの ----------
   [名前, 動き(page), { viewport, minWidth, maxWidth, chain }]。動きのあと settle して撮る。
   グループの setup は、中の1つでも撮るときだけ動く。chain が同じ名前の並びは前の動きの続きなので、
   あとのものだけを撮るときも、前のものの動きから順に動かす（申込みの確認 → 決済 → 完了 など） */
function hashTo(h) {
  return async page => {
    await page.evaluate(h2 => {
      if (location.hash === h2) {
        const app = (window.CLG && (CLG.app || (CLG.admin && CLG.admin.app))) || null;
        if (app && app.refresh) app.refresh(); else if (window.CLG && CLG.site) CLG.site.render();
      } else location.hash = h2;
    }, h);
  };
}
/** 読み込み直して開く（# だけ違う URL でも、保存の中身から描き直すように） */
async function goto(page, url) {
  if (page.url() !== 'about:blank') await page.goto('about:blank');
  await page.goto(BASE + url, { waitUntil: 'networkidle0' });
}
async function fill(page) {
  // 入力欄を埋める（名前で中身を決める）。選ぶ欄は最初の中身、チェックは全部入れる
  await page.evaluate(() => {
    const V = { name: '山田 はな', kana: 'ヤマダ ハナ', email: 'hana.yamada.2026@example.jp', ref: '', body: '入会前の質問です。講座は月に何本くらい増えますか。' };
    document.querySelectorAll('#site-main input, #site-main select, #site-main textarea').forEach(el => {
      if (el.type === 'checkbox') { if (!el.checked) el.click(); return; }
      if (el.tagName === 'SELECT') { const o = [...el.options].find(x => x.value); if (o) el.value = o.value; }
      else if (el.name in V) el.value = V[el.name];
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}
/** 押す。閉じた <details> の中のもの（決済の「ほかの結果を見る（デモ）」など）は開いてから押す。見つからなければ止める */
async function click(page, sel) {
  await page.waitForSelector(sel, { timeout: 4000 });
  const ok = await page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return false;
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    el.click(); return true;
  }, sel);
  if (!ok) throw new Error(sel + ' が見つからない');
  await sleep(250);
}
const setPlan = key => async page => {
  await page.evaluate(k => { CLG.rules.setPlanDemo(k === 'past_due_x' ? 'past_due' : k, { expired: k === 'past_due_x' }); }, key);
};
/** その人として、最初の状態から開く。?demo= は同じ人のままなら保存の中身を引き継ぐので、先に保存を消す
    （前のグループの動き（レベルアップの窓で回を見終えた など）が残ると、幅ごとに違う状態を撮ってしまうため） */
const persona = kind => async page => {
  await goto(page, '/member.html');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await goto(page, '/member.html?demo=' + kind + '#/home');
  await page.evaluate(() => { try { CLG.rules.setPlanDemo('active'); } catch (e) {} });
};
/** 運営画面のその画面へ。運営画面でログインしていなければ（絞り込んで dashboard を撮らないときや、admin-login のあと）
    admin.html?demo=1 で開き直す（会員ページの上でハッシュだけ変えると、会員ページの画面を撮ってしまうため） */
const adminGo = r => async page => {
  const inAdmin = /\/admin\.html/.test(page.url()) && await page.evaluate(() => {
    try { return !!(JSON.parse(localStorage.getItem('terakoya-admin-v1') || '{}') || {}).session; } catch (e) { return false; }
  }).catch(() => false);
  if (inAdmin) await hashTo('#/' + r)(page); else await goto(page, '/admin.html?demo=1#/' + r);
};
// 運営画面のログインを外す（運営画面の保存 terakoya-admin-v1 の session だけを消す）
const adminLogout = async page => {
  await goto(page, '/admin.html');
  await page.evaluate(() => { const k = 'terakoya-admin-v1'; try { const d = JSON.parse(localStorage.getItem(k) || '{}'); d.session = null; localStorage.setItem(k, JSON.stringify(d)); } catch (e) {} });
};

// 画面の途中の場所へ送る URL（?focus= ?c= ?post=）は、送った先が写るように見えている範囲だけを撮る（viewport）。
// ページ全体を撮ると、いつも先頭から写るので、送った先に着いたかが分からないため
const VIEW = { viewport: true };
const MEMBER = [
  'home', 'start', 'start?line=ok', 'courses', 'courses?tab=archive', 'courses/sns-basic', 'courses/marketing', ['courses/orientation?focus=quiz', VIEW],
  'courses/orientation/certificate', 'courses/archive/ar-2', 'lesson/sns-basic/sb-3',
  'feed', 'feed?kind=question', 'feed?kind=intro&cohort=2026-09', ['feed?post=q1', VIEW], 'feed/my1', 'feed/q1', ['feed/q1?c=q1-r1', VIEW], 'feed/q3',
  'members', 'members/m3', 'members/m12', 'members/me', 'members/TS-000308', 'members/nope',
  'ranking', 'ranking?month=last', 'gigs', 'gigs?type=peer', 'gigs/g4', 'gigs/g7', 'gigs/g10', 'gigs/gc4', 'gigs/new', 'referral', ['referral?focus=bank', VIEW],
  'events', 'events?mode=cal', 'events?tab=reserved', 'events/e1', 'messages', 'messages?kind=講座の質問&ref=lesson:sns-basic/sb-3', 'messages?kind=講座の質問&ref=archive:ar-2',
  'perks', ['perks?focus=pk3', VIEW], 'perks?tab=experts', 'card', 'card?show=1', 'account', ['account?focus=card', VIEW], 'account/cancel', 'notices',
  'search', 'search?q=動画', 'search?q=zzzz', 'help', ['help?focus=h17', VIEW], 'nope'
].map(x => (Array.isArray(x) ? x : [x]));
const enc = r => r.replace(/[^\x00-\x7f]+/g, encodeURIComponent);
const GROUPS = [
  { // 公開サイト
    pages: [
      ['site-lp', async p => goto(p, '/index.html#/')],
      ...['join', 'contact', 'about', 'company', 'curriculum', ['curriculum?c=sns-basic', VIEW], 'news', 'faq', 'tokushoho', 'terms', ['terms?art=7', VIEW], 'privacy', 'nope', 'join?rejoin=1']
        .map(x => (Array.isArray(x) ? x : [x]))
        .map(([r, o]) => ['site-' + r.replace('nope', '404'), async p => goto(p, '/index.html#/' + r), o]),
      ['site-404-file', async p => goto(p, '/404.html')],
      ['site-join-confirm', async p => { await goto(p, '/index.html#/join'); await p.evaluate(() => { try { CLG.site.resetJoin(); } catch (e) {} }); await goto(p, '/index.html#/join'); await fill(p); await click(p, '#site-main button[type=submit]'); }, { chain: 'join' }],
      ['site-join-pay', async p => { await p.evaluate(() => document.querySelectorAll('#site-main input[type=checkbox]').forEach(c => { if (!c.checked) c.click(); })); await click(p, '[data-join="confirm"]'); }, { chain: 'join' }],
      ['site-join-pay-failed', async p => { await click(p, '[data-join="demo-fail"]'); }, { chain: 'join' }],
      ['site-join-done', async p => { await click(p, '[data-join="pay"]'); await p.waitForFunction(() => /step=done/.test(location.hash), { timeout: 5000 }); await sleep(200); }, { chain: 'join' }],
      ['site-contact-confirm', async p => { await goto(p, '/index.html#/contact'); await p.evaluate(() => { try { CLG.site.resetContact(); } catch (e) {} }); await goto(p, '/index.html#/contact'); await fill(p); await click(p, '#site-main button[type=submit]'); }, { chain: 'contact' }],
      ['site-contact-sent', async p => { await click(p, '[data-contact="send"]'); await p.waitForFunction(() => /step=sent/.test(location.hash), { timeout: 5000 }).catch(() => {}); }, { chain: 'contact' }]
    ]
  },
  { // 会員ページ：ログインまわり（ログインしていないとき。§5-8）
    setup: async p => { await goto(p, '/member.html'); await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); },
    pages: [
      ['member-login', async p => goto(p, '/member.html#/login'), { chain: 'login' }],
      ['member-login-error', async p => { await p.$eval('#loginId', el => { el.value = ''; }); await p.type('#loginId', 'TS-999999'); await p.type('#loginForm input[type=password]', 'wrong-pass1'); await click(p, '#loginForm button[type=submit]'); }, { chain: 'login' }],
      ['member-forgot', async p => goto(p, '/member.html#/forgot'), { chain: 'forgot' }],
      ['member-forgot-sent', async p => { await p.type('#forgotForm input[name=account]', 'TS-000271'); await click(p, '#forgotForm button[type=submit]'); await p.waitForFunction(() => /メールを送りました/.test(document.body.innerText), { timeout: 4000 }).catch(() => {}); }, { chain: 'forgot' }],
      ['member-reset', async p => goto(p, '/member.html#/reset?token=demo'), { chain: 'reset' }],
      ['member-reset-error', async p => { await p.type('#resetForm input[name=next]', 'taisei2026'); await p.type('#resetForm input[name=again]', 'taisei2027'); await click(p, '#resetForm button[type=submit]'); }, { chain: 'reset' }],
      ['member-reset-done', async p => {
        for (const n of ['next', 'again']) { await p.$eval('#resetForm input[name=' + n + ']', el => { el.value = ''; }); await p.type('#resetForm input[name=' + n + ']', 'taisei2026'); }
        await click(p, '#resetForm button[type=submit]');
        await p.waitForFunction(() => !document.getElementById('resetForm'), { timeout: 4000 }).catch(() => {});
      }, { chain: 'reset' }],
      ['member-reset-expired', async p => goto(p, '/member.html#/reset?token=expired')],
      ['member-reset-bad', async p => goto(p, '/member.html#/reset?token=zzz')],
      ['member-set-password', async p => { await goto(p, '/member.html#/login'); await p.evaluate(() => { CLG.store.startFresh({ name: '山田 はな', email: 'hana.yamada.0312@example.jp' }); CLG.store.logout(); }); await goto(p, '/member.html#/set-password?token=demo-set'); }],
      // 運営画面で「ログインを止める」にされた会員（撮ったら戻す）：ログイン中は止めたページ、ログインの画面では入れない知らせ
      ['member-suspended', async p => { await goto(p, '/member.html?demo=1#/home'); await suspend(p, true); await goto(p, '/member.html#/home'); }, { after: p => suspend(p, false) }],
      ['member-login-blocked', async p => {
        await goto(p, '/member.html?demo=1#/home'); await suspend(p, true);
        await p.evaluate(() => CLG.store.logout()); await goto(p, '/member.html#/login');
        await click(p, '[data-demo]');
        await p.waitForFunction(() => /ログインできません/.test((document.getElementById('loginErr') || {}).textContent || ''), { timeout: 4000 }).catch(() => {});
      }, { after: p => suspend(p, false) }]
    ]
  },
  { // 会員ページ：在籍24日のデモ会員
    setup: persona('1'),
    pages: MEMBER.map(([r, o]) => ['member-' + r, hashTo('#/' + enc(r)), o]).concat([
      // 窓は、見えている範囲だけを撮る（ページ全体を撮ると、画面に留まる窓がページの途中に写り、実際の見え方と違うため）
      ['member-modal-level', async p => { await hashTo('#/home')(p); await settle(p); await p.evaluate(() => CLG.app.levelInfo()); }, VIEW],
      ['member-modal-guide', async p => { await closeModals(p); await p.evaluate(() => CLG.app.guide()); }, VIEW],
      ['member-modal-notices', async p => { await closeModals(p); await p.evaluate(() => CLG.app.notices()); }, VIEW],
      ['member-modal-confirm', async p => { await closeModals(p); await p.evaluate(() => { CLG.ui.confirmBox('予約を取り消しますか', '「新入生オリエンテーション」の予約を取り消します。', '取り消す', true); }); }, VIEW],
      // スマホのメニュー（下から出る窓）と、その上に出る一言の知らせ（窓の × と下のボタンに重ねない。§6-13）
      ['member-modal-menu', async p => { await closeModals(p); await p.evaluate(() => CLG.app.menu()); }, { viewport: true, maxWidth: 640 }],
      ['member-modal-menu-toast', async p => { await closeModals(p); await p.evaluate(() => { CLG.app.menu(); CLG.ui.toast('プロフィールを保存しました', 'ok'); }); }, { viewport: true, maxWidth: 640 }],
      ['member-modal-levelup', async p => { await closeModals(p); await p.evaluate(() => { CLG.store.resetDemo(true); CLG.rules.completeLesson('sns-basic', 'sb-3'); CLG.app.reward(CLG.rules.completeLesson('sns-basic', 'sb-4')); }); }, VIEW],
      ['member-sidebar', async p => { await closeModals(p); await p.evaluate(() => CLG.store.resetDemo(true)); await hashTo('#/home')(p); }, { viewport: true, minWidth: 641, chain: 'side' }],
      ['member-sidebar-end', async p => { await p.evaluate(() => { const n = document.getElementById('sideNav'); if (n) n.scrollTop = n.scrollHeight; }); }, { viewport: true, minWidth: 641, chain: 'side' }],
      // 左の帯の小さなメニュー（自分・試作版の札）を開いたところ
      ['member-sidebar-me', async p => { await p.evaluate(() => { const n = document.getElementById('sideNav'); if (n) n.scrollTop = 0; const b = document.getElementById('meBtn'); if (b) b.click(); }); }, { viewport: true, minWidth: 641, chain: 'side' }],
      ['member-sidebar-proto', async p => { await p.evaluate(() => { CLG.ui.closePops(); const b = document.querySelector('.protobar__pill'); if (b) b.click(); }); }, { viewport: true, minWidth: 641, chain: 'side' }]
    ])
  },
  { // 契約の状態（試作版の札の「契約の状態」と同じ R.setPlanDemo。§5-7）
    setup: async p => persona('1')(p),
    pages: [].concat(...['canceling', 'ended', 'past_due', 'past_due_x', 'paused'].map(k => [
      ['plan-' + k + '-home', async p => { await closeModals(p); await setPlan(k)(p); await hashTo('#/home')(p); }, { chain: k }],
      ['plan-' + k + '-courses', hashTo('#/courses'), { chain: k }],
      ['plan-' + k + '-account', hashTo('#/account'), { chain: k }],
      ['plan-' + k + '-cancel', hashTo('#/account/cancel'), { chain: k }],
      ['plan-' + k + '-card', hashTo('#/card'), { chain: k }],
      ['plan-' + k + '-menu', async p => { await p.evaluate(() => CLG.app.menu()); }, { chain: k, viewport: true, maxWidth: 640 }]
    ])).concat([['plan-active-home', async p => { await closeModals(p); await setPlan('active')(p); await hashTo('#/home')(p); }]])
  },
  { // 在籍半年
    setup: persona('veteran'),
    pages: ['home', 'start', 'card', 'gigs', 'gigs/mg1', 'referral', ['referral?focus=rows', VIEW], 'ranking', 'ranking?month=last', 'members/me', 'account', 'feed?kind=mine', 'events?tab=attended', 'notices']
      .map(x => (Array.isArray(x) ? x : [x])).map(([r, o]) => ['veteran-' + r, hashTo('#/' + r), o])
  },
  { // 入会したて
    setup: persona('fresh'),
    pages: ['home', 'start', 'courses', 'feed', 'gigs', 'events', 'referral', 'card', 'account', 'messages', 'ranking', 'members/me', 'notices']
      .map(r => ['fresh-' + r, hashTo('#/' + r)])
  },
  { // 運営画面
    setup: async p => { await goto(p, '/member.html?demo=1#/home'); },
    pages: [
      ['admin-login', async p => { await adminLogout(p); await goto(p, '/admin.html'); }],
      ...['dashboard', 'members', 'onboarding', 'inbox', 'courses', 'gigs', 'events', 'feed', 'perks', 'payments', 'referrals', 'points', 'reports', 'settings',
        'members/TS-000271', 'members/TS-000271?tab=pay', 'members/TS-000271?tab=gigs', 'members/TS-000271?tab=msg', 'members/TS-000057',
        'onboarding?view=interviews', 'inbox/live', 'inbox/th01', 'inbox?view=slots', 'inbox?view=experts',
        'onboarding?view=contacts', 'inbox?status=open',
        'courses/sns-basic', 'courses?tab=archive', 'courses?tab=stats', 'gigs?tab=apps', 'gigs?tab=review', 'gigs?tab=closed', 'gigs/pg1',
        'events/e1', 'events?tab=past', 'events?tab=proposals',
        'feed?tab=reports', 'feed?tab=staff', 'feed?tab=notices', 'feed?tab=line', 'perks?tab=experts', 'perks?tab=pros',
        'payments?tab=failed', 'payments?tab=cancels', 'payments?tab=refunds',
        'referrals?tab=rows', 'referrals?tab=banks', 'referrals?tab=history', 'points?tab=close',
        'settings?tab=referral', 'settings?tab=rules', 'settings?tab=staff', 'settings?tab=audit', 'settings?tab=templates', 'nope']
        .map((r, i) => ['admin-' + r, i === 0 ? async p => goto(p, '/admin.html?demo=1#/dashboard') : adminGo(r)]),
      ['admin-sidebar', async p => { await goto(p, '/admin.html?demo=1#/dashboard'); }, { viewport: true, minWidth: 641 }]
    ]
  }
];
/** 運営画面の保存（terakoya-admin-v1）で、いまの会員の「ログインを止める」を付け外しする。止めた時刻も書く
    （R.loginBlocked は、会員ページの保存の止め方と運営画面の保存のうち、新しく書かれたほうに従うため） */
async function suspend(p, on) {
  await p.evaluate(v => {
    const k = 'terakoya-admin-v1', no = CLG.store.state.me.id; let d = {};
    try { d = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) {}
    d.members = d.members || {};
    d.members[no] = Object.assign({}, d.members[no], { suspended: v, suspendedAt: v ? CLG.now().toISOString() : null });
    localStorage.setItem(k, JSON.stringify(d));
  }, on);
}
async function closeModals(p) {
  await p.evaluate(() => document.querySelectorAll('.modal-bg').forEach(m => (m.close ? m.close() : m.remove()))).catch(() => {});
  await sleep(150);
}

/* ---------- 前の結果とくらべる ---------- */
function compare(base) {
  const regress = [];
  if (!base || !base.pages) return regress;
  Object.keys(report.pages).forEach(k => {
    const a = base.pages[k], b = report.pages[k];
    if (!a) return;
    softOf(k).forEach(cat => {
      const was = new Set((a[cat] || []).map(x => x.el)), now = (b[cat] || []);
      if (now.length > (a[cat] || []).length) regress.push(`${k} ${cat}: ${(a[cat] || []).length} → ${now.length}（${now.filter(x => !was.has(x.el)).map(x => x.el + ' ' + x.note).slice(0, 3).join(' / ')}）`);
    });
  });
  return regress;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const repPath = path.join(OUT, 'report.json');
  const basePath = process.env.BASELINE || (fs.existsSync(repPath) ? repPath : '');
  let baseline = null;
  try { if (basePath) baseline = JSON.parse(fs.readFileSync(basePath, 'utf8')); } catch (e) { console.log('BASELINE が読めない：' + basePath); }
  for (const kind of Object.keys(SIZES)) fs.mkdirSync(path.join(OUT, kind), { recursive: true });
  // 画面（ディスプレイ）が眠っている Mac では、headless の Chrome に描く合図（vsync）が来ず、requestAnimationFrame が止まって
  // 撮影・送りの動きの待ちが時間切れになる。合図を待たずに描かせる（夜中に回しても同じ結果になるように）
  const browser = await puppeteer.launch({ headless: 'new', args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  for (const [kind, vp] of Object.entries(SIZES)) {
    report.sizes[kind] = { width: vp.width, height: vp.height };
    const bctx = await browser.createBrowserContext();
    const page = await bctx.newPage();
    await page.setViewport(vp);
    current = { errors: [] };
    page.on('pageerror', e => current.errors.push('例外：' + String(e.message || e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') current.errors.push('console：' + m.text().slice(0, 160)); });
    for (const g of GROUPS) {
      const todo = g.pages.filter(([name, , o]) => want(name) && (!vp.only || vp.only.test(name)) &&
        (!o || ((!o.maxWidth || vp.width <= o.maxWidth) && (!o.minWidth || vp.width >= o.minWidth))));
      if (!todo.length) continue;
      // setup の間に出た例外・読み込みの失敗は、最初に撮るページの結果に入れる（前のページの結果に紛れて消えないように）
      current = { errors: [] };
      if (g.setup) { try { await g.setup(page); } catch (e) { current.errors.push('準備で止まった：' + String(e.message || e).split('\n')[0]); } }
      let carry = current.errors;
      // 撮るものと、その前の続きの動き（chain）
      const need = new Set(todo);
      todo.forEach(it => {
        const c = it[2] && it[2].chain; if (!c) return;
        for (let i = g.pages.indexOf(it) - 1; i >= 0 && g.pages[i][2] && g.pages[i][2].chain === c; i--) need.add(g.pages[i]);
      });
      for (const it of g.pages) {
        if (!need.has(it)) continue;
        const [name, act, o] = it, take = todo.includes(it);
        current = { errors: carry }; carry = [];
        try { await act(page); } catch (e) { current.errors.push('動かせなかった：' + e.message.split('\n')[0]); }
        await settle(page);
        // サーバーが接続を切った（python の http.server は、ほかの撮影と重なると CSS・JS の読み込みを落とすことがある）。
        // 半分しか読めていないページを撮らないよう、読み込み直してもう一度だけ動かす。続きの動き（chain）の2段目からは
        // 読み込み直すと前の段が崩れるので、そのまま失敗に残す（撮り直すこと）
        const i = g.pages.indexOf(it), prev = i > 0 ? g.pages[i - 1][2] : null;
        const chained = !!(o && o.chain && prev && prev.chain === o.chain);
        if (current.errors.some(x => NET_DROP.test(x)) && !chained) {
          console.log(kind, name, '  … 読み込みが切れたので、読み込み直す');
          current = { errors: [] };
          try { await page.reload({ waitUntil: 'networkidle0' }); await act(page); } catch (e) { current.errors.push('動かせなかった：' + e.message.split('\n')[0]); }
          await settle(page);
        }
        if (take) {
          try { await shot(page, name, kind, vp, o); }
          catch (e) {   // 撮れなかったページも結果に残す（全体は止めない）
            report.pages[kind + '/' + name] = { overflow: [], clip: [], orphan: [], small: [], covered: [], contrast: [], junk: [],
              errors: (current.errors || []).concat(['撮れなかった：' + String(e.message || e).split('\n')[0]]) };
            console.log(kind, name, '  … 撮れなかった');
          }
        }
        if (o && o.after) await o.after(page).catch(() => {});
      }
    }
    await bctx.close();
  }
  await browser.close();
  // 絞り込んで撮ったときも、同じフォルダの前回の結果のうち今回撮らなかったページは残す（次にくらべる相手が欠けないように）
  const saved = { at: report.at, base: report.base, sizes: Object.assign({}, baseline && basePath === repPath ? baseline.sizes : {}, report.sizes),
    pages: Object.assign({}, baseline && basePath === repPath ? baseline.pages : {}, report.pages) };
  fs.writeFileSync(repPath, JSON.stringify(saved, null, 1));

  // まとめ：失敗（1つでもだめなもの）と後退（前より増えたもの）
  const hard = [], tally = {};
  Object.keys(report.pages).forEach(k => {
    const r = report.pages[k];
    HARD.concat(SOFT).forEach(cat => { tally[cat] = (tally[cat] || 0) + (r[cat] || []).length; });
    hardOf(k).forEach(cat => (r[cat] || []).forEach(x => hard.push(`${k} ${cat}: ${typeof x === 'string' ? x : x.el + ' ' + x.note}`)));
  });
  const regress = compare(baseline);
  console.log('');
  console.log(`ページ ${Object.keys(report.pages).length} / ` + HARD.concat(SOFT).map(c => `${c} ${tally[c] || 0}`).join(' / '));
  console.log('結果：' + repPath + (basePath ? `（くらべた相手：${basePath}）` : ''));
  if (hard.length) { console.log(`\n失敗 ${hard.length} 件`); hard.slice(0, 60).forEach(x => console.log('  ' + x)); if (hard.length > 60) console.log(`  …ほか ${hard.length - 60} 件（report.json）`); }
  if (regress.length) { console.log(`\n前より増えた ${regress.length} 件`); regress.slice(0, 40).forEach(x => console.log('  ' + x)); }
  process.exit(hard.length || regress.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
