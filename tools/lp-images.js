/* ============================================================
   公開サイトに載せる「会員ページの実物のスクリーンショット」を作る
   使い方：python3 -m http.server 8765 を動かしたまま
     NODE_PATH=$(npm root -g) node tools/lp-images.js
   → assets/img/shot-<画面>.webp（スマホ幅 390px・2倍の解像度）
   会員ページを直したら撮り直すこと（公開サイトの見本が古くならないように）。
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765';
const OUT = path.resolve(__dirname, '../assets/img');
const PAGES = ['home', 'courses', 'start', 'card', 'gigs', 'feed', 'lesson/sns-basic/sb-3', 'events'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/member.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE + '/member.html?demo=1#/home', { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  for (const r of PAGES) {
    await page.evaluate(h => { location.hash = h; window.scrollTo(0, 0); }, '#/' + r);
    await new Promise(res => setTimeout(res, 400));
    const name = 'shot-' + r.split('/')[0] + '.webp';
    await page.screenshot({ path: path.join(OUT, name), type: 'webp', quality: 82 });
    console.log(name);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
