/* ============================================================
   全画面のスクリーンショットを撮る（見た目の確認用）
   使い方：
     python3 -m http.server 8765 を動かしたまま
     NODE_PATH=$(npm root -g) node tools/shoot.js <出力フォルダ> [絞り込み]
   - パソコン幅（1280）とスマホ幅（390）で、ページ全体を撮る
   - 画面の出入りの動きは止めてから撮る
   - 絞り込みを渡すと、名前にその文字を含むものだけ撮る
   ============================================================ */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8765';
const OUT = path.resolve(process.argv[2] || 'shots');
const ONLY = process.argv[3] || '';
const SIZES = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } };
const NO_MOTION = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';

const PUBLIC = [
  ['lp', '/index.html#/'],
  ['join', '/index.html#/join'],
  ['tokushoho', '/index.html#/tokushoho'],
  ['terms', '/index.html#/terms'],
  ['privacy', '/index.html#/privacy'],
];
const MEMBER = [
  'home', 'start', 'courses', 'courses/sns-basic', 'courses/marketing', 'courses?tab=archive', 'lesson/sns-basic/sb-3',
  'feed', 'ranking', 'gigs', 'gigs/g4', 'gigs/g7', 'referral', 'events', 'messages', 'perks', 'perks?tab=experts',
  'card', 'account', 'account/cancel',
];

async function settle(page) {
  await page.addStyleTag({ content: NO_MOTION }).catch(() => {});
  await new Promise(r => setTimeout(r, 350));
}

async function shot(page, name, kind) {
  if (ONLY && !name.includes(ONLY)) return;
  const base = name.replace(/[/?=]/g, '_');
  await page.screenshot({ path: path.join(OUT, kind, base + '.png'), fullPage: true });
  // 読むとき用に、縦に分けた画像も作る（長いページは縮小すると字が読めないため）
  if (process.env.TILES) {
    const vp = page.viewport();
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const step = Math.round(vp.height * 1.25);
    fs.mkdirSync(path.join(OUT, kind + '-tiles'), { recursive: true });
    for (let y = 0, i = 1; y < h; y += step, i++) {
      await page.screenshot({ path: path.join(OUT, kind + '-tiles', base + '-' + String(i).padStart(2, '0') + '.png'),
        clip: { x: 0, y, width: vp.width, height: Math.min(step, h - y) }, captureBeyondViewport: true });
    }
  }
  console.log(kind, name);
}

(async () => {
  for (const kind of Object.keys(SIZES)) fs.mkdirSync(path.join(OUT, kind), { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new' });
  for (const [kind, vp] of Object.entries(SIZES)) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(vp);

    // 公開サイト
    for (const [name, url] of PUBLIC) {
      await page.goto(BASE + url, { waitUntil: 'networkidle0' });
      await settle(page);
      await shot(page, 'site-' + name, kind);
    }
    // 申込の確認画面まで進める
    if (!ONLY || 'site-join-confirm'.includes(ONLY)) {
      await page.goto(BASE + '/index.html#/join', { waitUntil: 'networkidle0' });
      await page.type('input[name=name]', '山田 はな');
      await page.type('input[name=email]', 'hana@example.com');
      await page.select('select[name=pref]', '北海道').catch(() => {});
      await page.click('input[name=agree]');
      await page.click('button[type=submit]');
      await settle(page);
      await shot(page, 'site-join-confirm', kind);
    }

    // 会員ページ：ログイン画面 → デモ会員
    await page.goto(BASE + '/member.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE + '/member.html', { waitUntil: 'networkidle0' });
    await settle(page);
    await shot(page, 'member-login', kind);
    await page.goto(BASE + '/member.html?demo=1#/home', { waitUntil: 'networkidle0' });
    for (const r of MEMBER) {
      await page.evaluate(h => { location.hash = h; }, '#/' + r);
      await settle(page);
      await shot(page, 'member-' + r, kind);
    }
    // 窓（モーダル）
    const modals = [
      ['modal-level', () => CLG.app.levelInfo()],
      ['modal-guide', () => CLG.app.guide()],
      ['modal-notices', () => document.querySelector('[data-act="notices"]').click()],
    ];
    for (const [name, fn] of modals) {
      await page.evaluate(h => { location.hash = h; }, '#/home');
      await settle(page);
      await page.evaluate(fn);
      await settle(page);
      await shot(page, 'member-' + name, kind);
      await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach(m => m.close ? m.close() : m.remove()));
    }
    // レベルアップの窓
    if (!ONLY || 'member-modal-levelup'.includes(ONLY)) {
      await page.evaluate(() => {
        CLG.store.resetDemo(true);
        CLG.rules.completeLesson('sns-basic', 'sb-3');
        CLG.app.reward(CLG.rules.completeLesson('sns-basic', 'sb-4'));
      });
      await settle(page);
      await shot(page, 'member-modal-levelup', kind);
      await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach(m => m.close()); CLG.store.resetDemo(true); });
    }
    // 入会したての会員
    await page.evaluate(() => { CLG.store.startFresh({ name: '山田 はな' }); location.hash = '#/home'; CLG.app.refresh(); });
    for (const r of ['home', 'start', 'referral']) {
      await page.evaluate(h => { location.hash = h; }, '#/' + r);
      await settle(page);
      await shot(page, 'fresh-' + r, kind);
    }
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
