/* ============================================================
   画面の描画とルールを Node で確かめる（ブラウザなし・数秒で終わる）
   使い方：
     node tools/render-check.js                     全部（下の5つ）
     node tools/render-check.js members/m3 'search?q=動画'   その画面だけを、3人×6つの契約の状態で描く
     node tools/render-check.js -v                  成功した分も1行ずつ出す
     node tools/render-check.js --only=admin        member / shell / rules / admin / words のどれかだけ
   確かめること：
     1. 会員ページの画面（member）：見る人3人（在籍24日・在籍半年・入会したて）×契約の状態6つ（有効・解約予定・終了・
        支払いエラー・猶予切れ・休会）で、登録された全画面と、画面どうしのリンクの形（画面づくりの約束 §5-10）を描く。
        例外・空・undefined・NaN・[object Object] が出たら失敗。知らない id は「ページが見つかりません」になること、
        URL から来た文字が esc されていることも見る。
     2. 骨組み（shell）：member.js を小さな作りものの DOM で動かし、ログインまわり（#/login #/forgot #/reset #/set-password）、
        契約の状態で止めた画面の代わりのページ、ログインを止めた会員の画面（運営画面の保存・R.setLoginBlocked のどちらでも。
        再開したら戻る）を描く。
     3. ルール（rules）：見る人3人それぞれで「ありがとう」で書いた人のランキングが +2、自分のコメントが回答に選ばれたら +10、
        ほかの人のコメントが回答に選ばれたらその人のランキングが +10、契約の状態ごとに見られる画面（§5-7）。
        運営画面から書いて会員ページに出るもの（画面づくりの約束 §5-12）：月末の締め（closeMonth で確定 → 支払予定・
        紹介の画面にも出る・payMonth）、運営が直した中身（cmsUpsert した講座・回・録画・案件・福利厚生・イベント・お知らせが
        会員ページに出る。下書き・予約公開の前・削除は出ない。並べ直した順（cmsReorder）。足したまま全画面を描く。cmsReset で戻る）、
        コメントを隠す、通報の対応（非表示 → 受付で戻る）、応募を進める（advanceGigApp の2つの形。完了で XP・報酬は額が要る・
        戻す向きは断る・見送り）、キャンセル待ちの繰り上げ（promoteWaitlist）、ログインを止める、面談の枠、記録の申込み。
        ◆ 3回目のルール（checkRound3Rules）：投稿の固定（pinPost・unpinPost）と運営の投稿の予約・直し・取り下げ・resetStaffFeed、
        隠したときの本人へのお知らせ（1回だけ・ほかの人には出さない）、紹介報酬の取消（voidReward）、振込先がないときの繰り越しと
        登録したあとの支払い、案件の支払日（土日を避ける）、最低額に届かない payMonth の繰り越し、支払いエラー中の解約（帯・取り消し・
        カードの更新）、修了証が回の追加で消えないこと、オリエンテーションの予約、発表の「決定」、学部・案件の場所・howType・主催。
        ◆ 名前と会員番号（checkBrand）：SITE（TAISEI・合言葉・注記は空）、会員番号の頭 TS-、ログインで前の TK- も通ること、
        前の TK- で保存した記録（会員ページ・運営画面）が読み込みの前に TS- に直ること。
        ▲ 4回目のルール（checkRound4Rules。docs/仕様_やりたいこと・リクエスト・シェア.md）：data.js の GOALS（順・道の講座・案件と
        イベントがあること・ラベルに収入の言葉がない）・名簿の goals（2つまで）・足した講座2本（Lv1・4回・10〜15分・確認テスト3問・写真）・
        COUNTS・freeFirst。見る人ごとのやりたいこと・setGoals（3つ以上と知らない id は断る・「まだ決めていない」）・名簿の絞り込みと隠す、
        お試しの回（Lv1 の人は AI活用の1回目を見られて2回目は見られない・確認テストと修了証は閉じたまま）、ホームの道（pathFor）、
        リクエスト（＋1の付け外し・自分のものには押せない・運営の返事でお知らせ・「追加しました」で +20pt は1回だけ・直す・消す）、
        シェア（紹介リンクを付けたときだけ #PR と紹介リンク・文面と画像に金額がない・XP とポイントは増えない）、
        成果発表会の一般公開（申込みの入力の誤り・同じメール・切り替え）、前の保存に新しい入れ物がないときの移行。
        state.cms・state.settings・タイムラインの見回り・リクエストの返事・一般公開の申込みは人を切り替えても残るので、
        最後に消してから運営画面を確かめる。
     4. 運営画面（admin）：admin.html の全画面・タブ・詳細を、運営の役割（代表・運営・講師・経理）×見る人3人で描く。
        デモ会員の記録の申込み（会員の詳細の「済みにする」＝AD.ops.completeDataRequest で会員ページも済みになる）も確かめる。
     5. 言葉（words）：描いた HTML に、使わない言葉（見放題・商材・ヶ月・会員ID・ログインID など）が出ていないか。
        前の名前（テラコヤ・仮称）・会員番号の前の頭（TK-000000）・空の注記の「TAISEI（）」も数える。
   mount() と窓（U.modal）の中身はここでは見られない。tools/shoot.js（ブラウザ）で確かめること。
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const base = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('-v');
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').slice(7);
const ROUTE_ARGS = argv.filter(a => !a.startsWith('-'));
const want = s => (ROUTE_ARGS.length ? s === 'member' : !ONLY || ONLY === s);

/* ---------- 作りものの DOM（骨組みを動かすのに要るぶんだけ） ----------
   id は、innerHTML に入れた HTML の id="…" から拾う（「なければ作る」の分かれ道が本物と同じに動くように）。
   要素の querySelector は、何かしらの要素を返す（押したときの動きを付けるだけなので）。document の querySelector は null。 */
const ids = new Map();
function scanIds(html) { String(html).replace(/\sid="([^"]+)"/g, (m, id) => { if (!ids.has(id)) ids.set(id, new El('div', id)); return m; }); }
class El {
  constructor(tag, id) {
    this.tagName = String(tag || 'div').toUpperCase(); this.id = id || ''; this._html = ''; this.textContent = '';
    this.value = ''; this.className = ''; this.hidden = false; this.disabled = false; this.checked = false; this.type = '';
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    this.dataset = {}; this._a = {};
    this.classList = { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } };
    this.children = []; this.childNodes = []; this.parentNode = null; this.parentElement = null;
    this.firstElementChild = null; this.lastElementChild = null; this.nextElementSibling = null; this.previousElementSibling = null;
    this.offsetWidth = 0; this.offsetHeight = 0; this.scrollHeight = 0; this.clientHeight = 0; this.clientWidth = 0; this.scrollTop = 0; this.scrollLeft = 0;
    this.selectionStart = 0; this.selectionEnd = 0; this.files = []; this.options = []; this.elements = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); if (this === doc.root) { ids.clear(); ids.set('root', this); ['announcer', 'toast'].forEach(k => ids.set(k, new El('div', k))); } scanIds(v); }
  get outerHTML() { return this._html; }
  insertAdjacentHTML(pos, html) { this._html += String(html); scanIds(html); }
  setAttribute(k, v) { this._a[k] = String(v); } getAttribute(k) { return k in this._a ? this._a[k] : null; }
  removeAttribute(k) { delete this._a[k]; } hasAttribute(k) { return k in this._a; } toggleAttribute() { return false; }
  addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
  querySelector() { return new El('div'); } querySelectorAll() { return []; } getElementsByTagName() { return []; }
  closest() { return null; } matches() { return false; } contains() { return false; }
  focus() {} blur() {} click() {} select() {} setSelectionRange() {} scrollIntoView() {} scrollTo() {} scrollBy() {}
  remove() {} append() {} prepend() {} appendChild(c) { return c; } insertBefore(c) { return c; } removeChild(c) { return c; } replaceWith() {} before() {} after() {}
  showModal() {} show() {} close() {} reset() {} submit() {} requestSubmit() {} checkValidity() { return true; } reportValidity() { return true; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  getClientRects() { return []; } animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  cloneNode() { return new El(this.tagName); }
}
const listeners = { doc: {}, win: {} };
function on(bag, t, fn) { (bag[t] = bag[t] || []).push(fn); }
const doc = {
  title: '', readyState: 'loading', visibilityState: 'visible', hidden: false,
  body: new El('body'), documentElement: new El('html'), head: new El('head'),
  get activeElement() { return this.body; },
  addEventListener(t, fn) { on(listeners.doc, t, fn); }, removeEventListener() {},
  getElementById(id) { return ids.get(id) || null; },
  querySelector() { return null; }, querySelectorAll() { return []; }, getElementsByTagName() { return []; },
  createElement(tag) { return new El(tag); }, createTextNode() { return new El('#text'); }, createDocumentFragment() { return new El('#frag'); },
  execCommand() { return false; }, hasFocus() { return true; }
};
doc.root = new El('div', 'root');
ids.set('root', doc.root);

global.window = global;
global.document = doc;
global.localStorage = { _s: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, clear() { this._s = {}; }, key(i) { return Object.keys(this._s)[i] || null; }, get length() { return Object.keys(this._s).length; } };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.location = { hash: '', pathname: '/member.html', search: '', href: '', protocol: 'file:', hostname: '', origin: '', reload() {}, assign() {}, replace() {} };
global.history = { state: null, replaceState(st, t, url) { this.state = st; setUrl(url); }, pushState(st, t, url) { this.state = st; setUrl(url); }, back() {} };
function setUrl(url) { if (url == null) return; const i = String(url).indexOf('#'); if (i >= 0) location.hash = String(url).slice(i); }
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
global.addEventListener = (t, fn) => on(listeners.win, t, fn);
global.removeEventListener = () => {};
global.scrollTo = () => {}; global.scrollBy = () => {}; global.scrollY = 0; global.pageYOffset = 0; global.innerWidth = 1280; global.innerHeight = 900;
global.getComputedStyle = () => ({ getPropertyValue() { return ''; } });
global.requestAnimationFrame = fn => setTimeout(fn, 0); global.cancelAnimationFrame = id => clearTimeout(id);
global.CSS = { escape: s => String(s), supports: () => false };
global.isSecureContext = false;
['IntersectionObserver', 'ResizeObserver', 'MutationObserver'].forEach(k => { global[k] = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }; });
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', onLine: true, standalone: false, clipboard: null, maxTouchPoints: 0, platform: '' }, configurable: true, writable: true }); } catch (e) {}

for (const f of ['data.js', 'ui.js', 'store.js', 'domain.js', 'member.js']) require(path.join(base, 'assets/js', f));
const dir = path.join(base, 'assets/js/screens');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) require(path.join(dir, f));
const R = CLG.rules, U = CLG.ui, D = CLG.DATA, store = CLG.store;

/* ---------- 見る人と契約の状態 ---------- */
const PERSONAS = { demo: '在籍24日', veteran: '在籍半年', fresh: '入会したて' };
const PLANS = { active: '有効', canceling: '解約予定', ended: '終了', past_due: '支払いエラー', past_due_x: '猶予切れ', paused: '休会' };
function become(persona, plan) {
  if (persona === 'fresh') store.startFresh({ name: '山田 はな', email: 'hana.yamada.0312@example.jp' });
  else if (persona === 'veteran') store.startVeteran(true);
  else store.resetDemo(true);
  store.login();
  if (plan && plan !== 'active') R.setPlanDemo(plan === 'past_due_x' ? 'past_due' : plan, { expired: plan === 'past_due_x' });
}

