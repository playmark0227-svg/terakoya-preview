/* ============================================================
   生成した写真を、切り抜いて Web 用の webp にする
   使い方：NODE_PATH=$(npm root -g) node tools/prep-images.js
   元の画像：docs/生成画像/（Higgsfield で生成・公開リポジトリには入れない）
   出力：assets/img/photo-*.webp（公開サイト）、assets/img/fac-*.webp（講座の学部）
   crop は元画像の [x, y, 幅, 高さ]。崩れた文字が写っている所を外すための切り抜き。
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const SRC = path.resolve(__dirname, '../docs/生成画像');
const OUT = path.resolve(__dirname, '../assets/img');

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

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  for (const j of JOBS) {
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
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
