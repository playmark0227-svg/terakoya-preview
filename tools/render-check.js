/* ============================================================
   画面の描画を Node で確かめる（ブラウザなし）
   使い方：node tools/render-check.js home courses courses/ai lesson/ai/ai-1 'courses?tab=archive'
   引数なしなら、登録されている全画面を既定の引数で描く。
   - render() が例外を出さないか、空でないかを見る
   - 外から来た文字の esc() 漏れは見られないので、目で確かめること
   mount() は DOM が要るのでここでは呼ばない。
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const base = path.resolve(__dirname, '..');
global.window = global;
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
global.document = { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
global.location = { hash: '' };
global.matchMedia = () => ({ matches: false });
for (const f of ['data.js', 'ui.js', 'store.js', 'domain.js', 'member.js']) require(path.join(base, 'assets/js', f));
const dir = path.join(base, 'assets/js/screens');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) require(path.join(dir, f));

const routes = process.argv.slice(2);
const list = routes.length ? routes : Object.keys(CLG.screens);
let bad = 0;
for (const mode of ['demo', 'fresh']) {
  if (mode === 'fresh') CLG.store.startFresh({ name: '山田 はな' }); else CLG.store.resetDemo(true);
  for (const r of list) {
    const [path, qs] = r.split('?');
    const parts = path.split('/');
    const query = {};
    (qs || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); query[k] = decodeURIComponent(v || ''); });
    const scr = CLG.screens[parts[0]];
    if (!scr) { console.log(`[${mode}] ${r}: 画面が登録されていない`); bad++; continue; }
    const ctx = { name: parts[0], params: parts.slice(1), query, go() {}, refresh() {}, R: CLG.rules, U: CLG.ui, DATA: CLG.DATA, state: CLG.store.state };
    try {
      const html = scr.render(ctx);
      const title = typeof scr.title === 'function' ? scr.title(ctx) : scr.title;
      if (!html || typeof html !== 'string') throw new Error('render() が文字列を返していない');
      const undef = (html.match(/undefined|NaN|\[object Object\]/g) || []);
      console.log(`[${mode}] ${r}: OK ${html.length}文字 title=${title}${undef.length ? '  ⚠ ' + [...new Set(undef)].join(',') + ' が含まれる' : ''}`);
      if (undef.length) bad++;
    } catch (e) {
      console.log(`[${mode}] ${r}: 例外 ${e.stack.split('\n').slice(0, 3).join(' | ')}`); bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