/* ---------- URL を ctx にする（骨組みと同じ：壊れた % は文字のまま） ---------- */
function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
function parse(route) {
  const qi = route.indexOf('?'), p = qi < 0 ? route : route.slice(0, qi), qs = qi < 0 ? '' : route.slice(qi + 1);
  const query = {};
  qs.split('&').filter(Boolean).forEach(kv => { const i = kv.indexOf('='); query[dec(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : dec(kv.slice(i + 1).replace(/\+/g, ' ')); });
  const parts = p.split('/').filter(Boolean).map(dec);
  return { name: parts[0] || 'home', params: parts.slice(1), query, key: parts.join('/') };
}

/* ---------- 結果 ---------- */
let bad = 0, count = 0;
const problems = [];
function fail(section, label, msg) { bad++; problems.push(`[${section}] ${label}: ${msg}`); console.log(`✗ [${section}] ${label}: ${msg}`); }
function ok(section, label, msg) { if (VERBOSE) console.log(`  [${section}] ${label}: ${msg}`); }
const JUNK = /undefined|NaN|\[object Object\]/g;
function junk(s) { return [...new Set(String(s || '').match(JUNK) || [])]; }

/* 使わない言葉（脱AIの約束・決定事項・画面づくりの約束 §2 §3）。描いた HTML と題に出たら失敗 */
const WORDS = [
  ['見放題', /見放題/], ['商材', /商材/], ['勉強会アーカイブ', /勉強会アーカイブ/], ['ヶ月', /[ヶヵケ]月/], ['準備中', /準備中/],
  ['example.com', /example\.com/], ['v0.1', /v0\.1\b/], ['9月期', /\d+月期/], ['会員ID', /会員ID/], ['ログインID', /ログインID/],
  ['壁打ち', /壁打ち/], ['キラキラの記号', /✨|sparkle/],
  // 名前は TAISEI（2026-09-25）。前の仮の名前・注記と、会員番号の前の頭（TK-）。注記（SITE.note）が空のまま「（）」を付けたもの
  ['テラコヤ', /テラコヤ|TERAKOYA/], ['仮称', /仮称/], ['TK-（会員番号の前の頭）', /TK-\d{6}/], ['空の（）', /TAISEI（）/],
  // 収入を約束する言い方（§3）。運営画面は、止めた投稿を見せるために出すので数えない
  ['誰でも稼げる', /誰でも稼げる/, 'member'], ['不労所得', /不労所得/, 'member'], ['ストック収入', /ストック収入/, 'member'], ['すぐ回収', /すぐ(に)?回収/, 'member']
];
const wordHits = {};
function sweep(where, html) {
  WORDS.forEach(([w, re, only]) => { if ((!only || !/^admin/.test(where)) && re.test(html)) (wordHits[w] = wordHits[w] || new Set()).add(where); });
  // ¥ は領収書の金額欄だけ（U.yen(n, { mark: true })）。画面の本文に出たら数える
  if (/¥/.test(html)) (wordHits['¥'] = wordHits['¥'] || new Set()).add(where);
}

/* ============================================================
   1. 会員ページの画面
   ============================================================ */
const NF = 'ページが見つかりません';
// esc の漏れを見るための印（URL から来た文字）
const XSS = '<b data-x>x</b>';
const XSS_Q = encodeURIComponent(XSS);
function memberRoutes() {
  const firstLesson = c => (c && c.lessons && c.lessons[0] ? c.lessons[0].id : 'x');
  const byId = id => D.COURSES.find(c => c.id === id);
  const list = Object.keys(CLG.screens).map(n => ({ r: n }));
  const add = (r, o) => list.push(Object.assign({ r }, o || {}));
  // M5 ホーム・スタートガイド
  add('start?line=ok'); add('start?line=ng');
  // M2 講座
  add('courses?tab=archive'); add('courses/orientation'); add('courses/sns-basic'); add('courses/marketing');
  add('courses/orientation?focus=quiz'); add('courses/business-basic?focus=quiz');
  add('courses/orientation/certificate'); add('courses/sns-basic/certificate');
  add('courses/archive/' + (D.ARCHIVE[0] || {}).id); add('courses/archive/ar-2');
  add('lesson/sns-basic/sb-3'); add('lesson/orientation/' + firstLesson(byId('orientation'))); add('lesson/money-tax/mt-2'); add('lesson/marketing/' + firstLesson(byId('marketing')));
  // M1 タイムライン・名簿・ランキング
  ['all', 'post', 'question', 'win', 'intro', 'staff', 'mine'].forEach(k => add('feed?kind=' + k));
  add('feed?kind=intro&cohort=2026-09'); add('feed?post=q1'); add('feed?page=2'); add('feed?intro=1');
  add('feed?compose=post&text=' + encodeURIComponent('今日のオフ会の感想です。')); add('feed?compose=post&text=' + XSS_Q, { xss: true });
  ['my1', 'my2', 'q1', 'q3', 'q10', 'p17', 'i15'].forEach(id => add('feed/' + id)); add('feed/q1?c=q1-r1'); add('feed/q1?write=1');
  add('members?n=2'); ['m3', 'm8', 'm12', 'me', 'TS-000308', 'TS-000271'].forEach(id => add('members/' + id));
  add('ranking?month=last');
  // M3 案件・紹介
  D.GIG_TYPES.forEach(t => add('gigs?type=' + t.id));
  ['g2', 'g4', 'g7', 'gc1', 'gc4', 'mg1', 'new'].forEach(id => add('gigs/' + id)); add('gigs/new?from=mg1');
  add('referral?focus=rows'); add('referral?focus=bank');
  // M4 イベント・相談
  ['upcoming', 'reserved', 'attended'].forEach(t => add('events?tab=' + t)); add('events?kind=offline&mode=cal'); add('events?kind=showcase');
  ['e1', 'e4', 'e15', 'pe1'].forEach(id => add('events/' + id));
  add('messages?kind=' + encodeURIComponent('講座の質問') + '&ref=' + encodeURIComponent('lesson:sns-basic/sb-3'));
  add('messages?kind=' + encodeURIComponent('講座の質問') + '&ref=' + encodeURIComponent('archive:ar-2'));
  add('messages?kind=' + encodeURIComponent('面談の予約'));
  // M5 福利厚生・会員証
  add('perks?focus=pk3'); add('perks?tab=experts'); add('perks?tab=experts&focus=ex1'); add('card?show=1');
  // M6 アカウント・お知らせ
  ['card', 'plan', 'invoices', 'notify', 'password', 'email', 'bank'].forEach(f => add('account?focus=' + f)); add('account/cancel');
  add('notices?tab=unread');
  // M7 探す・ヘルプ
  add('search?q=' + encodeURIComponent('動画')); add('search?q=' + encodeURIComponent('税金')); add('search?q=zzzzqqq'); add('search?q=%E0%A4%A');
  add('search?q=' + XSS_Q, { xss: true }); add('search?q=' + encodeURIComponent('動画') + '&type=courses');
  add('help?focus=h9'); add('help?focus=h17'); add('help?cat=' + encodeURIComponent('支払い'));
  // ▲ やりたいこと・お試しの回・リクエスト・シェア（2026-09-28）
  add('start?focus=goals'); add('account?focus=goals');
  (D.GOALS || []).forEach(g => { add('members?goal=' + g.id); add('courses?goal=' + g.id); });
  add('members?goal=none'); add('members?goal=zzz'); add('courses?goal=' + XSS_Q, { xss: true });
  ['remote-work', 'change-basic', 'ai', 'video'].forEach(id => add('courses/' + id));
  add('lesson/ai/' + firstLesson(byId('ai'))); add('lesson/ai/' + ((byId('ai') || { lessons: [] }).lessons[1] || {}).id);
  add('lesson/video/' + firstLesson(byId('video'))); add('lesson/remote-work/' + firstLesson(byId('remote-work'))); add('lesson/change-basic/' + firstLesson(byId('change-basic')));
  add('courses/remote-work/certificate'); add('courses/remote-work?focus=quiz');
  add('events/e4'); add('feed?kind=intro');
  // リクエストの画面（screens/requests.js。無ければ「画面が登録されていない」で失敗）
  add('requests?tab=new'); add('requests?tab=done'); add('requests?focus=rq1'); add('requests?focus=rq12'); add('requests?focus=nope');
  D.REQUEST_KINDS.forEach(k => { add('requests?kind=' + k.id); add('requests?new=1&kind=' + k.id); });
  add('requests?new=1'); add('requests?new=1&kind=zzz'); add('requests?focus=' + XSS_Q, { xss: true }); add('requests?kind=' + XSS_Q, { xss: true });
  // 見つからない（§5-1：render は U.notFound、title は「ページが見つかりません」）
  ['feed/nope', 'gigs/nope', 'members/nope', 'events/nope', 'courses/nope', 'courses/archive/nope', 'courses/nope/certificate', 'lesson/nope/x', 'lesson/sns-basic/nope']
    .forEach(r => add(r, { nf: true }));
  add('members/' + XSS_Q, { xss: true, nf: true });
  return list;
}

function renderMember(route) {
  const r = parse(route);
  const scr = CLG.screens[r.name];
  if (!scr) return { err: '画面が登録されていない' };
  const ctx = { name: r.name, params: r.params, query: r.query, key: r.key, go() {}, refresh() {}, announce() {}, R, U, DATA: D, state: store.state };
  try {
    const html = scr.render(ctx);
    const title = typeof scr.title === 'function' ? scr.title(ctx) : scr.title;
    const back = typeof scr.back === 'function' ? scr.back(ctx) : null;
    return { html, title, back };
  } catch (e) { return { err: '例外 ' + e.stack.split('\n').slice(0, 3).join(' | ') }; }
}

function checkMember() {
  const routes = (ROUTE_ARGS.length ? ROUTE_ARGS.map(r => ({ r })) : memberRoutes()).filter(it => {
    if (CLG.screens[parse(it.r).name]) return true;
    fail('member', it.r, '画面が登録されていない'); return false;
  });
  const seen = {};
  let n = 0;
  for (const persona of Object.keys(PERSONAS)) {
    for (const plan of Object.keys(PLANS)) {
      for (const it of routes) {
        become(persona, plan);
        const label = `${persona}/${plan} ${it.r}`;
        const o = renderMember(it.r);
        n++; count++;
        if (o.err) { fail('member', label, o.err); continue; }
        if (!o.html || typeof o.html !== 'string') { fail('member', label, 'render() が文字列を返していない'); continue; }
        if (typeof o.title !== 'string' || !o.title) { fail('member', label, 'title が空'); continue; }
        const j = junk(o.html + ' ' + o.title + ' ' + (o.back ? o.back.label + o.back.href : ''));
        if (j.length) { fail('member', label, j.join(',') + ' が含まれる'); continue; }
        if (it.nf && o.title !== NF) { fail('member', label, `知らない id なのに題が「${o.title}」（§5-1：「${NF}」にする）`); continue; }
        // title は文字のまま（骨組みが esc して帯とタブの題に出す）。見るのは HTML だけ
        if (it.xss && /<b data-x>/.test(o.html)) { fail('member', label, 'URL から来た文字が esc されていない'); continue; }
        sweep('member ' + parse(it.r).name, o.html + o.title);
        const s = seen[it.r] = seen[it.r] || { n: 0, len: 0, title: o.title };
        s.n++; s.len = Math.max(s.len, o.html.length);
        ok('member', label, `OK ${o.html.length}文字 title=${o.title}`);
      }
    }
  }
  if (ROUTE_ARGS.length) Object.keys(seen).forEach(r => console.log(`  ${r}: ${seen[r].n}通り OK（最大 ${seen[r].len}文字）title=${seen[r].title}`));
  return n;
}

/* ============================================================
   2. 骨組み（member.js を作りものの DOM で動かす）
   ============================================================ */
function checkShell() {
  let n = 0;
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => errs.push(a.map(x => (x && x.stack) || String(x)).join(' ').split('\n')[0]);
  const fire = (bag, t) => (bag[t] || []).forEach(fn => fn({ type: t }));
  function visit(label, hash, expect) {
    location.hash = hash; ids.clear(); ids.set('root', doc.root); doc.root._html = '';
    errs.length = 0;
    try { fire(listeners.win, 'hashchange'); } catch (e) { fail('shell', label, '例外 ' + e.stack.split('\n').slice(0, 2).join(' | ')); return; }
    n++; count++;
    const view = ids.get('view');
    const html = doc.root.innerHTML + (view ? view.innerHTML : '');
    const j = junk(html + doc.title);
    if (j.length) return fail('shell', label, j.join(',') + ' が含まれる');
    if (/表示できませんでした/.test(html)) return fail('shell', label, '「表示できませんでした」になった ' + errs.join(' / '));
    if (expect && !expect.test(html + doc.title)) return fail('shell', label, `期待した中身（${expect}）がない。題：${doc.title}`);
    sweep('shell ' + label.split(' ')[0], html);
    ok('shell', label, `OK 題：${doc.title}`);
  }
  try {
    store.resetDemo(true); store.logout();
    fire(listeners.doc, 'DOMContentLoaded');
    // ログインまわり（ログインしていないとき）
    visit('login', '#/login', /loginForm/);
    // ロゴ（印の下に TAISEI）と合言葉はログインの画面に1回。題は「ログイン｜TAISEI 会員ページ」
    visit('login-brand', '#/login', /brandmark--stack[\s\S]*class="login__tagline">人生を大成させる。<\/p>[\s\S]*ログイン｜TAISEI 会員ページ$/);
    visit('deep-link', '#/gigs/g4', /loginForm/);
    visit('forgot', '#/forgot', /forgotForm/);
    visit('reset', '#/reset?token=demo', /resetForm|パスワード/);
    visit('reset-expired', '#/reset?token=expired', /期限/);
    visit('reset-bad', '#/reset?token=zzz', /リンク/);
    visit('set-password', '#/set-password?token=demo-set', /setForm|パスワード/);
    // 入会したて（パスワードを決める前）のログイン画面
    store.startFresh({ name: '山田 はな', email: 'hana.yamada.0312@example.jp' }); store.logout();
    visit('fresh-login', '#/login', /loginForm/);
    visit('fresh-set-password', '#/set-password?token=demo-set', /パスワード/);
    // 契約の状態で止めた画面（§5-7）
    for (const persona of Object.keys(PERSONAS)) {
      for (const plan of Object.keys(PLANS)) {
        become(persona, plan);
        const g = R.planGate('courses');
        visit(`${persona}/${plan} courses`, '#/courses', g.ok ? /scr-courses/ : /class="gate"/);
        visit(`${persona}/${plan} home`, '#/home', R.planGate('home').ok ? /scr-home/ : /class="gate"/);
        visit(`${persona}/${plan} unknown`, '#/nope-' + persona, new RegExp(NF));
      }
    }
    // 運営画面で「ログインを止める」にされた会員
    store.resetDemo(true);
    const K = 'terakoya-admin-v1', saved = localStorage.getItem(K);
    let db = {}; try { db = JSON.parse(saved || '{}') || {}; } catch (e) {}
    db.members = db.members || {}; db.members[store.state.me.id] = Object.assign({}, db.members[store.state.me.id], { suspended: true });
    localStorage.setItem(K, JSON.stringify(db));
    visit('suspended', '#/home', /ログインを止めています/);
    if (saved == null) localStorage.removeItem(K); else localStorage.setItem(K, saved);
    // ☆ 会員ページの保存に書く止め方（R.setLoginBlocked）。再開したら戻る
    if (typeof R.setLoginBlocked === 'function') {
      for (const persona of Object.keys(PERSONAS)) {
        become(persona, 'active');
        R.setLoginBlocked(true, '確かめ');
        visit(`${persona} login-blocked`, '#/home', /ログインを止めています/);
        store.logout();
        visit(`${persona} login-blocked-login`, '#/login', /loginForm/);
        store.login(); R.setLoginBlocked(false);
        visit(`${persona} login-resumed`, '#/home', /scr-home/);
      }
    }
  } finally { console.error = origErr; }
  // ☆ 画面のファイルを HTML が読んでいるか（ここは screens/ を全部読むので、member.html に書き忘れても描けてしまう。
  //   2026-09-28 に requests.js・requests.css の書き忘れで、ブラウザだけ「ページが見つかりません」になった）
  const html = f => { try { return fs.readFileSync(path.join(base, f), 'utf8'); } catch (e) { return ''; } };
  const loads = (page, rel) => new RegExp('(src|href)="' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?v=[^"]*)?"').test(html(page));
  const lsx = d => { try { return fs.readdirSync(path.join(base, d)).sort(); } catch (e) { return []; } };
  [['member.html', 'assets/js/screens/', '.js'], ['member.html', 'assets/css/screens/', '.css'], ['admin.html', 'assets/js/admin/', '.js']].forEach(([page, d, ext]) => {
    if (!html(page)) return;
    const miss = lsx(d).filter(f => f.endsWith(ext) && !loads(page, d + f));
    n++; count++;
    if (miss.length) fail('shell', page + ' が読むファイル', d + ' の ' + miss.join('・') + ' を読んでいない');
    else ok('shell', page + ' が読むファイル', d + '*' + ext);
  });
  return n;
}

/* ============================================================
   3. ルール（数が合うか）
   ============================================================ */
function checkRules() {
  let n = 0;
  const pt = id => (D.POINT_RULES.find(r => r.id === id) || {}).pt;
  const rankOf = pid => { const row = R.ranking('points').find(r => r.id === pid || r.person === pid); return row ? row.value : null; };
  function assert(label, cond, msg) { n++; count++; if (cond) ok('rules', label, 'OK'); else fail('rules', label, msg); }
  const questions = () => { const f = R.feed('question'); return (f.items || f).filter(p => p.kind === 'question'); };
  const othersComment = (pred) => {
    for (const p of questions()) for (const c of R.comments(p.id)) {
      const who = R.person(c.by);
      if (!c.mine && !who.me && !who.staff && !c.answer && pred(c, p)) return { c, p };
    }
    return null;
  };
  for (const persona of Object.keys(PERSONAS)) {
    // 「ありがとう」→ 書いた人のランキング +2（自分の pt には入らない）
    become(persona, 'active');
    const t = othersComment(c => c.canThank && !c.thanked);
    if (!t) { assert(persona + ' thank', false, '「ありがとう」を押せるコメントが見つからない'); }
    else {
      const before = rankOf(t.c.by), mine = R.points().month;
      const res = R.thankComment(t.c.id);
      assert(persona + ' thank → ranking +' + pt('thanks'), res && res.toPt === pt('thanks') && rankOf(t.c.by) === before + pt('thanks') && R.points().month === mine,
        `書いた人 ${t.c.by} のランキング ${before} → ${rankOf(t.c.by)}（+${pt('thanks')} のはず）、自分 ${mine} → ${R.points().month}`);
      assert(persona + ' thank twice', R.thankComment(t.c.id) == null, '同じコメントに2回「ありがとう」できてしまう');
    }
    // 自分のコメントが回答に選ばれた → 自分 +10
    become(persona, 'active');
    const q = questions().find(p => !R.person(p.by).me);
    const added = q && R.addComment(q.id, 'クラウド会計の無料プランで作れます。');
    const cid = added && (added.id || (added.comment && added.comment.id));
    if (!cid) assert(persona + ' answer mine', false, '質問にコメントを書けない');
    else {
      const before = R.points().month, rb = rankOf('me');
      const res = R.markAnswer(cid);
      assert(persona + ' markAnswer(自分) → +' + pt('answer'), res && res.ok && R.points().month === before + pt('answer') && rankOf('me') === rb + pt('answer'),
        `自分の今月 ${before} → ${R.points().month}、ランキング ${rb} → ${rankOf('me')}（+${pt('answer')} のはず）`);
      assert(persona + ' markAnswer twice', R.markAnswer(cid) == null, '同じコメントを2回回答にできてしまう');
    }
    // ほかの人のコメントが回答に選ばれた → その人のランキング +10
    become(persona, 'active');
    const a = othersComment(() => true);
    if (!a) assert(persona + ' answer other', false, '回答に選べるコメントが見つからない');
    else {
      const before = rankOf(a.c.by), mine = R.points().month;
      const res = R.markAnswer(a.c.id);
      assert(persona + ' markAnswer(ほかの人) → その人 +' + pt('answer'), res && res.ok && rankOf(a.c.by) === before + pt('answer') && R.points().month === mine,
        `${a.c.by} のランキング ${before} → ${rankOf(a.c.by)}（+${pt('answer')} のはず）、自分 ${mine} → ${R.points().month}`);
    }
  }
  // 契約の状態ごとに見られる画面（画面づくりの約束 §5-7）
  const ALL = Object.keys(CLG.screens);
  const LIMITED = ['home', 'start', 'messages', 'card', 'account', 'notices', 'help'];
  const OPEN = { active: ALL, canceling: ALL, past_due: ALL, ended: ['account', 'notices', 'help', 'card'], past_due_x: LIMITED, paused: LIMITED };
  for (const plan of Object.keys(PLANS)) {
    become('demo', plan);
    const got = ALL.filter(s => R.planGate(s).ok).sort().join(' '), exp = OPEN[plan].filter(s => ALL.includes(s)).sort().join(' ');
    assert('planGate ' + plan, got === exp, `見られる画面が違う：${got}（§5-7 は ${exp}）`);
  }
  checkStaffRules(assert);   // assert が n を数える
  checkRound3Rules(assert);
  checkBrand(assert);
  checkRound4Rules(assert);
  return n;
}

/* ☆ 運営画面から書いて、会員ページに出るもの（2回目のルール）。
   月末の締め・運営が直した中身（CMS）・コメントを隠す・通報の対応・応募を進める／見送る・キャンセル待ちの繰り上げ・
   並べ直し・ログインを止める・面談の枠・記録の申込み。
   state.cms と state.settings は人を切り替えても残るので、確かめたら必ず消す（後ろの運営画面の確かめに持ち込まない） */
function checkStaffRules(assert) {
  const need = ['closeMonth', 'payMonth', 'cmsUpsert', 'cmsRemove', 'cmsReorder', 'cmsList', 'cmsReset', 'hideComment', 'unhideComment', 'resolveReport',
    'reportPost', 'advanceGigApp', 'declineGigApp', 'promoteWaitlist', 'joinWaitlist', 'setLoginBlocked', 'loginBlocked', 'setMeetingSlots', 'meetingSlots',
    'requestData', 'completeDataRequest'];
  const missing = need.filter(f => typeof R[f] !== 'function');
  assert('R.* がそろっている', !missing.length, 'ない関数：' + missing.join('・'));
  if (missing.length) return;
  const html = r => { const o = renderMember(r); return o.err ? '' : String(o.html || ''); };
  const times = (s, w) => s.split(w).length - 1;
  const realNow = CLG.now;
  try {
    /* 1. 月末の締め（在籍半年）：確定の明細がまとめて支払予定になり、紹介の画面にも「支払予定」で出る。
       確定の明細は時計しだいで無いときがあるので、そのときは保留の明細が確定になる時刻まで時計を進めて確かめる */
    become('veteran', 'active');
    let conf = R.rewardRows().filter(r => r.status === 'confirmed');
    if (!conf.length) {
      const hold = R.rewardRows().filter(r => r.status === 'hold' && r.confirmAt).sort((a, b) => new Date(a.confirmAt) - new Date(b.confirmAt))[0];
      if (hold) { const t = new Date(hold.confirmAt).getTime() + 3600000; CLG.now = () => new Date(t); conf = R.rewardRows().filter(r => r.status === 'confirmed'); }
    }
    if (!conf.length) assert('closeMonth', false, '在籍半年の会員に、締められる（確定の）明細がない');
    else {
      const before = times(html('referral'), '支払予定');
      const res = R.closeMonth();
      const ids = (res && res.rows) || [];
      const rows = R.rewardRows().filter(r => ids.includes(r.id));
      assert('closeMonth → 確定の明細が支払予定に', res && res.ok && res.count === conf.length && res.amount === conf.reduce((a, r) => a + r.amount, 0) &&
        rows.length === ids.length && rows.every(r => r.status === 'scheduled'),
        `closeMonth の結果 ${JSON.stringify(res)}、確定だった明細 ${conf.map(r => r.id).join(',')}、いま ${rows.map(r => r.id + ':' + r.status).join(',')}`);
      const pay = res && res.payAt ? new Date(res.payAt) : null;
      assert('closeMonth → 支払日は翌月の平日', !!pay && pay.getDay() !== 0 && pay.getDay() !== 6 &&
        pay.getFullYear() * 12 + pay.getMonth() === CLG.now().getFullYear() * 12 + CLG.now().getMonth() + 1, `支払日 ${res && res.payAt}`);
      assert('closeMonth → 紹介の画面が「支払予定」', times(html('referral'), '支払予定') > before, `紹介の画面の「支払予定」の数が ${before} のまま`);
      const again = R.closeMonth();
      assert('closeMonth 2回目は締めるものがない', again && again.ok === false && !!again.error, '同じ月を2回締められてしまう ' + JSON.stringify(again));
      assert('closeMonth 月の形の誤り', R.closeMonth('2026-13').ok === false, '「2026-13」を締められてしまう');
      const paid = R.payMonth();
      const st = R.rewardRows().filter(r => ids.includes(r.id)).map(r => r.status);
      assert('payMonth → 支払済か繰り越し', paid && (paid.ok ? st.every(s => s === 'paid') : Array.isArray(paid.carried) && st.every(s => s === 'scheduled')),
        `payMonth の結果 ${JSON.stringify(paid)}、明細 ${st.join(',')}`);
    }
    CLG.now = realNow;

    /* 2. 運営が直した中身（CMS）が会員ページに出る。下書き・予約公開の前・削除は出ない。cmsReset で data.js に戻る */
    become('demo', 'active');
    const cTitle = (D.COURSES.find(c => c.id === 'sns-basic') || {}).title;
    const cmsRoutes = [];
    const cms = (label, kind, obj, routes, word) => {
      const r = R.cmsUpsert(kind, obj);
      const rts = r && r.ok ? routes(r.id) : [];
      const shown = rts.filter(rt => !html(rt).includes(word));
      cmsRoutes.push(...rts);
      assert('cmsUpsert ' + label, r && r.ok && !shown.length, r && r.ok ? `会員ページに出ない：${shown.join('・')}` : '断られた ' + JSON.stringify(r));
      return r && r.id;
    };
    cms('講座の題を直す', 'course', { id: 'sns-basic', title: 'SNS発信入門（題を直した）' }, () => ['courses', 'courses/sns-basic'], '題を直した');
    cms('回を足す', 'lesson', { course: 'sns-basic', title: '足した回（確かめ）', min: 12 }, () => ['courses/sns-basic'], '足した回（確かめ）');
    const perk = cms('福利厚生を足す', 'perk', { title: '足した福利厚生（確かめ）', cat: (D.PERKS[0] || {}).cat || '暮らし' }, () => ['perks'], '足した福利厚生');
    cms('案件を足す', 'gig', { title: '足した案件（確かめ）', type: 'small', reward: '1件 500円' }, id => ['gigs', 'gigs/' + id], '足した案件');
    const soon = new Date(CLG.now().getTime() + 5 * 86400000); soon.setHours(20, 0, 0, 0);
    cms('イベントを足す', 'event', { title: '足したイベント（確かめ）', at: soon.toISOString(), kind: 'online' }, id => ['events', 'events/' + id], '足したイベント');
    const faculty = (D.COURSES.find(c => c.id === 'sns-basic') || D.COURSES[0]).faculty;
    cms('録画を足す', 'archive', { title: '足した録画（確かめ）', date: new Date(CLG.now().getTime() - 3 * 86400000).toISOString(), faculty },
      id => ['courses?tab=archive', 'courses/archive/' + id], '足した録画');
    cms('お知らせを足す', 'notice', { text: '運営からのお知らせ（確かめ）', link: '#/courses', target: 'all' }, () => ['notices'], '運営からのお知らせ（確かめ）');
    // 欄の少ない新しい講座（題と学部だけ）と、その回（題だけ）。回が公開されるまで講座は出ない
    const nc = R.cmsUpsert('course', { title: '足した講座（確かめ）', faculty });
    const hiddenCourse = nc.ok && !html('courses').includes('足した講座');
    const nl = nc.ok ? cms('新しい講座に回を足す', 'lesson', { course: nc.id, title: '足した講座の第1回' }, id => ['courses', 'courses/' + nc.id, 'lesson/' + nc.id + '/' + id], '足した講座') : null;
    assert('cmsUpsert 回のない講座は出ない', hiddenCourse && !!nl, `講座 ${JSON.stringify(nc.errors || nc.ok)}・回を足す前に出ていない ${hiddenCourse}`);
    // 中身を足したまま、会員ページの全部の画面を描く（欄の少ないものでも undefined や例外が出ない）
    const bad = [];
    for (const it of memberRoutes().concat(cmsRoutes.map(r => ({ r })))) {
      const o = renderMember(it.r);
      if (o.err || !o.html) bad.push(it.r + ' ' + (o.err || '空'));
      else if (junk(o.html + ' ' + o.title).length) bad.push(it.r + ' ' + junk(o.html + ' ' + o.title).join(','));
    }
    assert('cmsUpsert 足した中身があっても全画面を描ける', !bad.length, bad.slice(0, 5).join(' / '));
    R.cmsUpsert('notice', { text: 'ほかの会員あて（確かめ）', link: '#/courses', target: 'member:TS-000001' });
    assert('cmsUpsert お知らせの宛先', !R.notices().some(x => /ほかの会員あて/.test(x.text)), 'ほかの会員あてのお知らせが出ている');
    if (perk) {
      R.cmsUpsert('perk', { id: perk, publish: 'draft' });
      const row = R.cmsList('perk').find(x => x.id === perk);
      assert('cmsUpsert 下書きは出ない', !html('perks').includes('足した福利厚生') && !D.PERKS.some(p => p.id === perk) && row && row.cms.visible === false,
        '下書きにした福利厚生が会員ページに出ている（か、運営の一覧から消えた）');
    }
    R.cmsUpsert('perk', { title: '予約公開（確かめ）', cat: (D.PERKS[0] || {}).cat || '暮らし', publish: 'scheduled', publishAt: new Date(CLG.now().getTime() + 86400000).toISOString() });
    assert('cmsUpsert 予約公開の前は出ない', !html('perks').includes('予約公開（確かめ）'), '公開の時刻の前なのに出ている');
    const p0 = (D.PERKS[0] || {}).id;
    R.cmsRemove('perk', p0);
    assert('cmsRemove data.js の分を消す', !D.PERKS.some(p => p.id === p0), `${p0} が消えない`);
    const banned = R.cmsUpsert('gig', { title: '誰でも稼げる副業', type: 'small', reward: '月10万円保証' });
    assert('cmsUpsert 載せられない言葉', banned && banned.ok === false && banned.errors && (banned.errors.title || banned.errors.reward), '収入を約束する案件が載ってしまう');
    R.cmsReset();
    assert('cmsReset で data.js に戻る', (D.COURSES.find(c => c.id === 'sns-basic') || {}).title === cTitle && D.PERKS.some(p => p.id === p0) &&
      !html('perks').includes('足した福利厚生') && !html('courses/sns-basic').includes('足した回'), '直した中身が残っている');

    /* 3. コメントを隠す（書いた本人にだけ理由つきで見える）・通報の対応（非表示 → 受付で戻る。通報した人にお知らせ） */
    for (const persona of Object.keys(PERSONAS)) {
      become(persona, 'active');
      const posts = R.feed({ kind: 'all', page: 1, pageSize: 500 }).items;
      let pick = null;
      for (const p of posts) { for (const c of R.comments(p.id)) { const w = R.person(c.by); if (!c.mine && !w.me && !w.staff) { pick = { p, c }; break; } } if (pick) break; }
      if (!pick) { assert(persona + ' hideComment', false, 'ほかの人のコメントが見つからない'); continue; }
      const seen = () => R.comments(pick.p.id).some(c => c.id === pick.c.id);
      R.hideComment(pick.c.id, '確かめ');
      const hid = !seen(); R.unhideComment(pick.c.id);
      assert(persona + ' hideComment → ほかの人には出ない・戻せる', hid && seen(), `隠す ${hid}、戻す ${seen()}`);
      const mine = R.addComment(pick.p.id, '自分のコメントです。');
      R.hideComment(mine.id, '確かめの理由');
      const all = R.comments(pick.p.id).reduce((a, c) => a.concat([c], c.replies || []), []);
      const mc = all.find(c => c.id === mine.id);
      assert(persona + ' hideComment → 書いた本人には理由つきで出る', !!mc && !!mc.hidden && mc.hidden.reason === '確かめの理由', JSON.stringify(mc && mc.hidden));
      const other = posts.find(p => !p.mine && !R.person(p.by).me && !R.person(p.by).staff && p.id !== pick.p.id);
      const inFeed = () => R.feed({ kind: 'all', page: 1, pageSize: 500 }).items.some(p => p.id === other.id);
      const rep = R.reportPost(other.id, R.REPORT_REASONS[0]), rep2 = R.reportPost(other.id, R.REPORT_REASONS[0]);
      assert(persona + ' reportPost 2回目は同じ通報', rep.ok && rep2.ok && rep2.existing === true && rep2.report.id === rep.report.id, JSON.stringify(rep2));
      const nt = R.notices().length;
      const h = R.resolveReport(rep.report.id, 'hide'), hs = h.ok && h.report.status;   // report は state の同じもの。次の対応で変わる前に読む
      const gone = !inFeed() && !R.post(other.id), told = R.notices().length === nt + 1;
      const o = R.resolveReport(rep.report.id, 'open');
      assert(persona + ' resolveReport hide → 隠す・お知らせ、open → 戻す', hs === '非表示' && gone && told && o.ok && o.report.status === '受付' && inFeed(),
        `非表示 ${hs}・タイムラインから消えた ${gone}・お知らせ ${told}、受付 ${o.ok && o.report.status}・戻った ${inFeed()}`);
      const crep = R.reportPost(pick.p.id, 'その他', pick.c.id);
      R.resolveReport(crep.report.id, '非表示');
      const cHid = !seen(); R.resolveReport(crep.report.id, '受付');
      assert(persona + ' resolveReport コメントの通報', crep.ok && cHid && seen(), `コメントの通報 ${crep.ok}・隠れた ${cHid}・戻った ${seen()}`);
      assert(persona + ' resolveReport 知らない対応', R.resolveReport(crep.report.id, 'zzz').ok === false, '知らない対応を受け付けてしまう');
      // 描き直しても壊れない（隠したコメントのある投稿）
      const f = renderMember('feed/' + pick.p.id);
      assert(persona + ' 隠したコメントのある投稿を描ける', !f.err && !junk(f.html).length, f.err || junk(f.html).join(','));
    }

    /* 4. 応募を進める2つの形（advanceGigApp(id, status, opt) と advanceGigApp(id, 会員, status, opt)）と見送り。
       ほかの会員は何もしない。在籍24日は status の形、在籍半年は会員の形で見送る */
    for (const persona of ['demo', 'veteran']) {
      become(persona, 'active');
      const gid = Object.keys(store.state.gigs).find(id => /^(applied|meeting)$/.test(store.state.gigs[id].status));
      if (!gid) { assert(persona + ' declineGigApp', false, '応募中・面談の調整中の案件がない'); continue; }
      const st0 = store.state.gigs[gid].status;
      const other = R.advanceGigApp(gid, 'TS-999999', 'active');
      assert(persona + ' advanceGigApp ほかの会員は記録だけ', other.ok && other.other === true && store.state.gigs[gid].status === st0, JSON.stringify(other));
      const form = persona === 'demo' ? '(id, status)' : '(id, 会員, status)';
      const nt = R.notices().length;
      const d = persona === 'demo' ? R.advanceGigApp(gid, 'declined', { reason: '確かめ' }) : R.advanceGigApp(gid, 'me', 'declined', { reason: '確かめ' });
      const gs = R.gigState(gid) || {};
      assert(persona + ' advanceGigApp' + form + ' declined → 見送り・お知らせ', d.ok && gs.key === 'declined' && gs.label === '見送り' && gs.tag === 'canceled' && R.notices().length === nt + 1,
        `${JSON.stringify(d)} → ${JSON.stringify({ key: gs.key, label: gs.label, tag: gs.tag })}・お知らせ ${nt} → ${R.notices().length}`);
      assert(persona + ' declineGigApp 2回目は断る', R.declineGigApp(gid).ok === false, '見送りにした応募をもう一度見送れてしまう');
      assert(persona + ' 見送りの応募は進められない', R.advanceGigApp(gid, 'active').ok === false, '見送りにした応募を稼働中に進められてしまう');
      const g = renderMember('gigs/' + gid);
      assert(persona + ' 見送りの案件を描ける', !g.err && /見送り/.test(g.html), g.err || '「見送り」が出ていない');
    }
    // status の形で完了まで進める：完了で XP、報酬（rewarded）は額が要る、戻す向きは断る
    become('demo', 'active');
    const run = Object.keys(store.state.gigs).find(id => /^(applied|meeting|active)$/.test(store.state.gigs[id].status));
    if (!run) assert('advanceGigApp(id, status) done', false, '進められる応募がない');
    else {
      const xp0 = R.xp(), earn0 = R.gigEarnings();
      const dn = R.advanceGigApp(run, 'done');
      assert('advanceGigApp(id, status) done → 完了・XP', dn.ok && dn.xp === D.XP.gigDone && R.xp() === xp0 + D.XP.gigDone && (R.gigState(run) || {}).key === 'done',
        `${JSON.stringify({ ok: dn.ok, xp: dn.xp, error: dn.error })}・XP ${xp0} → ${R.xp()}（+${D.XP.gigDone} のはず）・${(R.gigState(run) || {}).key}`);
      const noAmt = R.advanceGigApp(run, 'rewarded');
      const rw = R.advanceGigApp(run, 'rewarded', { reward: '5,000円' });
      assert('advanceGigApp(id, status) rewarded → 額が要る・額が入る', noAmt.ok === false && rw.ok && R.gigEarnings() === earn0 + 5000 && (R.gigState(run) || {}).key === 'done',
        `額なし ${JSON.stringify(noAmt)}・額あり ${JSON.stringify(rw)}・報酬の合計 ${earn0} → ${R.gigEarnings()}`);
      assert('advanceGigApp 戻す向きは断る', R.advanceGigApp(run, 'meeting').ok === false, '完了した応募を面談の調整中に戻せてしまう');
      const g = renderMember('gigs/' + run);
      assert('完了した案件を描ける', !g.err && !junk(g.html).length, g.err || junk(g.html).join(','));
    }

    /* 4b. キャンセル待ちから繰り上げる（満席でも予約に。ほかの会員は何もしない） */
    become('demo', 'active');
    const full = D.EVENTS.find(e => R.isFull(e) && new Date(e.at) > CLG.now() && !R.isReserved(e.id) && !R.attended(e.id));
    if (!full) assert('promoteWaitlist', false, '先の日付の満席のイベントがない（キャンセル待ちを確かめられない）');
    else {
      const jw = R.joinWaitlist(full.id);
      const po = R.promoteWaitlist(full.id, 'TS-999999');
      assert('promoteWaitlist ほかの会員は記録だけ', jw.ok && po.ok && po.other === true && R.waitlistPos(full.id) > 0 && !R.isReserved(full.id),
        `キャンセル待ち ${JSON.stringify(jw)}・${JSON.stringify(po)}・待ちの順番 ${R.waitlistPos(full.id)}`);
      const nt = R.notices().length;
      const pm = R.promoteWaitlist(full.id);
      assert('promoteWaitlist → 満席でも予約・お知らせ', pm.ok && R.isReserved(full.id) && !R.waitlistPos(full.id) && R.notices().length === nt + 1,
        `${JSON.stringify(pm)}・予約 ${R.isReserved(full.id)}・待ち ${R.waitlistPos(full.id)}・お知らせ ${nt} → ${R.notices().length}`);
      assert('promoteWaitlist 2回目は断る', R.promoteWaitlist(full.id).ok === false, 'キャンセル待ちでないのに繰り上げられてしまう');
      const ev = renderMember('events/' + full.id);
      assert('繰り上げたイベントを描ける', !ev.err && !junk(ev.html).length, ev.err || junk(ev.html).join(','));
    }

    /* 4c. 運営が並べ直した順（cmsReorder）が会員ページの並びになる。回は講座の指定が要る。cmsReset で戻る */
    become('demo', 'active');
    const order0 = D.COURSES.map(c => c.id);
    const [ca, cb] = [order0[1], order0[order0.length - 1]];
    const ro = R.cmsReorder('course', [cb, ca]);
    const order1 = D.COURSES.map(c => c.id);
    assert('cmsReorder 講座の並び', ro.ok && order1.indexOf(cb) === 1 && order1.indexOf(ca) === order0.length - 1 && order1.length === order0.length,
      `${JSON.stringify(ro)}・${order0.join(',')} → ${order1.join(',')}`);
    assert('cmsReorder 回は講座の指定が要る', R.cmsReorder('lesson', ['sb-2', 'sb-1']).ok === false, '講座を指定せずに回を並べ直せてしまう');
    R.cmsReset();
    assert('cmsReset で並びが戻る', D.COURSES.map(c => c.id).join(',') === order0.join(','), '並べ直した順が残っている');

    /* 5. ログインを止める・面談の枠・記録の申込み */
    become('demo', 'active');
    R.setLoginBlocked(true, '確かめ');
    const on = R.loginBlocked(), on2 = R.adminSuspension();
    R.setLoginBlocked(false);
    assert('setLoginBlocked → loginBlocked', !!on && on.reason === '確かめ' && !!on2 && R.loginBlocked() === null, `止めた ${JSON.stringify(on)}・再開 ${JSON.stringify(R.loginBlocked())}`);
    const ms = R.setMeetingSlots({ weekly: [{ dow: 3, time: '21:00' }] });
    const slots = R.meetingSlots();
    assert('setMeetingSlots → meetingSlots', ms.ok && slots.length > 0 && slots.every(s => new Date(s.at).getDay() === 3 && /21:00/.test(s.label)),
      slots.map(s => s.label).join('・'));
    R.setMeetingSlots(null);
    assert('setMeetingSlots(null) で消える', R.meetingSlotConfig ? R.meetingSlotConfig() === null : true, '枠の設定が残っている');
    const req = R.requestData('export');
    const nt = R.notices().length;
    const done = R.completeDataRequest(req.request && req.request.id);
    assert('completeDataRequest → 済み・お知らせ', done.ok && (R.dataRequests().find(x => x.id === req.request.id) || {}).status === 'done' && R.notices().length === nt + 1,
      JSON.stringify(done));
  } finally {
    CLG.now = realNow;
    try { R.cmsReset(); R.setMeetingSlots(null); } catch (e) {}
  }
}

/* ◆ 3回目のルール（画面づくりの約束 §6-16 の ◆）：投稿の固定と運営の投稿の直し・隠したときの本人へのお知らせ・
   紹介報酬の取消・振込先がないときの繰り越し・最低額の繰り越し・支払いエラー中の解約・修了証・オリエンテーションの予約・
   発表の申込みの札・学部と案件の場所と主催。
   タイムラインの見回り（staffPosts・pins・hiddenPosts・hiddenComments）と CMS は人を切り替えても残るので、最後に必ず消す */
function checkRound3Rules(assert) {
  const need = ['pinPost', 'unpinPost', 'pinnedPosts', 'addStaffPost', 'updateStaffPost', 'removeStaffPost', 'resetStaffFeed', 'hidePost', 'unhidePost',
    'voidReward', 'removeBank', 'setBank', 'gigReward', 'certificate', 'resumePlan', 'updateCard', 'planBanner', 'applySpeaker', 'speakerApp', 'approveEventProposal'];
  const missing = need.filter(f => typeof R[f] !== 'function');
  assert('◆ R.* がそろっている', !missing.length, 'ない関数：' + missing.join('・'));
  if (missing.length) return;
  const realNow = CLG.now, keepMin = D.REFERRAL.minPayout;
  const at = ms => new Date(realNow().getTime() + ms).toISOString();
  const feedIds = n => R.feed({ kind: 'all', page: 1, pageSize: n }).items.map(p => p.id);
  try {
    /* 1. 固定（data.js の投稿も運営の投稿も）・予約の運営投稿・直す・取り下げる・resetStaffFeed */
    become('demo', 'active');
    R.resetStaffFeed();
    let r = R.pinPost('q1');
    assert('◆ pinPost → 先頭に並ぶ', r.ok && r.pinned === true && feedIds(3).slice(0, 2).includes('q1'), JSON.stringify(r) + ' ' + feedIds(3).join(','));
    r = R.unpinPost('p1');
    assert('◆ unpinPost data.js の固定も外せる', r.ok && !R.post('p1').pinned && feedIds(2)[0] === 'q1' && JSON.stringify(R.pinnedPosts()) === '["q1"]',
      `${JSON.stringify(r)}・先頭 ${feedIds(2).join(',')}・固定 ${JSON.stringify(R.pinnedPosts())}`);
    const fh = renderMember('feed');
    assert('◆ タイムラインに「固定」', !fh.err && /固定/.test(fh.html || ''), fh.err || '「固定」が出ていない');
    const sp = R.addStaffPost({ kind: 'news', by: 'staff2', text: '予約の運営投稿（確かめ）', at: at(3600e3) });
    assert('◆ 予約の運営投稿は時刻まで出ない', sp.ok && !feedIds(500).includes(sp.post.id), JSON.stringify(sp));
    const up = R.updateStaffPost(sp.post.id, { at: at(-60e3), text: '直した運営投稿（確かめ）' });
    assert('◆ updateStaffPost 時刻を前に → 出る・本文', up.ok && feedIds(500).includes(sp.post.id) && R.post(sp.post.id).text === '直した運営投稿（確かめ）', JSON.stringify(up));
    assert('◆ updateStaffPost 誤りは断る', R.updateStaffPost(sp.post.id, { text: '' }).ok === false && R.updateStaffPost('nope', {}).ok === false, '空の本文・知らない id を受け付けた');
    become('veteran', 'active');
    assert('◆ 固定・運営の投稿は人を切り替えても残る', !!R.post('q1') && R.post('q1').pinned && !R.post('p1').pinned && !!R.post(sp.post.id),
      `q1 ${R.post('q1') && R.post('q1').pinned}・p1 ${R.post('p1') && R.post('p1').pinned}・運営の投稿 ${!!R.post(sp.post.id)}`);
    assert('◆ removeStaffPost → 消える・2回目は断る', R.removeStaffPost(sp.post.id).ok && !R.post(sp.post.id) && R.removeStaffPost(sp.post.id).ok === false, 'removeStaffPost');
    assert('◆ resetStaffFeed → data.js の固定に戻る', R.resetStaffFeed().ok && R.post('p1').pinned && !R.post('q1').pinned && !R.pinnedPosts().includes('q1'), JSON.stringify(R.pinnedPosts()));

    /* 2. 隠したら、会員ページの会員のものなら本人にお知らせ（1回だけ）。ほかの人のものには出さない */
    become('demo', 'active');
    const n0 = R.notices().length;
    r = R.hidePost('my1', '勧誘・営業');
    const nt = R.notices()[0] || {};
    assert('◆ hidePost 自分の投稿 → お知らせ #/feed/my1', r.ok && r.notified && R.notices().length === n0 + 1 && nt.link === '#/feed/my1' && /勧誘・営業/.test(nt.text), JSON.stringify(nt));
    R.hidePost('my1', 'もう一度');
    assert('◆ hidePost 2回目はお知らせを重ねない', R.notices().length === n0 + 1, `お知らせ ${n0} → ${R.notices().length}`);
    r = R.hidePost('p2', 'その他');
    assert('◆ hidePost ほかの人の投稿 → お知らせなし', r.ok && !r.notified && R.notices().length === n0 + 1, JSON.stringify(r));
    const cm = R.addComment('p3', '確かめのコメント');
    r = R.hideComment(cm.id, '人を傷つける内容');
    const nt2 = R.notices()[0] || {};
    assert('◆ hideComment 自分のコメント → #/feed/<投稿>?c=<コメント>', r.ok && r.notified && nt2.link === '#/feed/p3?c=' + cm.id, JSON.stringify(nt2));
    R.resetStaffFeed();

    /* 3. 紹介報酬の取消（在籍半年）：保留・確定 → 取消（理由つき）、支払済と2回目は断る、{ no, at } で探す、ほかの会員の紹介は other */
    become('veteran', 'active');
    let rows = R.rewardRows();
    const conf = rows.find(x => x.status === 'confirmed' || x.status === 'hold'), paid = rows.find(x => x.status === 'paid');
    if (!conf || !paid) assert('◆ voidReward', false, '在籍半年の会員に、保留か確定の明細と支払済の明細がない');
    else {
      r = R.voidReward(conf.id, '紹介した方の決済が返金された');
      assert('◆ voidReward → 取消・理由・お知らせ', r.ok && r.row.status === 'void' && r.row.voidReason === '紹介した方の決済が返金された' && /取り消しました/.test((R.notices()[0] || {}).text),
        JSON.stringify(r && r.row));
      assert('◆ voidReward 支払済は断る', R.voidReward(paid.id, 'x').ok === false, '支払済を取り消せてしまう');
      assert('◆ voidReward 2回目は断る', R.voidReward(conf.id, 'x').ok === false, '同じ明細を2回取り消せてしまう');
      const ref = store.state.referred.find(x => x.id !== conf.ref && R.rewardRows().some(y => y.ref === x.id && /^(hold|confirmed|scheduled)$/.test(y.status)));
      if (ref) {
        const no = (ref.person && D.PEOPLE[ref.person] && D.PEOPLE[ref.person].no) || ref.no;
        const row = R.rewardRows().find(y => y.ref === ref.id && y.status !== 'paid' && y.status !== 'void');
        r = R.voidReward({ no, at: new Date(new Date(row.at).getTime() + 3600e3).toISOString() }, '返金');
        assert('◆ voidReward { no, at } で明細を探す', r.ok && r.row.id === row.id, `${no} ${row.id} ${JSON.stringify(r)}`);
      }
      assert('◆ voidReward ほかの会員の紹介 → other', R.voidReward({ no: 'TS-999999', at: realNow().toISOString() }).other === true, 'other にならない');
    }

    /* 4. 振込先がない：払った分は払ったまま、支払日を過ぎても支払予定・確定のまま次の支払日へ。登録したら次の支払日に支払済 */
    become('veteran', 'active');
    const paidBefore = R.rewardRows().filter(x => x.status === 'paid').map(x => x.id).join();
    R.removeBank();
    assert('◆ removeBank → 払った明細は支払済のまま', R.rewardRows().filter(x => x.status === 'paid').map(x => x.id).join() === paidBefore, '支払済の明細が変わった');
    const pend = R.rewardRows().filter(x => x.status === 'confirmed' || x.status === 'scheduled');
    if (!pend.length) assert('◆ 振込先なしの繰り越し', false, '確定・支払予定の明細がない');
    else {
      const future = new Date(Math.max(...pend.map(x => new Date(x.payAt).getTime())) + 86400e3);
      CLG.now = () => new Date(future);
      let after = R.rewardRows().filter(x => pend.some(p => p.id === x.id));
      assert('◆ 振込先なし：支払日を過ぎても支払予定で繰り越し', after.length === pend.length && after.every(x => x.status === 'scheduled' && x.carried && /未登録/.test(x.note || '') && new Date(x.payAt) > future),
        after.map(x => [x.id, x.status, x.payAt, x.note].join(':')).join(' / '));
      R.setBank({ bank: '琉球銀行', branch: '浦添支店', kind: '普通', number: '1234567', holder: 'キムラ アヤ' });
      after = R.rewardRows().filter(x => pend.some(p => p.id === x.id));
      const later = new Date(Math.max(...after.map(x => new Date(x.payAt).getTime())) + 60e3);
      CLG.now = () => later;
      assert('◆ 振込先を登録 → 次の支払日に支払済', R.rewardRows().filter(x => pend.some(p => p.id === x.id)).every(x => x.status === 'paid'),
        R.rewardRows().filter(x => pend.some(p => p.id === x.id)).map(x => x.id + ':' + x.status).join(','));
      CLG.now = realNow;
    }
    become('demo', 'active');
    const g1 = R.gigReward('g1');
    if (!g1) assert('◆ gigReward g1', false, 'g1 の報酬がない');
    else {
      const wd = new Date(g1.payAt).getDay();
      assert('◆ 案件の支払日は土日を避ける', wd !== 0 && wd !== 6, g1.payAt);
      CLG.now = () => new Date(new Date(g1.payAt).getTime() + 86400e3);
      const g1b = R.gigReward('g1');
      assert('◆ 案件：振込先なしは支払日を過ぎても確定のまま繰り越し', g1b.status === 'confirmed' && g1b.carried && new Date(g1b.payAt) > new Date(g1.payAt), JSON.stringify(g1b));
      CLG.now = realNow;
    }

    /* 5. 最低額に届かないときの payMonth：翌月に繰り越し（res.ym）→ payMonth(res.ym) で払う */
    become('veteran', 'active');
    let c2 = R.rewardRows().filter(x => x.status === 'confirmed');
    if (!c2.length) {
      const hold = R.rewardRows().filter(x => x.status === 'hold' && x.confirmAt).sort((a, b) => new Date(a.confirmAt) - new Date(b.confirmAt))[0];
      if (hold) { const t = new Date(hold.confirmAt).getTime() + 3600e3; CLG.now = () => new Date(t); }
    }
    const cm2 = R.closeMonth();
    if (!cm2.ok) assert('◆ payMonth 最低額の繰り越し', false, '締められる明細がない ' + JSON.stringify(cm2));
    else {
      D.REFERRAL.minPayout = 10000000;
      const pm = R.payMonth();
      const rs = R.rewardRows().filter(x => cm2.rows.includes(x.id));
      assert('◆ payMonth 最低額未満 → 翌月に繰り越し', pm.ok === false && pm.carried && !!pm.ym && rs.every(x => x.status === 'scheduled' && /未満/.test(x.note || '') && new Date(x.payAt) > new Date(cm2.payAt)),
        JSON.stringify(pm) + ' ' + rs.map(x => x.status + ':' + x.note).join(','));
      D.REFERRAL.minPayout = keepMin;
      const pm2 = R.payMonth(pm.ym);
      assert('◆ payMonth(繰り越した月) で払える', pm2.ok && R.rewardRows().filter(x => cm2.rows.includes(x.id)).every(x => x.status === 'paid'), JSON.stringify(pm2));
    }
    CLG.now = realNow; D.REFERRAL.minPayout = keepMin;

    /* 6. 支払いエラーのまま解約：帯は支払いエラーのもの、取り消すと支払いエラーに戻る、カードを更新すると解約予定のまま払い直す */
    become('demo', 'active');
    R.setPlanDemo('past_due'); R.cancelPlan({ reasons: ['確かめ'] });
    let pl = R.plan(), bn = R.planBanner();
    assert('◆ 支払いエラーのまま解約 → 支払いエラーの帯', pl.status === 'canceling' && !!pl.failedAt && !!bn && bn.kind === 'warn', JSON.stringify({ s: pl.status, f: pl.failedAt, bn }));
    R.resumePlan(); pl = R.plan();
    assert('◆ resumePlan → 支払いエラーに戻る（同じ猶予）', pl.status === 'past_due' && !!pl.failedAt && R.invoices().some(i => i.status === 'failed'), pl.status);
    R.cancelPlan({});
    const uc = R.updateCard(); pl = R.plan();
    assert('◆ updateCard → 払い直して解約予定のまま', !!uc.recovered && pl.status === 'canceling' && !pl.failedAt && !R.invoices().some(i => i.status === 'failed') && !R.planBanner(),
      JSON.stringify({ uc, s: pl.status, f: pl.failedAt }));
    R.setPlanDemo('active');

    /* 7. 修了証は、あとから回が足されても消えない */
    become('demo', 'active');
    const done = D.COURSES.find(c => R.courseState(c).completed);
    if (!done) assert('◆ 修了証', false, '修了した講座がない');
    else {
      const cert0 = R.certificate(done.id);
      R.cmsUpsert('lesson', { course: done.id, title: '修了のあとに足した回（確かめ）', min: 10 });
      const cert1 = R.certificate(done.id);
      assert('◆ 修了のあとで回を足しても修了証が残る', !!cert0 && !R.courseState(done.id).completed && !!cert1 && cert1.no === cert0.no && R.completedCount() >= 1, JSON.stringify(cert1));
      const ch = renderMember('courses/' + done.id + '/certificate');
      assert('◆ 回が足された講座の修了証を描ける', !ch.err && ch.title !== NF && !junk(ch.html).length, ch.err || ch.title);
      R.cmsReset();
    }

    /* 8. オリエンテーション（new30）に出た人は、次の回を予約できない */
    become('veteran', 'active');
    const ori = D.EVENTS.find(e => e.audience === 'new30' && new Date(e.at) > realNow());
    if (ori) assert('◆ 在籍半年：オリエンテーションの次の回は予約できない', !R.eventOpen(ori) && R.reserve(ori.id) === null, ori.id);

    /* 9. 発表の申込みが決まると「決定」 */
    become('demo', 'active');
    const sc = D.EVENTS.find(e => e.kind === 'showcase' && new Date(e.at) > realNow() && !R.speakerApp(e.id));
    const ap = sc && R.applySpeaker(sc.id, '確かめの発表');
    if (ap && ap.ok) { R.approveEventProposal(ap.proposal.id, true); assert('◆ 発表の申込みが決まると「決定」', (R.speakerApp(sc.id) || {}).statusLabel === '決定', JSON.stringify(R.speakerApp(sc.id))); }
    else assert('◆ 発表の申込み', false, '申し込めない ' + JSON.stringify(ap));

    /* 10. 学部（faculty）・案件の場所・福利厚生の howType・イベントの主催（名簿の会員番号） */
    become('demo', 'active');
    const f = R.cmsUpsert('faculty', { name: '確かめの学部', desc: '足した学部' });
    const c = f.ok && R.cmsUpsert('course', { title: '足した学部の講座（確かめ）', faculty: f.id });
    const l = c && c.ok && R.cmsUpsert('lesson', { course: c.id, title: '第1回（確かめ）' });
    assert('◆ 学部を足す → DATA.FACULTIES と講座が出る', f.ok && D.FACULTIES.some(x => x.id === f.id) && l && l.ok && D.COURSES.some(x => x.id === c.id) && /足した学部の講座/.test(renderMember('courses').html || ''),
      JSON.stringify([f, c, l]));
    R.cmsUpsert('faculty', { id: f.id, publish: 'draft' });
    assert('◆ 学部を下書きにすると講座も出ない', !D.FACULTIES.some(x => x.id === f.id) && !D.COURSES.some(x => x.id === c.id), '下書きの学部の講座が出ている');
    const g = R.cmsUpsert('gig', { title: '場所のある案件（確かめ）', type: 'work', reward: '1回 3,000円', remote: false, place: '札幌市中央区' });
    assert('◆ 案件の場所（place）', g.ok && R.gig(g.id).place === '札幌市中央区' && /札幌市中央区/.test(renderMember('gigs/' + g.id).html || ''), JSON.stringify(g));
    const pk = R.cmsUpsert('perk', { id: (D.PERKS[0] || {}).id, howType: 'code' });
    assert('◆ 福利厚生の howType', pk.ok && D.PERKS.find(x => x.id === pk.id).howType === 'code', JSON.stringify(pk));
    const no = D.ROSTER[5].no;
    const ev = R.cmsUpsert('event', { title: '会員の企画（確かめ）', at: at(5 * 86400e3), host: no });
    assert('◆ イベントの主催に名簿の会員番号', ev.ok && R.event(ev.id).host === no && !!R.person(no).name, JSON.stringify(ev));
    assert('◆ 主催の誤りは断る', R.cmsUpsert('event', { title: 'x', at: realNow().toISOString(), host: 'nobody' }).ok === false, '知らない主催を受け付けた');
    R.cmsReset();
    assert('◆ cmsReset で学部も戻る', D.FACULTIES.length === store.cmsBase('faculty').length && !D.FACULTIES.some(x => x.id === f.id), D.FACULTIES.map(x => x.id).join(','));
  } finally {
    CLG.now = realNow; D.REFERRAL.minPayout = keepMin;
    try { R.cmsReset(); R.setMeetingSlots(null); R.resetStaffFeed(); } catch (e) {}
  }
}

/* ◆ 名前と会員番号（2026-09-25：TAISEI・会員番号の頭は TS-）。
   data.js の SITE、ログインの会員番号、前の頭（TK-）で保存した記録を読み込む前に直すこと（会員ページと運営画面の両方） */
function checkBrand(assert) {
  assert('◆ SITE の名前', D.SITE.name === 'TAISEI' && D.SITE.nameKana === 'タイセイ' && D.SITE.tagline === '人生を大成させる。' && D.SITE.note === '',
    JSON.stringify({ name: D.SITE.name, kana: D.SITE.nameKana, tagline: D.SITE.tagline, note: D.SITE.note }));
  assert('◆ 会員番号は TS-', /^TS-\d{6}$/.test(D.MEMBER.id) && /^TS-\d{6}$/.test(D.VETERAN.id) && D.ROSTER.every(m => /^TS-\d{6}$/.test(m.no)), D.MEMBER.id + ' ' + D.VETERAN.id);
  const v1 = R.validateLoginId ? R.validateLoginId('ts-000271') : null, v2 = R.validateLoginId ? R.validateLoginId('TK-000271') : null;
  assert('◆ ログインの会員番号（TS-・前の TK- も同じ番号）', !R.validateLoginId || (v1.ok && v1.value === 'TS-000271' && v2.ok && v2.value === 'TS-000271'), JSON.stringify([v1, v2]));
  // 前の頭で保存した記録：新しい読み込み（vm）で data.js と store.js を動かし、両方のキーが TS- に直ることを見る
  const vm = require('vm');
  const saved = new Map();
  const mem = JSON.parse(JSON.stringify(store.state)); mem.me.id = 'TK-000271';
  mem.extraNotices = [{ id: 'x', type: 'system', icon: 'info', at: new Date().toISOString(), text: '会員番号 TK-000271 のお知らせ', link: '#/members/TK-000271' }];
  mem.invoices = (mem.invoices || []).map(i => Object.assign({}, i, { id: String(i.id).replace(/TS-/g, 'TK-') }));   // 請求の id「in_TK-000271_1」
  saved.set(store.KEY, JSON.stringify(mem));
  saved.set('terakoya-admin-v1', JSON.stringify({ v: 3, members: { 'TK-000271': { suspended: false, memo: 'TK-000271' } }, staff: [{ email: 'k.sato@terakoya.example.jp' }] }));
  const win = { localStorage: { getItem: k => saved.has(k) ? saved.get(k) : null, setItem: (k, v) => saved.set(k, String(v)), removeItem: k => saved.delete(k),
      key: i => [...saved.keys()][i] || null, get length() { return saved.size; } },
    addEventListener() {}, removeEventListener() {}, console, location: { hash: '', search: '', pathname: '/member.html', protocol: 'file:', hostname: '' }, navigator: { userAgent: 'node' } };
  win.window = win;
  try {
    const ctx = vm.createContext(win);
    for (const f of ['data.js', 'store.js']) vm.runInContext(fs.readFileSync(path.join(base, 'assets/js', f), 'utf8'), ctx, { filename: f });
    const st = win.CLG.store.state, ad = saved.get('terakoya-admin-v1');
    assert('◆ 前の TK- の記録を TS- に直す（会員ページ・運営画面）', st.me.id === 'TS-000271' && !/TK-\d{6}/.test(saved.get(store.KEY)) && /"TS-000271"/.test(ad) && !/TK-\d{6}/.test(ad),
      `会員 ${st.me.id}・運営 ${ad.slice(0, 120)}`);
  } catch (e) { assert('◆ 前の TK- の記録を TS- に直す', false, '例外 ' + e.stack.split('\n').slice(0, 2).join(' | ')); }
}

/* ▲ 4回目のルール（2026-09-28。docs/仕様_やりたいこと・リクエスト・シェア.md）
   やりたいこと（GOALS）・講座を足す（remote-work・change-basic）・お試しの回（freeFirst）・ホームの道（pathFor）・名簿の絞り込み・
   「あったらいい」リクエスト・シェア・成果発表会の一般公開・前の保存からの移行。
   リクエストの返事・一般公開の切り替えと申込みは人を切り替えても残るので、最後に消す（運営画面の確かめに持ち込まない） */
function checkRound4Rules(assert) {
  const J = x => { try { return JSON.stringify(x).slice(0, 220); } catch (e) { return String(x); } };
  const t = (label, cond, info) => assert('▲ ' + label, !!cond, info === undefined ? '' : J(info));
  // 収入・金額の言葉（やりたいことのラベル・シェアの画像と文面・リクエストの見本・一般公開の案内に入れない。仕様 §5）
  const INCOME = /稼|収入|報酬|月\d+万|\d+万円|\d[\d,]*円|¥/;
  const byId = id => D.COURSES.find(c => c.id === id);
  try {
    /* 0. data.js：やりたいこと・足した講座・お試しの回 */
    const gids = D.GOALS.map(g => g.id);
    t('GOALS の順', gids.join(',') === 'sns,remote,aivideo,change', gids);
    const SPEC = { sns: 'sns-basic,writing,instagram,shortvideo,marketing', remote: 'remote-work,okozukai,writing,design,freelance',
      aivideo: 'ai,video,shortvideo,nocode', change: 'change-basic,business-basic,money-tax,coaching,startup' };
    D.GOALS.forEach(g => {
      t(`GOALS ${g.id} の道の講座（仕様の順）`, g.courses.join(',') === SPEC[g.id] && g.courses.every(id => !!byId(id)), g.courses);
      t(`GOALS ${g.id} の案件・イベントがある`, (g.gigs || []).every(id => D.GIGS.some(x => x.id === id)) && (g.events || []).every(id => D.EVENTS.some(e => e.id === id)),
        { gigs: g.gigs, events: g.events });
      t(`GOALS ${g.id} のラベルに収入の言葉がない`, g.label && g.short && !INCOME.test(g.label + g.short), g.label);
    });
    const okGoals = a => Array.isArray(a) && a.length <= 2 && new Set(a).size === a.length && a.every(id => gids.includes(id));
    t('デモの人のやりたいこと（高橋さくら sns・remote／木村あや sns・aivideo）', J(D.MEMBER.goals) === '["sns","remote"]' && J(D.VETERAN.goals) === '["sns","aivideo"]',
      [D.MEMBER.goals, D.VETERAN.goals]);
    const badGoals = Object.keys(D.PEOPLE).filter(k => D.PEOPLE[k].goals !== undefined && !okGoals(D.PEOPLE[k].goals))
      .concat(D.ROSTER.filter(m => !okGoals(m.goals || [])).map(m => m.no));
    t('PEOPLE・名簿の goals は2つまで・知らない id がない', !badGoals.length, badGoals.slice(0, 5));
    t('名簿に未選択の人と2つ選んだ人がいる', D.ROSTER.some(m => !(m.goals || []).length) && D.ROSTER.some(m => (m.goals || []).length === 2), '');
    const NEWC = { 'remote-work': ['skill', 'course-remote-work.webp'], 'change-basic': ['basic', 'course-change-basic.webp'] };
    Object.keys(NEWC).forEach(id => {
      const c = byId(id) || {}, ls = c.lessons || [];
      t(`講座 ${id}：Lv1・4回・1回10〜15分・中身・確認テスト3問・写真・講師`, c.level === 1 && c.faculty === NEWC[id][0] && ls.length === 4 &&
        ls.every(l => l.min >= 10 && l.min <= 15 && l.desc && (l.points || []).length === 3 && l.material) && (c.quiz || []).length === 3 &&
        c.img === 'assets/img/' + NEWC[id][1] && fs.existsSync(path.join(base, c.img)) && !!(D.PEOPLE[c.teacher] || {}).name,
        { level: c.level, faculty: c.faculty, n: ls.length, quiz: (c.quiz || []).length, img: c.img, teacher: c.teacher });
    });
    t('講座の本数・回数は COUNTS から（21本）', D.COUNTS.courses === 21 && D.COUNTS.courses === D.COURSES.length &&
      D.COUNTS.lessons === D.COURSES.reduce((n, c) => n + c.lessons.length, 0) && D.COUNTS.lv1Courses === D.COURSES.filter(c => c.level === 1).length, D.COUNTS);
    t('freeFirst は ai・video の1回だけ（Lv2 以上の講座）', J(D.COUNTS.freeFirst) === '["ai","video"]' && D.COURSES.filter(c => c.freeFirst).every(c => c.freeFirst === 1 && c.level > 1),
      D.COUNTS.freeFirst);
    const gstep = D.ONBOARDING.find(s => s.id === 'goals');
    t('スタートガイドの「やりたいことを選ぶ」（1週目の最初・XP 0・auto goals）', gstep && gstep.week === 1 && gstep.xp === 0 && gstep.auto === 'goals' &&
      D.ONBOARDING.filter(s => s.week === 1)[0].id === 'goals' && gstep.go === '#/start?focus=goals', gstep || 'ONBOARDING に id goals がない');
    t('お知らせの種類「リクエストへの返事」・貢献ポイント request +20', D.NOTIFY_TYPES.some(x => x.id === 'request' && x.name === 'リクエストへの返事') &&
      (D.POINT_RULES.find(r => r.id === 'request') || {}).pt === 20, D.POINT_RULES.map(r => r.id));
    const reqIncome = D.REQUESTS.filter(r => INCOME.test(r.title + r.detail + (r.reply ? r.reply.text : ''))).map(r => r.id);
    const shIncome = Object.keys(D.SHARE.moments).filter(k => INCOME.test(D.SHARE.moments[k].img + D.SHARE.moments[k].text));
    t('リクエストの見本・シェアの場面・一般公開の案内に収入や金額の言葉がない', !reqIncome.length && !shIncome.length && !INCOME.test(J(D.PUBLIC_SHOWCASE)),
      { requests: reqIncome, share: shIncome });
    t('リクエストの見本（14件ほど・追加しました／検討中／見送りを混ぜる・見送りは理由つき）', D.REQUESTS.length >= 12 &&
      ['added', 'considering', 'declined', 'open'].every(s => D.REQUESTS.some(r => r.status === s)) &&
      D.REQUESTS.filter(r => r.status === 'declined').every(r => r.reply && r.reply.text.length >= 20) &&
      D.REQUESTS.filter(r => r.status === 'added').every(r => r.link && R.request(r.id) && R.request(r.id).link.found !== false), D.REQUESTS.length);
    // ここから下は scratchpad の check-rules.js・check-rules2.js を移したもの（続きは次の段）
    checkRound4Goals(t);
    checkRound4Requests(t);
    checkRound4Share(t);
  } catch (e) { t('4回目のルールの途中で例外', false, e.stack.split('\n').slice(0, 3).join(' | ')); }
  finally {
    // 人を切り替えても残るもの（リクエストの返事・一般公開の切り替え・申込み）を消して、最初の形に戻す
    const s = store.state;
    if (s.settings) delete s.settings.showcasePublic;
    delete s.showcaseSignups;
    if (s.requests) s.requests.answers = {};
    store.resetDemo(true);
  }
}
/* ▲ やりたいこと・お試しの回・ホームの道・名簿の絞り込み */
function checkRound4Goals(t) {
  const J = JSON.stringify;
  const hana = { name: '山田 はな', email: 'hana@example.jp' };
  /* 見る人ごとのやりたいこと */
  store.resetDemo(true); store.login();
  t('在籍24日のやりたいこと sns・remote', J(R.goals().ids) === '["sns","remote"]', R.goals());
  t('在籍24日の XP は 530 のまま（台本どおり）', R.xp() === 530, R.xp());
  store.startVeteran(true);
  t('在籍半年のやりたいこと sns・aivideo', J(R.goals().ids) === '["sns","aivideo"]', R.goals());
  store.startFresh(hana);
  t('入会したては未選択', R.goals().ids.length === 0 && !R.goals().chosen);
  store.startFresh(Object.assign({ goals: ['remote', 'x', 'remote', 'sns', 'change'] }, hana));
  t('申込みで選んだやりたいこと（知らない id・重なりを除いて2つまで）', J(R.goals().ids) === '["remote","sns"]', R.goals().ids);
  /* setGoals */
  store.startFresh(hana); store.login();
  t('setGoals：3つは断る', R.setGoals(['sns', 'remote', 'change']).ok === false);
  t('setGoals：知らない id は断る', R.setGoals(['nope']).ok === false);
  let r = R.setGoals(['change', 'change']);
  t('setGoals：重なりを除く', r.ok && J(r.goals.ids) === '["change"]', r);
  t('setGoals の result に XP の数', typeof r.xp === 'number' && r.xp >= 0, r.xp);
  r = R.setGoals([]);
  t('「まだ決めていない」も答えたことになる', r.ok && r.goals.undecided && r.goals.chosen, r.goals);
  t('スタートガイドの goals が済になる', !!store.state.steps.goals);
  t('名簿に出さない', R.setHideGoals(true).hidden && R.goals().hidden);
  R.setHideGoals(false);
  /* お試しの回（freeFirst）：Lv1 の人は AI活用・動画編集の1回目だけ見られる */
  const ai = R.course('ai'), video = R.course('video');
  t('入会したては Lv1', R.level().lv === 1);
  t('AI活用は Lv で閉じているが、お試しの回がある', R.courseState(ai).locked && R.courseState(ai).trial && R.courseState(ai).trialNote === '1回目は入会直後から見られます',
    R.courseState(ai));
  t('Lv1 の人が AI活用の1回目を開ける', R.lessonState(ai, ai.lessons[0].id) === 'open');
  t('Lv1 の人は AI活用の2回目を開けない', R.lessonState(ai, ai.lessons[1].id) === 'locked');
  t('動画編集の1回目も開ける', R.lessonState(video, video.lessons[0].id) === 'open');
  t('お試しのない講座（writing）は閉じたまま', !R.courseState('writing').trial && R.lessonState('writing', R.course('writing').lessons[0].id) === 'locked');
  t('お試し中も確認テストは閉じたまま', R.quiz('ai') ? R.quiz('ai').locked : true);
  t('閉じた確認テストは出せない', R.submitQuiz('ai', [0, 0, 0]) === null);
  // 画面でも：回の再生の画面が、1回目は開いていて（is-locked なし）、2回目は閉じている
  const h1 = renderMember('lesson/ai/' + ai.lessons[0].id).html || '', h2 = renderMember('lesson/ai/' + ai.lessons[1].id).html || '';
  t('画面：Lv1 の人の AI活用の1回目は再生できる・2回目は閉じている', /class="cr-player[" ]/.test(h1) && !/cr-player is-locked/.test(h1) && /cr-player is-locked/.test(h2),
    [/cr-player is-locked/.test(h1), /cr-player is-locked/.test(h2)]);
  const text = r => (renderMember(r).html || '').replace(/<[^>]+>/g, '');   // 文の区切り（<wbr>・nw の span）を外して読む
  t('画面：講座の一覧と講座の頁に「1回目は入会直後から見られます」', /1回目は入会直後から見られます/.test(text('courses')) && /1回目は入会直後から見られます/.test(text('courses/ai')));
  const xp0 = R.xp();
  r = R.completeLesson('ai', ai.lessons[0].id);
  t('お試しの回を見終える（+20XP）', r && r.xp === 20 && R.xp() === xp0 + 20, r && r.xp);
  t('お試しの回は済', R.lessonState(ai, ai.lessons[0].id) === 'done');
  t('2回目は見終えられない', R.lessonState(ai, ai.lessons[1].id) === 'locked' && R.completeLesson('ai', ai.lessons[1].id) === null);
  t('続きの一覧：次の回が閉じた AI活用は出ない', !R.continueList().some(x => x.c.id === 'ai'));
  t('続きの一覧：動画編集はお試しとして出る', R.continueList().some(x => x.c.id === 'video' && x.st.trial));
  t('お試しだけでは修了証は出ない', R.certificate('ai') === null);
  t('探す：お試しの回は閉じていない', (() => { const g = R.search('AI').groups.find(x => x.key === 'lessons'); return !g || g.items.filter(i => i.id === ai.lessons[0].id).every(i => !i.locked); })());
  /* ホームの道（pathFor） */
  store.resetDemo(true); store.login();
  let p = R.pathFor();
  t('道：在籍24日は SNS の道・5本', p.goal && p.goal.id === 'sns' && p.courses.length === 5, p.goal);
  t('道：講座の状態', p.courses.every(c => ['done', 'open', 'locked'].includes(c.state)), p.courses.map(c => c.state));
  t('道：次に見る回（SNS発信入門の3回目）', p.next && p.next.courseId === 'sns-basic' && p.next.lesson.id === 'sb-3' && /^#\/lesson\//.test(p.next.href),
    p.next && [p.next.courseId, p.next.lesson.id]);
  t('道：合う案件は2件まで', p.gigs.length <= 2 && p.gigs.length > 0, p.gigs.map(g => g.gig.id));
  t('道：同じやりたいことの仲間3人（自分は入らない）', p.people.length === 3 && p.people.every(x => !x.me && x.goals.includes('sns')), p.people.map(x => x.id));
  t('道：近いイベント', !!p.event, p.event && p.event.id);
  p = R.pathFor('aivideo');
  t('道：AI・動画（Lv3 なので AI活用から）', p.next && p.next.courseId === 'ai', p.next && p.next.courseId);
  t('道：閉じた講座は開く Lv を出す', p.courses.some(c => c.state === 'locked' && /Lv\d/.test(c.lockReason)));
  p = R.pathFor('zzz');
  t('道：知らない id は既定の道（オリエンテーションから）', p.goal === null && p.courses[0].id === 'orientation', p.courses.map(c => c.id));
  store.startFresh(hana); store.login();
  p = R.pathFor();
  t('道：入会したては既定の道', p.goal === null && p.courses.length === 5 && p.next && p.next.courseId === 'orientation', p.next);
  p = R.pathFor('aivideo');
  t('道：入会したての AI・動画は AI活用のお試しの回から', p.next && p.next.courseId === 'ai' && p.next.trial, p.next);
  /* 名簿の絞り込み（members?goal=） */
  store.resetDemo(true); store.login();
  const all = R.members({}), bySns = R.members({ goal: 'sns' }), none = R.members({ goal: 'none' });
  t('名簿：やりたいことで絞る', bySns.length > 0 && bySns.length < all.length && bySns.every(m => m.goals.includes('sns')), bySns.length);
  t('名簿：未選択で絞る', none.every(m => !m.goals.length) && none.length > 0, none.length);
  t('名簿：絞り込みの候補', R.membersFacets().goals.length === D.GOALS.length);
  t('名簿：自分の行のやりたいこと', all.find(m => m.me).goals.length === 2);
  R.setHideGoals(true);
  t('名簿：隠すと自分の行にも絞り込みにも出ない', R.members({}).find(m => m.me).goals.length === 0 && !R.members({ goal: 'sns' }).some(m => m.me));
  t('名簿：自分のページには出る（隠している印つき）', R.memberProfile('me').goals.length === 2 && R.memberProfile('me').goalsHidden);
  R.setHideGoals(false);
  t('名簿：ほかの会員のページ', Array.isArray(R.memberProfile('m3').goals));
  t('peopleByGoal に自分は入らない', R.peopleByGoal('remote').every(m => !m.me));
  const gs = R.goalStats();
  t('運営の内訳（未選択も）', gs.rows.length === D.GOALS.length + 1 && gs.rows.find(x => x.id === 'none').count >= 0 &&
    gs.rows.reduce((n, x) => n + x.count, 0) >= gs.total, gs.rows.map(x => x.count));
}
/* ▲「あったらいい」リクエスト：一覧・出す・直す・消す・＋1・運営の返事（お知らせ・+20pt は1回だけ） */
function checkRound4Requests(t) {
  store.resetDemo(true); store.login();
  const list = R.requests({ sort: 'popular' });
  t('リクエスト：見本＋自分の1件', list.length === D.REQUESTS.length + 1, list.length);
  t('リクエスト：人気順', list.every((x, i) => i === 0 || list[i - 1].votes >= x.votes));
  const rq1 = R.request('rq1');
  t('リクエスト：デモ会員の＋1が入る', rq1.voted && rq1.votes === D.REQUESTS.find(q => q.id === 'rq1').votes + 1, rq1.votes);
  t('リクエスト：追加しました のリンク', rq1.link && rq1.link.type === 'course' && rq1.link.title && rq1.link.href === '#/courses/remote-work', rq1.link);
  t('リクエスト：見た返事は新しくない', !rq1.updated);
  t('リクエスト：匿名は名前を出さない（運営画面には出す）', R.request('rq4').who === '匿名' && R.request('rq4').byName === undefined && !!R.request('rq4', { admin: true }).byName);
  t('リクエスト：自分の1件は直せる', R.requests({ mine: true }).length === 1 && R.requests({ mine: true })[0].canEdit);
  t('リクエスト：絞り込み active・done・kind', R.requests({ status: 'active' }).every(x => x.status === 'open' || x.status === 'considering') &&
    R.requests({ status: 'done' }).every(x => x.status === 'added' || x.status === 'declined') && R.requests({ kind: 'gig' }).every(x => x.kind === 'gig'));
  t('リクエスト：新着順', (() => { const l = R.requests({ sort: 'new' }); return l.every((x, i) => i === 0 || new Date(l[i - 1].at) >= new Date(x.at)); })());
  // 出す・直す・消す
  let r = R.addRequest({ kind: 'event', title: '', detail: '' });
  t('出す：空は断る', !r.ok && r.errors.title && r.errors.detail, r.errors);
  r = R.addRequest({ kind: 'zzz', title: 'x'.repeat(41), detail: 'y'.repeat(401) });
  t('出す：種類・題40字・中身400字', !r.ok && r.errors.kind && r.errors.title && r.errors.detail, r.errors);
  r = R.addRequest({ kind: 'gig', title: '在宅の仕事の探し方を最初に知りたい', detail: 'おなじ' });
  t('出す：同じ題はそのリクエストを返す', !r.ok && r.duplicate === 'rq1', r);
  r = R.addRequest({ kind: 'gig', title: 'FXの自動売買の勉強会', detail: '投資の話を聞きたい' });
  t('出す：投資・勧誘の言葉は断る', !r.ok && /出せません/.test(r.errors.detail || ''), r.errors);
  r = R.addRequest({ kind: 'course', title: '  写真の整え方の講座  ', detail: 'スマホで撮った商品写真を明るくする方法', anonymous: true });
  t('出す：匿名で出せる', r.ok && r.request.mine && r.request.title === '写真の整え方の講座' && r.request.who === '匿名' && r.request.votes === 0, r);
  const myId = r.request && r.request.id;
  t('＋1：自分のリクエストには押せない', R.toggleVote(myId).ok === false);
  r = R.editRequest(myId, { title: '商品写真の整え方の講座' });
  t('直す：自分の・受付中', r.ok && r.request.title === '商品写真の整え方の講座' && r.request.editedAt, r);
  t('直す：ほかの人のものは断る', R.editRequest('rq8', { title: 'x' }).ok === false);
  // ＋1 の付け外し（1人1回・押し直すと外れる）。対応が済んだものには押せない
  const v0 = R.request('rq9').votes;
  r = R.toggleVote('rq9');
  t('＋1：付ける', r.ok && r.voted && r.votes === v0 + 1 && R.request('rq9').voted, r);
  r = R.toggleVote('rq9');
  t('＋1：押し直すと外れる', r.ok && !r.voted && r.votes === v0 && !R.request('rq9').voted, r);
  t('＋1：見送りのものには押せない', R.toggleVote('rq12').ok === false);
  // 運営の返事 → お知らせ。「追加しました」で出した人に +20pt（1回だけ）。＋1や出すだけでは付かない
  const pts0 = R.points().total, notes0 = R.notices().length;
  t('＋1や出すだけでは貢献ポイントは付かない', R.points().total === pts0);
  r = R.answerRequest(myId, { status: 'declined' });
  t('返事：見送りは理由が要る', !r.ok && r.errors.reply, r);
  r = R.answerRequest(myId, { status: 'added' });
  t('返事：追加しました はリンクが要る', !r.ok && r.errors.link, r);
  t('返事：知らないリンクは断る', !R.answerRequest(myId, { status: 'added', link: 'course:nope' }).ok);
  r = R.answerRequest(myId, { status: 'considering', reply: '講師と相談しています。', by: 'staff4' });
  const n1 = R.notices()[0] || {};
  t('返事：検討中 → 出した人にお知らせ（ポイントなし）', r.ok && r.notified && r.pt === 0 && R.notices().length === notes0 + 1 && n1.type === 'request' &&
    n1.link === '#/requests?focus=' + myId && R.points().total === pts0, [r, n1.link]);
  t('返事：まだ見ていない返事の数', R.request(myId).updated && R.requestCounts().updates >= 1);
  t('返事のあとは直せない・消せない', R.editRequest(myId, { title: 'zz' }).ok === false && R.removeRequest(myId).ok === false);
  r = R.answerRequest(myId, { status: 'added', reply: '「動画編集」に1回足しました。', link: { type: 'course', id: 'video' }, by: 'staff3' });
  t('返事：追加しました → 出した人に +20pt', r.ok && r.pt === 20 && R.points().total === pts0 + 20 && /貢献ポイント \+20pt/.test(R.notices()[0].text),
    [r.pt, R.points().total - pts0]);
  r = R.answerRequest(myId, { status: 'added', reply: '直しました', link: 'course:video', by: 'staff3' });
  t('返事：+20pt は1回だけ', r.ok && r.pt === 0 && R.points().total === pts0 + 20, [r.pt, R.points().total - pts0]);
  t('一覧を開いたら見た印', R.markRequestsSeen() >= 1 && R.requestCounts().updates === 0);
  // ほかの人のリクエスト（デモ会員が＋1した rq8）を追加 → ＋1した人にお知らせ・出した人は pointGrants（ランキングに入る）
  const g0 = (store.state.pointGrants || []).length;
  r = R.answerRequest('rq8', { status: 'added', reply: '22時からのもくもく会を開きます。', link: { type: 'event', id: 'e5' }, by: 'staff2' });
  t('返事：＋1した人にお知らせ・出した人に +20pt（pointGrants）', r.ok && r.notified && /＋1したリクエスト/.test(R.notices()[0].text) &&
    store.state.pointGrants.length === g0 + 1, r);
  t('返事：出した人がランキングに入る', !!R.ranking('points').find(x => x.id === 'm20'));
  const r2 = R.addRequest({ kind: 'gig', title: '消すためのリクエスト', detail: '消します' });
  t('消す：自分の・受付中', r2.ok && R.removeRequest(r2.request.id).ok && !R.request(r2.request.id));
  const c = R.requestCounts();
  t('数：all・pending', c.all === R.requests().length && c.pending >= 0, c);
  // 運営の返事は人を切り替えても残る。在籍半年の自分のリクエストは検討中（運営の返事つき）
  store.startVeteran(true);
  t('返事は人を切り替えても残る', R.request('rq8').status === 'added');
  t('在籍半年の自分のリクエストは検討中', R.request('rqm-v1') && R.request('rqm-v1').status === 'considering' && !!R.request('rqm-v1').reply, R.request('rqm-v1'));
}
/* ▲ シェア（#PR は紹介リンクを付けたときだけ・金額を入れない・XP とポイントは増えない）・成果発表会の一般公開・移行 */
function checkRound4Share(t) {
  const J = JSON.stringify;
  const MONEY = /稼|収入|月\d+万|\d+万円|\d[\d,]*円|¥/;
  store.startVeteran(true);
  let m = R.shareMoments();
  t('シェアの場面（在籍半年：修了・レベル・発表・30日、最後に誘う）', ['course', 'level', 'showcase', 'start30'].every(k => m.some(x => x.moment === k)) &&
    m[m.length - 1].moment === 'invite', m.map(x => x.key));
  // どの場面も：紹介リンクなしなら #PR も紹介のリンクもない。付けたら先頭に #PR・最後に本人の紹介リンク。画像と文面に金額がない
  const prBad = [], moneyBad = [];
  m.forEach(x => {
    const a = R.shareText(x.moment, x.id), b = R.shareText(x.moment, x.id, { withLink: true });
    if (!a || !b) { prBad.push(x.key + ' null'); return; }
    if (/#PR/.test(a.text) || a.pr || /[?&]ref=/.test(a.text) || (x.moment !== 'invite' && a.link)) prBad.push(x.key + ' リンクなし');
    if (!/^#PR/.test(b.text) || !b.link || !/[?&]ref=/.test(b.link) || b.text.indexOf(b.link) < 0) prBad.push(x.key + ' リンクあり');
    const card = a.card || {};
    if (MONEY.test([card.headline, card.name, card.dateText, card.hashtag, a.text].join(' '))) moneyBad.push(x.key);
    if (!/#TAISEI/.test(a.text) || card.hashtag !== '#TAISEI' || !/^\d{4}年\d{1,2}月\d{1,2}日$/.test(card.dateText || '')) moneyBad.push(x.key + ' 形');
  });
  t('シェア：#PR と紹介リンクは「紹介リンクを付ける」のときだけ', !prBad.length, prBad);
  t('シェア：画像と文面に金額・収入がない（#TAISEI・日付）', !moneyBad.length, moneyBad);
  let s = R.shareText('course', 'sns-basic');
  t('シェア：修了の文面（仕様の例のとおり）', s && s.text === 'TAISEIで「SNS発信入門」を修了しました。 #TAISEI' && !s.pr && !s.link, s && s.text);
  t('シェア：修了の画像', s.card.headline === '「SNS発信入門」を修了' && s.card.name && s.card.dateText, s.card);
  t('シェア：紹介リンクは紹介の画面と同じ', R.shareText('course', 'sns-basic', { withLink: true }).link === R.referral().url, R.referral().url);
  t('シェア：まだ満たしていない場面は null', R.shareText('course', 'teacher') === null && R.shareText('level', 6) === null);
  s = R.shareText('invite');
  t('シェア：誘うは公開の頁（ref も #PR もない）', s && /#\/showcase$/.test(s.link) && !/ref=/.test(s.link) && !/#PR/.test(s.text), s && s.text);
  s = R.shareText('invite', null, { withLink: true });
  t('シェア：誘う＋紹介リンク（ref と #PR）', /\?ref=.+#\/showcase$/.test(s.link) && /^#PR/.test(s.text), s.link);
  let cmp = R.shareCompose('修了しました！', { withLink: true, moment: 'course', id: 'sns-basic' });
  t('シェア：直した文面でも #PR と紹介リンクは消せない', /^#PR/.test(cmp.text) && /\?ref=/.test(cmp.text) && cmp.fixed, cmp.text);
  cmp = R.shareCompose('修了しました！ #TAISEI', { withLink: false, moment: 'course', id: 'sns-basic' });
  t('シェア：紹介リンクなしの文面に #PR を足さない', !/#PR/.test(cmp.text) && !cmp.warnings.length, cmp);
  cmp = R.shareCompose('月5万円になりました', {});
  t('シェア：金額を書くと注意が出る', cmp.warnings.length === 1, cmp.warnings);
  t('シェア：X・LINE の URL', /^https:\/\/x\.com\/intent\/post\?text=/.test(cmp.urls.x) && /^https:\/\/line\.me\/R\/share\?text=/.test(cmp.urls.line), cmp.urls);
  const xpBefore = R.xp(), ptBefore = R.points().total, logBefore = J(store.state.pointsLog || []).length;
  R.shareMoments().forEach(x => { R.shareText(x.moment, x.id); R.shareText(x.moment, x.id, { withLink: true }); });
  R.shareCompose('x', {}); R.shareCompose('x', { withLink: true, moment: 'level' });
  t('シェアしても XP・貢献ポイントは増えない', R.xp() === xpBefore && R.points().total === ptBefore && J(store.state.pointsLog || []).length === logBefore);
  // シェアの窓（ui.js の U.shareSheet）が XP・ポイントを付ける関数を呼んでいない
  const uiSrc = fs.readFileSync(path.join(base, 'assets/js/ui.js'), 'utf8');
  // function shareSheet( から、次の部品（goalTags の説明の前）まで。drawShareCard も含めて見る
  const i0 = uiSrc.indexOf('function drawShareCard('), i1 = uiSrc.indexOf('function goalTags(');
  const body = i0 < 0 ? '' : uiSrc.slice(i0, i1 > i0 ? i1 : i0 + 20000);
  t('シェアの窓は XP・ポイントの関数を呼ばない', i0 >= 0 && /function shareSheet\(/.test(body) &&
    !/completeLesson|addXp|grantXp|awardXp|addPoints|grantPoints|pointsLog|pointGrants|stepAt|completeStep|R\.xp\(|R\.points\(/.test(body), i0 < 0 ? 'U.shareSheet がない' : '');
  store.resetDemo(true); store.login();
  m = R.shareMoments();
  t('シェアの場面（在籍24日：発表・30日はまだ）', !m.some(x => x.moment === 'showcase' || x.moment === 'start30') && m.some(x => x.moment === 'level'), m.map(x => x.key));
  /* 成果発表会の一般公開 */
  let ps = R.publicShowcase();
  t('一般公開：成果発表会のはじめの30分', ps && ps.eventId === 'e4' && ps.on && ps.minutes === 30 && ps.signups === 4 && ps.page === 'index.html#/showcase', ps);
  let r = R.showcaseSignup({ name: '', email: 'bad' });
  t('一般公開の申込み：名前とメールの誤り', !r.ok && r.errors.name && r.errors.email, r.errors);
  t('一般公開の申込み：名前は30文字まで', !R.showcaseSignup({ name: 'あ'.repeat(31), email: 'a@example.jp' }).ok);
  r = R.showcaseSignup({ name: ' 佐野  みく ', email: 'Miku.Sano@Example.jp ' });
  t('一般公開の申込み：整えて受け付ける', r.ok && r.signup.email === 'miku.sano@example.jp' && r.signup.name === '佐野 みく' && r.showcase.signups === 5, r);
  r = R.showcaseSignup({ name: '佐野 みく', email: 'miku.sano@example.jp' });
  t('一般公開の申込み：同じメールは existing', r.ok && r.existing && R.showcaseSignups().length === 5);
  t('一般公開の申込みの一覧（新しい順・見本の印）', R.showcaseSignups('e4')[0].name === '佐野 みく' && R.showcaseSignups()[4].demo);
  t('一般公開の枠を切る', R.setShowcasePublic('e4', false).ok && R.publicShowcase() === null && R.publicShowcase('e4').on === false);
  t('切ったあとは申し込めない', !!R.showcaseSignup({ name: 'a', email: 'a@example.jp' }).error);
  t('成果発表会でない回は切り替えられない', R.setShowcasePublic('e1', true).ok === false);
  t('切ったあとは「誘う」が出ない', !R.shareMoments().some(x => x.moment === 'invite') && R.shareText('invite') === null);
  store.startVeteran(true);
  t('切り替えと申込みは人を切り替えても残る', R.publicShowcase('e4').on === false && R.showcaseSignups().length === 5);
  R.setShowcasePublic('e4', true);
  t('戻すと「誘う」が出る', R.shareMoments().some(x => x.moment === 'invite'));
  /* 移行（前の保存にこの入れ物がない・壊れている） */
  store.resetDemo(true);
  const raw = JSON.parse(J(store.state));
  ['goals', 'goalsAt', 'hideGoals', 'requests', 'showcaseSignups'].forEach(k => delete raw[k]);
  const rawF = JSON.parse(J(raw)); rawF.kind = 'fresh';
  const mig = store.migrate(raw);
  t('移行：在籍24日の入れ物を埋める', J(mig.goals) === '["sns","remote"]' && mig.requests.votes.rq1 && mig.showcaseSignups.length === 4, mig.goals);
  const migF = store.migrate(rawF);
  t('移行：入会したては空', migF.goals.length === 0 && migF.requests.mine.length === 0);
  const broken = JSON.parse(J(store.state)); broken.goals = 'x'; broken.requests = { mine: 3, votes: [] };
  const migB = store.migrate(broken);
  t('移行：壊れた入れ物を直す', Array.isArray(migB.goals) && Array.isArray(migB.requests.mine) && !Array.isArray(migB.requests.votes));
}

/* ============================================================
   4. 運営画面
   ============================================================ */
function checkAdmin() {
  const adir = path.join(base, 'assets/js/admin');
  if (!fs.existsSync(path.join(base, 'admin.html'))) { console.log('  運営画面（admin.html）がないので飛ばす'); return 0; }
  // admin.html の読み込み順のまま読む
  const order = [...fs.readFileSync(path.join(base, 'admin.html'), 'utf8').matchAll(/src="assets\/js\/admin\/([\w-]+)\.js/g)].map(m => m[1]);
  for (const f of order) require(path.join(adir, f + '.js'));
  const AD = CLG.admin;
  const TABS = {
    members: ['?status=past_due', '?status=canceling', '?status=left', '?q=' + encodeURIComponent('高橋'), '?goal=sns', '?goal=none'],
    onboarding: ['?view=interviews', '?view=contacts'],
    inbox: ['?status=open', '?view=slots', '?view=experts'],
    courses: ['?tab=archive', '?tab=stats'],
    gigs: ['?tab=apps', '?tab=review', '?tab=closed'],
    events: ['?tab=past', '?tab=proposals', '?tab=signups'],
    feed: ['?tab=reports', '?tab=staff', '?tab=notices', '?tab=line'],
    perks: ['?tab=experts', '?tab=pros'],
    payments: ['?tab=failed', '?tab=cancels', '?tab=refunds', '?status=failed', '?month=-1'],
    referrals: ['?tab=rows', '?tab=banks', '?tab=history', '?status=ready'],
    points: ['?tab=close'],
    settings: ['?tab=referral', '?tab=rules', '?tab=staff', '?tab=audit', '?tab=templates'],
    // ▲ リクエスト（種類・状態の絞り込み・返事を書く1件）
    requests: ['?kind=gig', '?kind=course', '?kind=event', '?status=open', '?status=considering', '?status=added', '?status=declined', '?status=done', '?focus=rq9', '?kind=' + XSS_Q]
  };
  const MD_TABS = ['profile', 'pay', 'xp', 'courses', 'gigs', 'ref', 'points', 'msg', 'memo'];
  function routes() {
    const list = [];
    Object.keys(AD.screens).filter(k => k !== 'member').forEach(k => { list.push(k); (TABS[k] || []).forEach(t => list.push(k + t)); });
    const live = AD.data.live();
    const rows = AD.data.members();
    const pick = st => (rows.find(m => m.status === st && !m.live) || {}).no;
    [live.no, pick('active'), pick('past_due'), pick('canceling'), pick('left')].filter(Boolean).forEach(no => list.push('members/' + no));
    MD_TABS.forEach(t => list.push('members/' + live.no + '?tab=' + t));
    AD.data.threads().forEach(t => list.push('inbox/' + t.id));
    D.COURSES.slice(0, 3).forEach(c => list.push('courses/' + c.id));
    D.GIGS.slice(0, 3).map(g => g.id).concat((AD.db.state.peerGigs || []).slice(0, 2).map(g => g.id)).forEach(id => list.push('gigs/' + id));
    D.EVENTS.slice(0, 3).forEach(e => list.push('events/' + e.id));
    ['members/TS-999999', 'inbox/nope', 'courses/nope', 'gigs/nope', 'events/nope'].forEach(r => list.push(r + '#nf'));
    // ▲ リクエストの1件（返事を書く）。見本の状態ごと（追加しました・検討中・受付中・見送り）と、デモ会員の自分のもの。成果発表会のイベント
    // 画面が無ければ「画面が登録されていない」で失敗する（一覧の requests も、ここで足す）
    if (!AD.screens.requests) list.push('requests');
    ['rq1', 'rq2', 'rq9', 'rq12'].concat(R.requests({ mine: true }).map(x => x.id)).forEach(id => list.push('requests/' + id));
    list.push('requests/nope#nf');
    list.push('events/e4');
    return list;
  }
  const DETAIL = { members: 'member' };
  let n = 0;
  const roles = {};
  (AD.db.state.staff || []).forEach(s => { if (s.active !== false && !roles[s.role]) roles[s.role] = s.id; });
  for (const role of Object.keys(roles)) {
    for (const persona of Object.keys(PERSONAS)) {
      become(persona, 'active');
      AD.db.update(s => { s.session = { staffId: roles[role], at: CLG.now().toISOString() }; });
      for (const raw of routes()) {
        const nf = /#nf$/.test(raw), route = raw.replace(/#nf$/, '');
        const r = parse(route);
        const key = DETAIL[r.name] && r.params.length ? DETAIL[r.name] : r.name;
        const scr = AD.screens[key];
        const label = `${role}/${persona} ${route}`;
        n++; count++;
        if (!scr) { fail('admin', label, '画面が登録されていない'); continue; }
        const ctx = { name: r.name, params: r.params, query: r.query, key: r.key, go() {}, refresh() {}, setQuery() {}, announce() {},
          R, U, DATA: D, AU: AD.ui, db: AD.db, data: AD.data, ops: AD.ops, staff: AD.db.staff(), live: AD.data.live(), state: store.state };
        try {
          const html = scr.render(ctx);
          const title = typeof scr.title === 'function' ? scr.title(ctx) : scr.title;
          if (!html || typeof html !== 'string') { fail('admin', label, 'render() が文字列を返していない'); continue; }
          const j = junk(html + ' ' + title);
          if (j.length) { fail('admin', label, j.join(',') + ' が含まれる'); continue; }
          if (nf && !/見つかりません|見つかりませんでした/.test(html + title)) { fail('admin', label, `知らない id なのに「見つかりません」にならない（題：${title}）`); continue; }
          sweep('admin ' + r.name, html);
          ok('admin', label, `OK ${html.length}文字 title=${title}`);
        } catch (e) { fail('admin', label, '例外 ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
      }
    }
  }
  // 記録の書き出し・削除の申込み：デモ会員のプロフィールに「済みにする」が出て、AD.ops.completeDataRequest で会員ページも済みになる
  {
    n++; count++;
    const label = '会員の詳細の記録の申込み（AD.ops.completeDataRequest）';
    try {
      become('demo', 'active');
      AD.db.update(s => { s.session = { staffId: roles['運営'] || Object.values(roles)[0], at: CLG.now().toISOString() }; });
      const live = AD.data.live(), req = R.requestData('delete').request;
      const ctx = { name: 'members', params: [live.no], query: {}, key: 'members/' + live.no, go() {}, refresh() {}, setQuery() {}, announce() {},
        R, U, DATA: D, AU: AD.ui, db: AD.db, data: AD.data, ops: AD.ops, staff: AD.db.staff(), live, state: store.state };
      const h1 = AD.screens.member.render(ctx);
      const res = AD.ops.completeDataRequest(req.id);
      const h2 = AD.screens.member.render(ctx);
      const st = (R.dataRequests().find(x => x.id === req.id) || {}).status;
      if (!/data-md-datadone="/.test(h1)) fail('admin', label, '受付中の申込みに「済みにする」が出ない');
      else if (!res.ok || st !== 'done' || !res.audit) fail('admin', label, '済みにならない ' + JSON.stringify(res).slice(0, 160));
      else if (/data-md-datadone="/.test(h2) || !/済み/.test(h2)) fail('admin', label, '済んだあとも「済みにする」が残る');
      else if (AD.ops.completeDataRequest(req.id).ok) fail('admin', label, '2回目を断らない');
      else ok('admin', label, 'OK');
    } catch (e) { fail('admin', label, '例外 ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
  // ▲ リクエストに運営が返事をする（AD.ops.answerRequest）：監査の記録・会員ページのお知らせ・「追加しました」の +20pt は1回だけ。
  //   成果発表会の一般公開の枠（AD.ops.showcasePublic）：会員ページの R.publicShowcase も変わる。どちらも確かめたら元に戻す
  if (AD.ops && typeof AD.ops.answerRequest === 'function') {
    n++; count++;
    const label = 'リクエストの返事（AD.ops.answerRequest）';
    try {
      become('demo', 'active');
      AD.db.update(s => { s.session = { staffId: roles['運営'] || Object.values(roles)[0], at: CLG.now().toISOString() }; });
      const mine = R.requests({ mine: true })[0];
      const nt = R.notices().length, pt0 = R.points().total;
      const bad = AD.ops.answerRequest(mine.id, { status: 'declined', reply: '' });
      const res = AD.ops.answerRequest(mine.id, { status: 'added', reply: '「動画編集」に1回足しました。', link: 'course:video' });
      const again = AD.ops.answerRequest(mine.id, { status: 'added', reply: '直しました。', link: 'course:video' });
      const row = R.request(mine.id);
      if (bad && bad.ok) fail('admin', label, '理由のない見送りを受け付けた');
      else if (!res || !res.ok || !res.audit) fail('admin', label, '返事が付かない・監査の記録がない ' + JSON.stringify(res).slice(0, 160));
      else if (row.status !== 'added' || !row.reply || R.notices().length < nt + 1 || R.notices()[0].type !== 'request') fail('admin', label, '会員ページに返事とお知らせが出ない');
      else if (R.points().total !== pt0 + 20 || !again.ok || again.pt) fail('admin', label, `+20pt が1回だけにならない（${pt0} → ${R.points().total}）`);
      else ok('admin', label, 'OK');
    } catch (e) { fail('admin', label, '例外 ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  } else { n++; count++; fail('admin', 'リクエストの返事', 'AD.ops.answerRequest がない'); }
  if (AD.ops && typeof AD.ops.showcasePublic === 'function') {
    n++; count++;
    const label = '一般公開の枠（AD.ops.showcasePublic）';
    try {
      const off = AD.ops.showcasePublic('e4', false), gone = R.publicShowcase();
      const on = AD.ops.showcasePublic('e4', true), back = R.publicShowcase();
      if (!off.ok || !off.audit || gone !== null) fail('admin', label, '切っても公開の頁が残る ' + JSON.stringify(off).slice(0, 120));
      else if (!on.ok || !back || back.eventId !== 'e4') fail('admin', label, '戻しても公開の頁が出ない');
      else ok('admin', label, 'OK');
    } catch (e) { fail('admin', label, '例外 ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  } else { n++; count++; fail('admin', '一般公開の枠', 'AD.ops.showcasePublic がない'); }
  // 人を切り替えても残るもの（リクエストの返事・一般公開の切り替え）を消す
  { const s = store.state; if (s.settings) delete s.settings.showcasePublic; if (s.requests) s.requests.answers = {}; store.resetDemo(true); }
  AD.db.update(s => { s.session = null; });
  return n;
}

/* ============================================================
   実行
   ============================================================ */
const t0 = Date.now();
const counts = {};
if (want('member')) counts['会員ページの画面'] = checkMember();
if (want('shell')) counts['骨組み'] = checkShell();
if (want('rules')) counts['ルール'] = checkRules();
if (want('admin')) counts['運営画面'] = checkAdmin();
if (!ROUTE_ARGS.length && (!ONLY || ONLY === 'words' || ONLY === 'member' || ONLY === 'admin')) {
  // 5. 言葉：上で描いた HTML に出た、使わない言葉
  if (ONLY === 'words' && !counts['会員ページの画面']) { counts['会員ページの画面'] = checkMember(); }
  const hits = Object.keys(wordHits);
  hits.forEach(w => {
    const where = [...wordHits[w]];
    // ¥ は領収書だけに使う約束。会員ページのアカウント（領収書）と運営画面の支払いは数えない
    const rest = w === '¥' ? where.filter(x => !/member account|admin (payments|member|referrals)/.test(x)) : where;
    if (rest.length) fail('words', w, rest.join('・') + ' に出ている');
  });
  counts['言葉'] = WORDS.length + 1;
}
console.log('');
console.log(Object.keys(counts).map(k => `${k} ${counts[k]}`).join(' / ') + `  （${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
if (bad) {
  console.log(`問題 ${bad} 件`);
  // 同じ種類の失敗が多いときに読みやすいよう、先頭の20件をまとめて出し直す
  if (problems.length > 20) problems.slice(0, 20).forEach(p => console.log('  ' + p));
} else console.log('問題なし');
process.exit(bad ? 1 : 0);
