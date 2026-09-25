/* ============================================================
   生成した写真を、切り抜いて Web 用の webp にする。共有したときの画像（og.png）も作る
   使い方：NODE_PATH=$(npm root -g) node tools/prep-images.js [名前の絞り込み]
     例）node tools/prep-images.js og      … og.png だけ作り直す
         node tools/prep-images.js photo-  … 公開サイトの写真だけ
   元の画像：docs/生成画像/（Higgsfield で生成・公開リポジトリには入れない）
   出力：assets/img/photo-*.webp（公開サイト）、assets/img/fac-*.webp（講座の学部）、
         assets/img/og.png（1200×630。LINE・X・Facebook・LinkedIn で共有したときの画像）
   crop は元画像の [x, y, 幅, 高さ]。崩れた文字が写っている所を外すための切り抜き。
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const SRC = path.resolve(__dirname, '../docs/生成画像');
const OUT = path.resolve(__dirname, '../assets/img');
const ONLY = process.argv[2] || '';

const JOBS = [
  { src: 'hero-night-work.png', out: 'photo-hero.webp',     crop: [250, 0, 2027, 1520],  w: 1200, h: 900 },
  { src: 'meetup-cafe.png',     out: 'photo-meetup.webp',   crop: [0, 0, 2016, 1344],    w: 1200, h: 800 },
  { src: 'e-showcase.png',      out: 'photo-showcase.webp', crop: [108, 0, 1128, 752],   w: 1200, h: 800 },  // グラフを映した旧版は収入の話に見えるのでやめた
  { src: 'online-study.png',    out: 'photo-online.webp',   crop: [0, 0, 2016, 1344],    w: 1200, h: 800 },
  { src: 'faculty-basic.png',   out: 'fac-basic.webp',      crop: [0, 0, 2048, 1152],    w: 960,  h: 540 },
  { src: 'faculty-sns.png',     out: 'fac-sns.webp',        crop: [0, 0, 2688, 1512],    w: 960,  h: 540 },
  { src: 'online-study.png',    out: 'fac-skill.webp',      crop: [0, 105, 2016, 1134],  w: 960,  h: 540 },
  { src: 'faculty-sales.png',   out: 'fac-sales.webp',      crop: [0, 0, 2048, 1152],    w: 960,  h: 540 },
  { src: 'faculty-biz.png',     out: 'fac-biz.webp',        crop: [300, 60, 1340, 754],  w: 960,  h: 540 },  // 下の段ボールの文字を外す
];

/* 講座ごと・イベントごとの写真（GPT Image 2.5・1344x752）。c-<講座id>.png → course-<講座id>.webp、e-<名前>.png → event-<名前>.webp */
fs.readdirSync(SRC).filter(f => /^[ce]-.+\.png$/.test(f)).forEach(f => {
  const name = f.replace(/^c-/, 'course-').replace(/^e-/, 'event-').replace(/\.png$/, '.webp');
  JOBS.push({ src: f, out: name, crop: [3, 0, 1337, 752], w: 960, h: 540 });
});

/* ---------- 共有したときの画像（og.png） ----------
   左にオフ会の写真（赤ちゃんと5人が入る所まで）、右の白地にロゴ（assets/img/logo.svg）と、合言葉と一行。
   文字は合言葉「人生を大成させる。」と「副業を仲間と学べるオンラインスクール」だけ（収入の話は入れない）。
   合言葉・一行・名前の横の注記（SITE.note。いまは空で出さない）は data.js の SITE から読む（ロゴや SITE を変えたら作り直す）。 */
function siteInfo() {
  const src = fs.readFileSync(path.resolve(__dirname, '../assets/js/data.js'), 'utf8');
  const pick = k => { const m = new RegExp('\\b' + k + ":\\s*'([^']*)'").exec(src); return m ? m[1] : ''; };
  return { name: pick('name') || 'TAISEI', note: pick('note'), tagline: pick('tagline') || '人生を大成させる。', catchcopy: pick('catchcopy') || '' };
}
function ogHtml(photo, site) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 一行は「〜を」「〜る」のところで2行に分ける（1行だと細かすぎて、共有の小さな枠で読めないため）
  const cc = esc(site.catchcopy).replace(/(学べる)/, '$1<br>');
  const logo = fs.readFileSync(path.join(OUT, 'logo.svg'), 'utf8').replace(/<title>[^<]*<\/title>/, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;display:flex;background:#fff;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;color:#1d1b18}
    .ph{width:720px;height:630px;background:url(${photo}) 0 0/cover no-repeat}
    .tx{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:0 40px 0 56px;border-left:1px solid #e5e5e2}
    .nm{display:flex;align-items:flex-end;gap:12px;white-space:nowrap}
    .nm svg{width:330px;height:auto;display:block}
    .nm span{font-size:22px;font-weight:600;color:#726d65}
    .tg{margin-top:40px;font-size:40px;font-weight:800;letter-spacing:.04em;line-height:1.3;white-space:nowrap}
    .cc{margin-top:18px;font-size:26px;font-weight:600;color:#55514a;line-height:1.5;white-space:nowrap}
  </style></head><body><div class="ph"></div><div class="tx">
    <p class="nm">${logo}${site.note ? '<span>' + esc(site.note) + '</span>' : ''}</p>
    <p class="tg">${esc(site.tagline)}</p>
    <p class="cc">${cc}</p>
  </div></body></html>`;
}

async function makeOg(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  // 写真は 2016×1344 から、左端（赤ちゃん）から右の人の手元までの 1580×1383 相当を 720×630 に
  const b64 = fs.readFileSync(path.join(SRC, 'meetup-cafe.png')).toString('base64');
  const photo = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 720; c.height = 630;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const sh = 1344, sw = Math.round(sh * 720 / 630);   // 1536
    ctx.drawImage(img, 0, 0, sw, sh, 0, 0, 720, 630);
    return c.toDataURL('image/jpeg', 0.9);
  }, b64);
  await page.setContent(ogHtml(photo, siteInfo()), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const file = path.join(OUT, 'og.png');
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('og.png', Math.round(fs.statSync(file).size / 1024) + 'KB');
  await page.close();
}

(async () => {
  // 画面（ディスプレイ）が眠っている Mac では、headless の Chrome に描く合図（vsync）が来ず、requestAnimationFrame が止まって
  // 撮影・送りの動きの待ちが時間切れになる。合図を待たずに描かせる（夜中に回しても同じ結果になるように）
  const browser = await puppeteer.launch({ headless: 'new', args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage();
  for (const j of JOBS) {
    if (ONLY && !j.out.includes(ONLY)) continue;
    const b64 = fs.readFileSync(path.join(SRC, j.src)).toString('base64');
    const data = await page.evaluate(async (b64, j) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = j.w; c.height = j.h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, j.crop[0], j.crop[1], j.crop[2], j.crop[3], 0, 0, j.w, j.h);
      return c.toDataURL('image/webp', 0.8);
    }, b64, j);
    fs.writeFileSync(path.join(OUT, j.out), Buffer.from(data.split(',')[1], 'base64'));
    console.log(j.out, Math.round(fs.statSync(path.join(OUT, j.out)).size / 1024) + 'KB');
  }
  if (!ONLY || 'og.png'.includes(ONLY)) await makeOg(browser);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
