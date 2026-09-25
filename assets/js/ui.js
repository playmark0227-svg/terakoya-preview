/* ============================================================
   画面まわりの共通部品（公開サイト・会員ページ・運営画面で共通）
   HTMLは文字列で組む。外から来た文字は必ず esc() を通す。
   ------------------------------------------------------------
   表記の決まり（どの画面もこれに合わせる）
   - お金：yen(1200) →「1,200円」。特商法の表示と同じ書き方で、¥ は使わない。
           領収書の金額欄だけ yen(n, { mark: true }) →「¥1,200」。
   - 日付：一覧・札・行の補足は fmtShort →「9/26(土)」「9/26(土) 20:00」。
           詳細・契約・支払い・領収書の行は fmtDate →「2026年9月26日(土)」。
           今年のことで年が要らない詳細は fmtDate(d, { noYear: true })。
           投稿・通知の時刻は relTime →「3時間前」「昨日」。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};
  var doc = global.document;
  var uid = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  /** 日本語の文を、行の途中で割りたくない言葉を守って出す（esc 済みの HTML を返す）。
      word-break:auto-phrase が効かないブラウザ（Safari など）で「スマ／ホ」「10／分」と割れないように、
      数と単位・日付・時刻と、よく割れる言葉を <span class="nw"> で包む。jp(文, { br: true }) で改行も <br> に。
      auto-phrase が効くブラウザ（Chrome）では、それでも割れるものだけを包む：日付（9月30日・9/26(土) 20:00）・
      曜日と続く時刻（毎週水曜20:00・毎月最終金曜・土曜日 10:00）・回の数（全5回・第3回）。
      ほかも包むと、そこで文節が切れて「15分」だけが1行に残るため。
      「第3回」「全4回」「月2回」のように数の前の1文字も一緒に守る。
      データの文字（data.js）には印を書き込まない（esc で文字のまま出てしまうため）。画面で出すときにこれを通す */
  var NW_WORDS = ['プライバシーポリシー', 'オリエンテーション', 'スタートガイド', 'メッセージ', 'スマホ', '会員番号', '公式LINE', '前回の続き'];
  var DATE_P = '\\d{1,2}\\/\\d{1,2}(?:\\([日月火水木金土]\\))?(?: \\d{1,2}:\\d{2})?|\\d{1,2}月\\d{1,2}日(?:\\([日月火水木金土]\\))?';
  /* 曜日の言葉（「毎週水曜」「毎月最終金曜」「隔週土曜日」）は、あとに続く時刻（20:00・20:00〜21:00）と一緒に守る */
  var WEEK_P = '(?:毎週|隔週|毎月(?:最終|第[1-5])?)?[月火水木金土日]曜日?(?: ?\\d{1,2}:\\d{2}(?:〜\\d{1,2}:\\d{2})?)?';
  var COUNT_P = '[全第]\\d+回';
  var NW_RE = new RegExp('(' + WEEK_P + '|' + DATE_P + '|(?:毎月|毎週|[全第月週毎約])?\\d[\\d,]*(?:\\.\\d+)?(?:〜\\d[\\d,]*)?(?:分|円|本|回|人|名|件|日|か月|時間|秒|XP|pt|%)|\\d{1,2}:\\d{2})', 'g');
  var AUTO_PHRASE = (function () {
    try { return !!(global.CSS && global.CSS.supports && global.CSS.supports('word-break', 'auto-phrase')); } catch (e) { return false; }
  })();
  /* auto-phrase でも割れるもの：日付（「9月／30日」）・曜日と時刻（「毎週水／曜20:00」）・回の数（「全／5回」） */
  var AUTO_RE = new RegExp('(' + WEEK_P + '|' + DATE_P + '|' + COUNT_P + ')', 'g');
  function jp(s, o) {
    var h = esc(s);
    if (!AUTO_PHRASE) {
      h = h.replace(NW_RE, '<span class="nw">$1</span>');
      NW_WORDS.forEach(function (w) { h = h.split(w).join('<span class="nw">' + w + '</span>'); });
    } else h = h.replace(AUTO_RE, '<span class="nw">$1</span>');
    return o && o.br ? h.replace(/\n/g, '<br>') : h;
  }
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function mq(q) { try { return !!(global.matchMedia && global.matchMedia(q).matches); } catch (e) { return false; } }
  /** 属性セレクタの値に入れるための逃がし（" と \ だけ） */
  function q(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  /* ---------- 数と日付 ---------- */
  function yen(n, opt) {
    var v = Math.round(Number(n) || 0), s = Math.abs(v).toLocaleString('ja-JP');
    if (opt && opt.mark) return (v < 0 ? '-' : '') + '¥' + s;
    return (v < 0 ? '-' : '') + s + '円';
  }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString('ja-JP'); }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function toDate(d) { return d instanceof Date ? d : new Date(d); }
  function bad(d) { return d == null || d === '' || isNaN(toDate(d)); }
  /** 2026年9月23日(水)。詳細・契約・支払いの行で使う */
  function fmtDate(d, opt) {
    if (bad(d)) return '';
    d = toDate(d); opt = opt || {};
    var s = (opt.noYear ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (opt.wd !== false) s += '(' + WD[d.getDay()] + ')';
    if (opt.time) s += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return s;
  }
  /** 9/23(水)。一覧・札で使う */
  function fmtShort(d, time) {
    if (bad(d)) return '';
    d = toDate(d);
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')' + (time ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** 「3時間前」「昨日」など。基準は CLG.now()（検証用に動かせる） */
  function relTime(d) {
    if (bad(d)) return '';
    var now = CLG.now ? CLG.now() : new Date(), t = toDate(d);
    var diff = (now - t) / 1000;
    // 数分先の時刻（入会直後の自動のお知らせなど。ルールは5分先まで出す）は「たった今」
    if (diff < 0) return diff > -300 ? 'たった今' : fmtShort(t, true);
    if (diff < 60) return 'たった今';
    if (diff < 3600) return Math.floor(diff / 60) + '分前';
    // 日をまたいだら暦の日数で数える（おとといの夜を「昨日」と言わないため）
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    var b = new Date(t); b.setHours(0, 0, 0, 0);
    var days = Math.round((a - b) / 86400000);
    if (days === 0) return Math.floor(diff / 3600) + '時間前';
    if (days === 1) return '昨日';
    if (days < 7) return days + '日前';
    return fmtShort(t);
  }

  /* ---------- 一言の知らせ ----------
     toast(msg, kind, opts)  kind: 'ok' | 'error'（読み上げで割り込む）| なし
     - 出ている時間は文字数で決める（最低3.2秒、1文字70ms）。指を乗せる・焦点があるあいだは止める
     - 同時に出すのは2つまで（古いものから消す）
     - opts.action + opts.onAction で「元に戻す」などのボタンを1つ付けられる
     - 画面が切り替わったら消す（toast.clear）。ただし切り替えの直前に出したものは残す
       （「投稿しました」を出してから一覧へ移る、という流れで消えないように） */
  var TOAST_MAX = 2;
  function toastHost() {
    var host = $('#toast');
    if (!host) {
      host = doc.createElement('div'); host.id = 'toast';
      host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
      doc.body.appendChild(host);
    }
    return host;
  }
  function dropToast(el) {
    if (!el || el._gone) return;
    el._gone = true; clearTimeout(el._t);
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
  }
  function toast(msg, kind, opts) {
    if (!doc || !doc.body || !doc.createElement) return null;
    opts = opts || {};
    var host = toastHost(), text = String(msg == null ? '' : msg);
    var el = doc.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    if (kind === 'error') el.setAttribute('role', 'alert');
    var t = doc.createElement('span'); t.className = 'toast__txt'; t.textContent = text; el.appendChild(t);
    if (opts.action && typeof opts.onAction === 'function') {
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'toast__btn'; b.textContent = opts.action;
      b.addEventListener('click', function (e) { e.stopPropagation(); dropToast(el); opts.onAction(); });
      el.appendChild(b);
    }
    el._at = Date.now();
    var ms = opts.duration || Math.max(opts.action ? 6000 : 3200, 70 * text.length), left = ms, started = Date.now();
    function run() { started = Date.now(); el._t = setTimeout(function () { dropToast(el); }, left); }
    function hold() { clearTimeout(el._t); left = Math.max(1200, left - (Date.now() - started)); }
    el.addEventListener('mouseenter', hold); el.addEventListener('mouseleave', run);
    el.addEventListener('focusin', hold); el.addEventListener('focusout', run);
    el.addEventListener('click', function () { if (!opts.action) dropToast(el); });
    host.appendChild(el);
    var live = $$('.toast', host).filter(function (x) { return !x._gone; });
    while (live.length > TOAST_MAX) dropToast(live.shift());
    run();
    return el;
  }
  toast.clear = function (all) {
    if (!doc || !doc.querySelectorAll) return;
    var now = Date.now();
    $$('#toast .toast').forEach(function (el) { if (all === true || now - (el._at || 0) > 800) dropToast(el); });
  };

  /* ---------- 重ねる窓 ----------
     modal(html, opts) → 窓の外側の要素（.close() で閉じる／.dismiss() は書きかけなら確かめてから閉じる）
     opts:
       title   見出し（上に留まる帯に、× と一緒に出す。窓の名前として読み上げる）
       foot    下に留まるボタンの行のHTML。true なら「閉じる」だけ。
               並びは［btn-soft やめる／閉じる］＋［btn-primary する事］。コピーなど中立の動きは btn-ink
       dirty   true：中の欄が変わったら、Esc・背景・× で「入力中の内容を破棄しますか」と聞く
               関数：true を返すあいだ聞く
       wide    幅を広く（720px）      cls   窓に足すクラス（例 'scr-perks'。画面の CSS を効かせる）
       sticky  背景・Esc では閉じない  onEsc Esc を押したときの動き（sticky でも呼ぶ）
       focus   最初に焦点を置く要素のセレクタ   label 見出しがないときの窓の名前
       onClose 閉じたあとに呼ぶ        role  'alertdialog' など    describedby 説明の要素の id
     中の [data-close] を押すと閉じる。title を使わない古い書き方でも、先頭が .modal__ttl なら
     自動で上の帯（見出し＋×）にする。
     窓の中身を描き直すとき：押したものに data-focus-after="<セレクタ>" を付けておくと、押したものが消えたらその先へ焦点を移す。
     非同期で描き直すときは、返り値の .refocus(セレクタ) を呼ぶ。
     開いているあいだ、窓の外は inert（読み上げ・Tab が届かない）。閉じたら開いたボタンに焦点を戻す
     （描き直されていたら、同じ id か data-* を持つ要素を探して戻す。それも無ければ、開いたボタンの
     data-focus-after="<セレクタ>" の先 → 画面の見出し）。
     最初の焦点：focus → パソコンなら最初の入力欄 → [data-no]/[data-cancel] → 下の行の「閉じる」「やめる」→ ×。
     下の行のリンク（押すと画面が移るもの）には最初から置かない。 */
  var FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),' +
    'textarea:not([disabled]),iframe,summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return $$(FOCUSABLE, root).filter(function (el) {
      if (el.closest('[inert],[hidden]')) return false;
      if (!el.getClientRects().length) return false;
      try { return global.getComputedStyle(el).visibility !== 'hidden'; } catch (e) { return true; }
    });
  }
  function focusEl(el) { if (!el) return false; try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} } return doc.activeElement === el; }
  /** 開いたボタンを描き直し後にも見つけるための手がかり。探す順に並べたセレクタの配列を返す
      id → data-* を全部そろえたもの → data-* の1つ（ただ1つに決まるときだけ）→ 最初の data-* → href
      （data-ev="reserve" data-id="e1" のように、1つ目の data-* だけでは別のボタンに当たる画面があるため） */
  function keyOf(el) {
    if (!el || el === doc.body || !el.getAttribute) return null;
    if (el.id) return [{ sel: '[id="' + q(el.id) + '"]' }];
    var tag = el.tagName.toLowerCase(), all = '', singles = [], out = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (!/^data-/.test(a.name) || a.name === 'data-u-inert' || a.name === 'data-focus-after') continue;
      var one = '[' + a.name + '="' + q(a.value) + '"]';
      all += one; singles.push(one);
    }
    if (all) out.push({ sel: tag + all });
    for (var j = singles.length - 1; j >= 0; j--) out.push({ sel: singles[j], only: true });
    if (singles.length) out.push({ sel: tag + singles[0] });
    if (el.getAttribute('href')) out.push({ sel: 'a[href="' + q(el.getAttribute('href')) + '"]' });
    return out.length ? out : null;
  }
  function findByKey(keys) {
    for (var i = 0; keys && i < keys.length; i++) {
      var hits;
      try { hits = $$(keys[i].sel).filter(function (el) { return !el.closest('[inert]') && el.getClientRects().length; }); } catch (e) { hits = []; }
      if (keys[i].only) hits = hits.filter(function (el) { return el.matches(FOCUSABLE); });
      if (keys[i].only ? hits.length === 1 : hits.length) return hits[0];
    }
    return null;
  }
  function openModals() { return $$('.modal-bg').filter(function (b) { return !b._closing; }); }
  /** いちばん上の窓だけを生かし、ほかの body 直下は inert にする（自分で付けた inert だけを外す） */
  function syncInert() {
    if (!doc || !doc.body) return;
    var list = openModals(), top = list[list.length - 1];
    Array.prototype.forEach.call(doc.body.children, function (el) {
      var live = !top || el === top || el.id === 'toast' || el.tagName === 'SCRIPT' || el.hasAttribute('data-keep-live');
      if (live) {
        if (el.hasAttribute('data-u-inert')) { el.removeAttribute('inert'); el.removeAttribute('data-u-inert'); try { el.inert = false; } catch (e) {} }
      } else if (!el.hasAttribute('inert')) {
        el.setAttribute('inert', ''); el.setAttribute('data-u-inert', '');
      }
    });
  }
  var X_BTN = function () { return '<button type="button" class="modal__x" data-x aria-label="閉じる">' + icon('close') + '</button>'; };

  function modal(html, opts) {
    opts = opts || {};
    var id = 'mdl' + (++uid);
    var opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    // メニューの項目から開いたときは、閉じたあとメニューのボタンに戻す（項目は隠れるため）
    var inPop = opener && opener.closest ? opener.closest('.pop') : null;
    if (inPop) opener = popTrigger(inPop) || opener;
    var openerKey = keyOf(opener);
    // 開いたボタンが窓の操作で別のものに入れ替わる（連携する → 連携済み）ときの行き先。ctx.refresh と同じ data-focus-after
    var openerAfter = opener && opener.getAttribute ? opener.getAttribute('data-focus-after') : null;
    closePops();

    var head = opts.title != null
      ? '<div class="modal__head"><h2 class="modal__ttl" id="' + id + '-t">' + esc(opts.title) + '</h2>' + (opts.x === false ? '' : X_BTN()) + '</div>' : '';
    var foot = opts.foot
      ? '<div class="modal__foot">' + (opts.foot === true ? '<button type="button" class="btn btn-soft" data-close>閉じる</button>' : opts.foot) + '</div>' : '';
    var bg = doc.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal' + (opts.wide ? ' modal-wide' : '') + (opts.cls ? ' ' + esc(opts.cls) : '') + '" role="' + esc(opts.role || 'dialog') + '" aria-modal="true" tabindex="-1">' +
      head + (head || foot ? '<div class="modal__body">' + html + '</div>' : html) + foot + '</div>';
    doc.body.appendChild(bg);
    doc.body.style.overflow = 'hidden';
    var box = $('.modal', bg);

    // 古い書き方（先頭が .modal__ttl）も、上に留まる帯（見出し＋×）にそろえる
    if (!head && opts.head !== false) {
      var t = box.firstElementChild;
      if (t && !t.classList.contains('modal__ttl') && /^(DIV|FORM|SECTION)$/.test(t.tagName) && t.firstElementChild && t.firstElementChild.classList.contains('modal__ttl')) t = t.firstElementChild;
      if (t && t.classList.contains('modal__ttl')) {
        var h = doc.createElement('div'); h.className = 'modal__head';
        t.parentNode.insertBefore(h, t); h.appendChild(t);
        if (opts.x !== false) h.insertAdjacentHTML('beforeend', X_BTN());
      }
    }
    if ($('.modal__head', box)) box.classList.add('has-head');
    var lab = $('.modal__ttl', box) || $('h1,h2,h3', box);
    if (lab) { if (!lab.id) lab.id = id + '-t'; box.setAttribute('aria-labelledby', lab.id); }
    else if (opts.label) box.setAttribute('aria-label', opts.label);
    if (opts.describedby) box.setAttribute('aria-describedby', opts.describedby);

    var touched = false, asking = false, downOnBg = false;
    if (opts.dirty === true) {
      box.addEventListener('input', function () { touched = true; });
      box.addEventListener('change', function () { touched = true; });
    }
    function isDirty() { return typeof opts.dirty === 'function' ? !!opts.dirty() : touched; }
    function isTop() { var all = openModals(); return all[all.length - 1] === bg; }

    function close(restore) {
      if (!bg.parentNode || bg._closing) return;
      bg._closing = true;
      bg.parentNode.removeChild(bg);
      // 下にまだ窓が残っていれば、背景のスクロールは止めたままにする
      if (!openModals().length) doc.body.style.overflow = '';
      doc.removeEventListener('keydown', onKey);
      global.removeEventListener('hashchange', onHash);
      syncInert();
      if (restore !== false) {
        // 開いたボタン → 描き直された同じボタン（id・data-*）→ その data-focus-after の先 → 下の窓 → 画面の見出し
        var target = opener && opener.isConnected && !opener.closest('[inert]') ? opener : null;
        if (!focusEl(target) && !focusEl(openerKey ? findByKey(openerKey) : null)) {
          var after = null;
          if (openerAfter) { try { after = focusables(doc).filter(function (x) { return x.matches(openerAfter); })[0] || null; } catch (e) { after = null; } }
          if (!focusEl(after)) {
            var top = openModals().pop();
            focusEl(top ? $('.modal', top) : $('[data-page-title]'));
          }
        }
      }
      if (opts.onClose) opts.onClose();
    }
    /** ×・Esc・背景：書きかけなら確かめてから閉じる */
    function dismiss() {
      if (asking) return;
      if (!opts.dirty || !isDirty()) { close(true); return; }
      asking = true;
      confirmBox('入力中の内容を破棄しますか', '閉じると、書いた内容は消えます。', '破棄する', true, { cancel: '入力に戻る' })
        .then(function (ok) { asking = false; if (ok) close(true); });
    }
    function trap(e) {
      var f = focusables(box);
      if (!f.length) { e.preventDefault(); focusEl(box); return; }
      var first = f[0], last = f[f.length - 1], a = doc.activeElement;
      if (e.shiftKey && (a === first || a === box || !box.contains(a))) { e.preventDefault(); focusEl(last); }
      else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); focusEl(first); }
    }
    function onKey(e) {
      if (!isTop()) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        // 変換中の Esc は変換の取り消し。窓は閉じない
        if (e.isComposing || e.keyCode === 229) return;
        if (e.defaultPrevented) return;      // 開いていた小さなメニューを閉じるのに使われた
        if (opts.onEsc) { e.preventDefault(); opts.onEsc(); return; }
        if (opts.sticky) return;
        e.preventDefault(); dismiss();
      } else if (e.key === 'Tab') trap(e);
    }
    // 戻るボタンなどで画面が変わったら閉じる（窓が新しい画面に残らないように）。焦点は新しい画面に任せる
    function onHash() { close(false); }
    doc.addEventListener('keydown', onKey);
    global.addEventListener('hashchange', onHash);
    bg.addEventListener('mousedown', function (e) { downOnBg = e.target === bg; });
    bg.addEventListener('click', function (e) {
      if (e.target === bg) { if (downOnBg && !opts.sticky) dismiss(); return; }
      if (e.target.closest('[data-x]')) { dismiss(); return; }
      if (e.target.closest('[data-close]')) close(true);
    });

    // スマホの下から出る窓は、上の帯を下に引いても閉じられる
    var handle = $('.modal__head', box);
    if (handle) {
      var y0 = null, dy = 0;
      handle.addEventListener('touchstart', function (e) {
        if (opts.sticky || !mq('(max-width: 640px)') || e.touches.length !== 1 || box.scrollTop > 0) return;
        y0 = e.touches[0].clientY; dy = 0;
      }, { passive: true });
      handle.addEventListener('touchmove', function (e) {
        if (y0 == null) return;
        dy = Math.max(0, e.touches[0].clientY - y0);
        box.style.transition = 'none'; box.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
      }, { passive: true });
      handle.addEventListener('touchend', function () {
        if (y0 == null) return;
        y0 = null; box.style.transition = ''; box.style.transform = '';
        if (dy > 90) dismiss();
      });
    }

    /* 窓の中身を描き直したときの焦点。押したものが消えて別のものに入れ替わったら（予約する → 取り消す）、
       押したものの data-focus-after の先へ。非同期で描き直す画面は m.refocus(セレクタ) を呼ぶ */
    function refocus(sel) {
      if (!bg.parentNode || bg._closing) return false;
      var el = null;
      if (sel) { try { el = focusables(box).filter(function (x) { return x.matches(sel); })[0] || null; } catch (e) { el = null; } }
      return focusEl(el || box);
    }
    box.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-focus-after]') : null;
      if (!t || !box.contains(t)) return;
      var sel = t.getAttribute('data-focus-after');
      setTimeout(function () {
        // 押したものが残っている・ほかの窓が上に開いた・画面が自分で焦点を置いた、のどれかなら何もしない
        if (t.isConnected || !isTop()) return;
        var a = doc.activeElement;
        if (a && a !== doc.body && a !== box && box.contains(a)) return;
        refocus(sel);
      }, 0);
    });

    bg.close = function () { close(true); };
    bg.dismiss = dismiss;
    bg.setDirty = function (v) { touched = !!v; };
    bg.refocus = refocus;
    syncInert();

    // 焦点：opts.focus → パソコンなら最初の入力欄 → やめる・閉じる → × → 窓そのもの
    // （スマホで開いた瞬間にキーボードが出ないように、入力欄にはパソコンのときだけ置く）
    // 下の行のリンク（「すべて見る」など、押すと画面が移るもの）には最初から置かない
    setTimeout(function () {
      if (!bg.parentNode || bg._closing) return;
      var fine = mq('(pointer: fine)');
      var cancel = $$('.modal__foot button.btn-soft', box).filter(function (b) { return /^(やめる|閉じる|キャンセル|戻る|入力に戻る)/.test((b.textContent || '').trim()); })[0];
      // 入力欄は、見えていて押せるものだけ（hidden の input[type=file] などに焦点を置かない）
      var field = fine ? focusables(box).filter(function (x) {
        return x.matches('input:not([type=checkbox]):not([type=radio]):not([readonly]),textarea:not([readonly]),select');
      })[0] : null;
      var el = (opts.focus && $(opts.focus, box)) || field ||
        $('[data-cancel],[data-no]', box) || $('.modal__foot button[data-close]', box) || cancel || $('[data-x]', box) ||
        $('.modal__foot button.btn-soft', box) || $('button[data-close]', box) || box;
      focusEl(el);
    }, 30);
    return bg;
  }

  /** 確かめる窓。Esc と「やめる」は false、背景を押しても閉じない。
      confirmBox(title, message, okLabel, danger, { cancel: 'やめる', kind: 'primary'|'ink' }) */
  function confirmBox(title, message, okLabel, danger, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false, did = 'cfm' + (++uid), m;
      function fin(v) { if (done) return; done = true; if (m) m.close(); resolve(v); }
      m = modal(message ? '<p class="sub" id="' + did + '">' + nl2br(message) + '</p>' : '', {
        title: title, x: false, sticky: true, role: 'alertdialog', describedby: message ? did : null, cls: 'modal-confirm',
        foot: '<button type="button" class="btn btn-soft" data-no>' + esc(o.cancel || 'やめる') + '</button>' +
          '<button type="button" class="btn ' + (danger ? 'btn-danger' : o.kind === 'ink' ? 'btn-ink' : 'btn-primary') + '" data-yes>' + esc(okLabel || 'OK') + '</button>',
        focus: '[data-no]',
        onEsc: function () { fin(false); },
        onClose: function () { if (!done) { done = true; resolve(false); } }
      });
      $('[data-no]', m).addEventListener('click', function () { fin(false); });
      $('[data-yes]', m).addEventListener('click', function () { fin(true); });
    });
  }

  /* ---------- 小さなメニュー（popover） ----------
     <button type="button" data-pop="meMenu" aria-expanded="false" aria-controls="meMenu">…</button>
     <div class="pop" id="meMenu" hidden>
       <a class="pop__item" href="#/account">…</a> …
     </div>
     （開け閉めするボタンと、ふつうのリンク・ボタンの並び。role="menu" は付けない：中に見出しや区切りの文字があるため）
     印を付けるだけで動く：押すと開閉、外を押す・Esc・画面の切り替えで閉じる、↑↓ Home End で項目を移る、
     項目を押したら閉じる。キーボードで開いたときは最初の項目に焦点を置く。 */
  function popTrigger(p) { return p && p.id ? $('[data-pop="' + q(p.id) + '"]') : null; }
  function openPop() { return $$('.pop').filter(function (p) { return !p.hidden; })[0] || null; }
  function closePops(refocus) {
    if (!doc || !doc.querySelectorAll) return;
    $$('.pop').forEach(function (p) {
      if (p.hidden) return;
      p.hidden = true;
      var t = popTrigger(p);
      if (t) { t.setAttribute('aria-expanded', 'false'); if (refocus) focusEl(t); }
    });
  }
  function popItems(p) { return focusables(p).filter(function (el) { return /^menuitem/.test(el.getAttribute('role') || '') || el.matches('a[href],button'); }); }
  if (doc && doc.addEventListener) {
    doc.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      var t = el.closest('[data-pop]');
      if (t) {
        var p = doc.getElementById(t.getAttribute('data-pop'));
        if (!p) return;
        e.preventDefault();
        if (!p.hidden) { closePops(); return; }
        closePops();
        p.hidden = false; t.setAttribute('aria-expanded', 'true');
        if (e.detail === 0) focusEl(popItems(p)[0]);
        return;
      }
      var inPop = el.closest('.pop');
      if (inPop) { if (el.closest('a[href],button,[role^="menuitem"]')) closePops(); return; }
      closePops();
    });
    doc.addEventListener('keydown', function (e) {
      var p = openPop();
      if (!p) return;
      var t = popTrigger(p), a = doc.activeElement, inside = p.contains(a) || a === t;
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault(); closePops(true); return;
      }
      if (!inside) return;
      var items = popItems(p), i = items.indexOf(a);
      if (e.key === 'ArrowDown') { e.preventDefault(); focusEl(items[(i + 1) % items.length]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusEl(items[(i - 1 + items.length) % items.length]); }
      else if (e.key === 'Home') { e.preventDefault(); focusEl(items[0]); }
      else if (e.key === 'End') { e.preventDefault(); focusEl(items[items.length - 1]); }
      else if (e.key === 'Tab') closePops();
    });
    // 探す欄（notFound などの [data-u-search]）：#/search?q=… に移る
    doc.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || !f.matches || !f.matches('[data-u-search]')) return;
      e.preventDefault();
      var v = f.q ? String(f.q.value || '').trim() : '';
      global.location.hash = '#/search' + (v ? '?q=' + encodeURIComponent(v) : '');
    });
  }
  if (global.addEventListener) {
    global.addEventListener('hashchange', function () { closePops(); toast.clear(); });
  }

  function copyText(text) {
    /* 安全でないページ（http の試し見）では、見えない欄を選んでコピーする。そのあと、押したボタンへ焦点を戻す（Tab の場所を失わないように） */
    function fallback() {
      var was = doc.activeElement;
      var ta = doc.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true'); ta.tabIndex = -1;
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch (e) {}
      ta.remove();
      if (was && was !== doc.body && was.isConnected) focusEl(was);
    }
    try {
      if (navigator.clipboard && global.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    } catch (e) {}
    fallback();
    return Promise.resolve();
  }

  /** 保存させる。BOM は Excel で CSV を開くため。.ics など BOM を嫌う形式は opts.bom=false */
  function download(name, text, mime, opts) {
    var bom = !(opts && opts.bom === false);
    var blob = new Blob([(bom ? '\ufeff' : '') + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /** ページ内の場所へ動かす。「動きを減らす」設定の人には飛ぶだけにする。
      smoothScroll(el|セレクタ, { block: 'start'|'center', focus: true }) */
  function smoothScroll(el, o) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    o = o || {};
    var reduce = mq('(prefers-reduced-motion: reduce)');
    try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: o.block || 'start' }); } catch (e) { el.scrollIntoView(); }
    if (o.focus) {
      if (!el.matches(FOCUSABLE) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      focusEl(el);
    }
  }

  /* ---------- 顔 ----------
     本人が上げた写真があれば写真（alt は空。名前は隣に書く）。なければ名前の頭文字と色。
     運営・講師には is-staff を付ける（見分け方は画面の側で決める）。 */
  /** 頭文字：表示名の「｜」「@」「（」より前（肩書きや地域は使わない）の、姓の2文字。
      ローマ字の名前は頭文字2つ（Mai Watanabe → MW）。本名（realName）は使わない（出していない名前を顔に出さないため） */
  function initials(name) {
    var s = String(name || '').replace(/[\s\u3000]+/g, ' ').trim();
    s = s.replace(/^[【\[（(][^】\]）)]*[】\]）)]\s*/, '');                          // 先頭の【…】（肩書き）は飛ばす
    s = s.replace(/^[^0-9A-Za-z\u3040-\u30ff\u3400-\u9fff\uff10-\uff5a]+/, '');   // 先頭の記号は飛ばす
    s = s.split(/[｜|@＠（(【\[／/・,，、]/)[0].trim() || String(name || '').replace(/[\s\u3000【】\[\]（）()｜|@＠]/g, '');
    if (!s) return '?';
    var p = s.split(' ');
    if (/^[A-Za-z]/.test(p[0])) return (p[0].charAt(0) + (p[1] && /^[A-Za-z]/.test(p[1]) ? p[1].charAt(0) : '')).toUpperCase();
    return p[0].slice(0, 2);
  }
  function safeColor(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#8b867d'; }
  function safeSrc(u) { u = String(u || ''); return /^(data:image\/(png|jpe?g|gif|webp);|https?:\/\/|assets\/)/i.test(u) ? u : ''; }
  function avatar(person, size) {
    person = person || {};
    var cls = 'avatar' + (size === 's' ? ' avatar-s' : size === 'l' ? ' avatar-l' : size === 'xs' ? ' avatar-xs' : '') + (person.staff ? ' is-staff' : '');
    var src = safeSrc(person.photo);
    if (src) return '<img class="' + cls + ' avatar-photo" src="' + esc(src) + '" alt="" loading="lazy" decoding="async">';
    return '<span class="' + cls + '" style="--c:' + safeColor(person.color) + '" aria-hidden="true">' + esc(initials(person.name)) + '</span>';
  }
  /** 顔＋名前。会員のページ（#/members/<id>）へのリンク。id がなければリンクにしない。
      personLink(person, { id, size: 's'|'xs'|'', sub: '旭川市', link: false }) */
  function personLink(person, o) {
    person = person || {}; o = o || {};
    var id = o.id || person.id;
    var inner = avatar(person, o.size == null ? 's' : o.size) +
      '<span class="plink__name">' + esc(person.name || '会員') + '</span>' +
      (o.sub ? '<span class="plink__sub">' + esc(o.sub) + '</span>' : '');
    if (!id || o.link === false) return '<span class="plink">' + inner + '</span>';
    return '<a class="plink" href="#/members/' + encodeURIComponent(id) + '">' + inner + '</a>';
  }

  /** 進みぐあいの棒。progressBar(pct, kind, { label, valuetext, decorative })
      kind：講座の進み 'ink'（既定）／レベル・XP 'gold'／できた 'ok'／'accent'
      リンクやボタンの中では decorative: true（読み上げない。数字は隣の文字で出す） */
  function progressBar(pct, kind, o) {
    if (typeof o === 'string') o = { label: o };
    o = o || {};
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    var cls = 'bar bar-' + (kind || 'ink') + (o.cls ? ' ' + esc(o.cls) : '');
    var fill = '<i style="width:' + (Math.round(pct * 10) / 10) + '%"></i>';
    if (o.decorative) return '<div class="' + cls + '" aria-hidden="true">' + fill + '</div>';
    return '<div class="' + cls + '" role="progressbar" aria-label="' + esc(o.label || '進みぐあい') + '" aria-valuenow="' + Math.round(pct) +
      '" aria-valuemin="0" aria-valuemax="100" aria-valuetext="' + esc(o.valuetext || Math.round(pct) + '%') + '">' + fill + '</div>';
  }
  function lvBadge(lv, name) {
    return '<span class="lv"><b>Lv' + esc(lv) + '</b>' + esc(name || '') + '</span>';
  }
  /** 空のとき。empty(記号, 文, { href, label } か ボタンのHTML) */
  function empty(iconName, text, act) {
    var a = '';
    if (act && typeof act === 'object' && act.href) a = '<a class="btn btn-soft btn-s" href="' + esc(act.href) + '">' + esc(act.label || '見る') + '</a>';
    else if (typeof act === 'string') a = act;
    return '<div class="empty">' + (iconName ? icon(iconName) : '') + '<p>' + esc(text) + '</p>' + (a ? '<div class="empty__act">' + a + '</div>' : '') + '</div>';
  }

  /* ---------- 状態の札 ----------
     statusTag(key, 文言)。色は意味で決める：
       進行中（応募済み・面談調整中・稼働中・保留・審査中・支払予定）→ 藍
       済み（完了・確定・予約済み・支払済）→ 緑   新着 → 朱   キャンセル待ち → 黄土   取消・締切 → 線だけ
     文言を渡さなければ下の短い名前を出す。 */
  var STATUS = {
    applied: ['indigo', '応募済み'], meeting: ['indigo', '面談調整中'], working: ['indigo', '稼働中'], active: ['indigo', '稼働中'],
    pending: ['indigo', '保留'], hold: ['indigo', '保留'], review: ['indigo', '審査中'], scheduled: ['indigo', '支払予定'],
    done: ['ok', '完了'], confirmed: ['ok', '確定'], reserved: ['ok', '予約済み'], paid: ['ok', '支払済'],
    'new': ['accent', '新着'], waitlist: ['warn', 'キャンセル待ち'],
    canceled: ['line', '取消'], cancelled: ['line', '取消'], 'void': ['line', '取消'], closed: ['line', '締切']
  };
  function statusTag(key, label) {
    var s = STATUS[key];
    return '<span class="tag' + (s ? ' tag-' + s[0] : '') + '" data-status="' + esc(key) + '">' + esc(label || (s ? s[1] : key)) + '</span>';
  }

  /* ---------- 見つからない ----------
     notFound({ title, lead })。URLの文字は画面に出さない（そのまま出すと、変な文を表示させるリンクを作れるため） */
  function notFound(o) {
    o = o || {};
    return '<div class="nf">' +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">' + esc(o.title || 'ページが見つかりません') + '</h1>' +
        '<p class="page-lead">' + esc(o.lead || 'アドレスが違うか、ページがなくなりました。') + '</p></div>' +
      '<form class="nf__search" role="search" data-u-search>' +
        '<label class="sr-only" for="nfQ' + (++uid) + '">会員ページの中を探す</label>' +
        '<input class="input" id="nfQ' + uid + '" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="講座・案件・投稿から探す">' +
        '<button class="btn btn-ink" type="submit">' + icon('search', 'ico-s') + '探す</button>' +
      '</form>' +
      '<p class="group-ttl nf__ttl">よく使うページ</p>' +
      '<div class="nf__links">' +
        '<a class="btn btn-ghost" href="#/home">' + icon('home', 'ico-s') + 'ホーム</a>' +
        '<a class="btn btn-ghost" href="#/courses">' + icon('play', 'ico-s') + '講座</a>' +
        '<a class="btn btn-ghost" href="#/messages">' + icon('message', 'ico-s') + '相談</a>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 続きから ----------
     resumeCard(course, lesson, { variant: 'home'|'row', st, resumeText: '4:12から', btn, btnCls, h })
     home：写真つきの1枚（ホームのいちばん上）。題（「第3回　…」）とボタンがその回へのリンク。上の講座の名前は文字だけ。
     row：.list の中の1行（講座の一覧）。行ごとその回へのリンク。「第3回」は <span class="nw"> で割らない。
     st は R.courseState(course)。渡さなければ CLG.rules から取る。
     進みの数は講座の中の「回」で数える（2/5回）。btnCls はボタンの色（既定 'btn-primary'。朱をほかに使う画面は 'btn-ink'） */
  function resumeCard(c, l, o) {
    o = o || {};
    if (!c || !l) return '';
    var R = CLG.rules, DATA = CLG.DATA || {};
    var st = o.st || (R && R.courseState ? R.courseState(c) : null) || {};
    var lessons = c.lessons || [], n = 1;
    for (var i = 0; i < lessons.length; i++) if (lessons[i].id === l.id) { n = i + 1; break; }
    var total = st.total || lessons.length || 1, done = st.done || 0;
    var pct = st.pct != null ? st.pct : done / total * 100, started = st.started != null ? st.started : done > 0;
    var href = '#/lesson/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(l.id);
    var img = c.img ? '<img src="' + esc(c.img) + '" alt="" loading="lazy" decoding="async">' : '';
    // 進みは講座の中の回で数える（「本」は講座を数えるとき）
    var count = done + '/' + total + '回';
    // 「第3回」はどのブラウザでも行の途中で割らない（auto-phrase が効くブラウザでは jp が包まないため、ここで包む）
    var nth = '<span class="nw">第' + n + '回</span>';
    // 「前回の続き 4:12 から」もひとかたまりで折る（「前回の／続き」と割れないように）
    var rest = o.resumeText ? '<span class="nw">' + esc(o.resumeText) + '</span>' : '';
    var btnCls = /^[\w -]+$/.test(o.btnCls || '') ? o.btnCls : 'btn-primary';
    if (o.variant === 'row') {
      return '<a class="li resume resume--row" href="' + href + '">' +
        (img ? '<span class="resume__thumb" aria-hidden="true">' + img + '</span>' : '') +
        '<span class="li__body">' +
          // 狭い幅では「講座の名前／第3回・9分・／前回の続き…」の切れ目で折る（「9分・」だけの行を作らない）
          '<span class="li__sub">' + jp(c.title) + '　<span class="nw">第' + n + '回・' + esc(l.min) + '分</span>' + (rest ? '・' + rest : '') + '</span>' +
          '<span class="li__ttl">' + jp(l.title) + '</span>' +
          (started ? '<span class="resume__prog">' + progressBar(pct, 'ink', { decorative: true }) + '<span class="num">' + count + '</span></span>' : '') +
        '</span>' + chevron() + '</a>';
    }
    var t = DATA.PEOPLE && DATA.PEOPLE[c.teacher];
    var meta = [l.min + '分']; if (t) meta.push('講師 ' + t.name);
    var h = /^h[2-4]$/.test(o.h || '') ? o.h : 'h3';
    // 講座の名前は文字だけ（題のリンクのすぐ上に別のリンクを置くと、スマホで押し分けられないため）
    return '<article class="card resume resume--home">' +
      (img ? '<a class="resume__img" href="' + href + '" tabindex="-1" aria-hidden="true">' + img + '</a>' : '') +
      '<div class="resume__body">' +
        '<p class="resume__over">' + jp(c.title) + '</p>' +
        '<' + h + ' class="resume__ttl"><a href="' + href + '">' + nth + '　' + jp(l.title) + '</a></' + h + '>' +
        '<p class="resume__sub">' + jp(meta.join('・')) + (rest ? '・' + rest : '') + '</p>' +
        (started ? '<div class="resume__prog">' + progressBar(pct, 'ink', { label: c.title + 'の進みぐあい', valuetext: count }) + '<span class="num">' + count + '</span></div>' : '') +
      '</div>' +
      '<a class="btn ' + btnCls + ' resume__btn" href="' + href + '">' + icon('play') + esc(o.btn || (started ? '続きを見る' : '見る')) + '</a>' +
    '</article>';
  }

  /* ---------- 読み込み中の形 ----------
     skeleton('list'|'cards'|'card'|'text'|'page', 数)。中身が出るまでの灰色の形。読み上げは「読み込み中」だけ */
  var SK_W = [92, 70, 84, 58, 78, 66];
  function skLine(w, cls) { return '<span class="skel-line' + (cls ? ' ' + cls : '') + '" style="width:' + w + '%"></span>'; }
  function skRow(i) {
    return '<div class="li skel-row"><span class="skel-circle"></span><span class="li__body">' +
      skLine(SK_W[i % SK_W.length] - 18, 'is-ttl') + skLine(SK_W[(i + 2) % SK_W.length]) + '</span></div>';
  }
  function skCard(i, img) {
    return '<div class="card skel-card">' + (img ? '<span class="skel-block"></span>' : '') +
      '<div class="card-pad">' + skLine(SK_W[i % SK_W.length] - 30, 'is-ttl') + skLine(100) + skLine(SK_W[(i + 1) % SK_W.length]) + '</div></div>';
  }
  function skeleton(kind, n) {
    var i, h = '', k = kind || 'list';
    n = n || (k === 'cards' ? 4 : k === 'text' ? 3 : 4);
    if (k === 'text') { for (i = 0; i < n; i++) h += skLine(i === n - 1 ? 56 : SK_W[i % SK_W.length]); }
    else if (k === 'card') h = skCard(0, false);
    else if (k === 'cards') { h = '<div class="grid-2">'; for (i = 0; i < n; i++) h += skCard(i, true); h += '</div>'; }
    else if (k === 'page') {
      h = '<div class="page-head">' + skLine(34, 'is-h1') + skLine(58) + '</div>' + skCard(0, false) +
        '<div class="sec">' + skLine(22, 'is-ttl') + '<div class="list">' + skRow(0) + skRow(1) + skRow(2) + '</div></div>';
    } else { h = '<div class="list">'; for (i = 0; i < n; i++) h += skRow(i); h += '</div>'; }
    return '<div class="skel skel-' + esc(k) + '" aria-busy="true"><span class="sr-only">読み込み中</span><div aria-hidden="true">' + h + '</div></div>';
  }

  /* ---------- 入力の誤り ----------
     fieldErrors(form, { name: '誤りの文' | '' }, { focus: true })
     公開サイトの申込フォームと同じ形にする：
     - 欄は .field（label.field > span + 入力）か [data-field] で包む
     - 必須の欄（required か data-required）には「必須」の札と aria-required を付ける
     - 誤りは欄の下に出し、入力に aria-invalid と aria-describedby（誤りの文の id）を付ける
     - errs に書いた欄だけを書き換える。空の文なら誤りを消す
     返り値は誤りの数。最初の誤りの入力に焦点を移す（opts.focus === false なら移さない） */
  function fieldErrors(form, errs, o) {
    if (!form || !form.querySelectorAll) return 0;
    errs = errs || {}; o = o || {};
    var fid = form.id || (form.id = 'frm' + (++uid)), count = 0, first = null;
    function boxOf(el) { return el.closest('.field,[data-field]'); }
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name || el.type === 'hidden') return;
      if (!el.id) el.id = fid + '-' + el.name.replace(/[^\w-]/g, '_') + (el.type === 'radio' ? '-' + String(el.value).replace(/[^\w-]/g, '_') : '');
      if (el.required || el.hasAttribute('data-required')) {
        el.setAttribute('aria-required', 'true');
        var b = boxOf(el), lab = b && (b.querySelector(':scope > span:first-child') || b.querySelector('.field__label,label'));
        if (lab && !lab.querySelector('.req')) lab.insertAdjacentHTML('beforeend', '<span class="req">必須</span>');
      }
    });
    Object.keys(errs).forEach(function (name) {
      var ctl = $$('[name="' + q(name) + '"]', form);
      if (!ctl.length) return;
      var msg = errs[name] || '', b = boxOf(ctl[0]), eid = 'e-' + fid + '-' + name.replace(/[^\w-]/g, '_');
      var p = doc.getElementById(eid);
      if (!p) {
        p = doc.createElement('span'); p.className = 'field__err'; p.id = eid;
        if (b) b.appendChild(p); else ctl[ctl.length - 1].insertAdjacentElement('afterend', p);
      }
      p.innerHTML = msg ? icon('info', 'ico-s') + '<span>' + esc(msg) + '</span>' : '';
      if (b) b.classList.toggle('is-err', !!msg);
      ctl.forEach(function (el) {
        var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (x) { return x && x !== eid; });
        if (msg) { el.setAttribute('aria-invalid', 'true'); ids.push(eid); } else el.removeAttribute('aria-invalid');
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
      });
      if (msg) { count++; if (!first) first = ctl[0]; }
    });
    if (first && o.focus !== false) { focusEl(first); try { first.scrollIntoView({ block: 'center', behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' }); } catch (e) {} }
    return count;
  }

  /* ---------- 記号 ----------
     線だけの20pxの記号。外部ファイルにせず埋め込み。
     名前 → 用途：ナビの各項目、一覧の先頭、ボタンの前 */
  var ICONS = {
    home:     '<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/>',
    flag:     '<path d="M4.5 17.5V3.2M4.5 3.8h9.2l-1.8 3.3 1.8 3.3H4.5"/>',
    play:     '<rect x="2.5" y="4.5" width="15" height="11" rx="2.2"/><path d="M8.5 7.9v4.2l3.6-2.1z"/>',
    feed:     '<path d="M4 4.5h12M4 8.5h12M4 12.5h7.5M4 16.5h5"/>',
    briefcase:'<rect x="2.6" y="6" width="14.8" height="10.4" rx="2"/><path d="M7.2 6V4.6A1.1 1.1 0 0 1 8.3 3.5h3.4a1.1 1.1 0 0 1 1.1 1.1V6M2.6 10.6h14.8"/>',
    calendar: '<rect x="3" y="4.2" width="14" height="12.8" rx="2"/><path d="M3 8.2h14M7 2.8v2.8M13 2.8v2.8"/>',
    gift:     '<rect x="3" y="7.2" width="14" height="3.4" rx=".8"/><path d="M4.2 10.6v5.6a.8.8 0 0 0 .8.8h10a.8.8 0 0 0 .8-.8v-5.6M10 7.2V17M10 7.2S8.8 3.4 6.8 3.8c-1.6.3-1.3 3.4 3.2 3.4zM10 7.2s1.2-3.8 3.2-3.4c1.6.3 1.3 3.4-3.2 3.4z"/>',
    trophy:   '<path d="M6.2 3.5h7.6v4.2a3.8 3.8 0 0 1-7.6 0zM10 11.5v3M7 17h6M6.2 5H3.6c0 2.4 1 3.6 2.8 3.8M13.8 5h2.6c0 2.4-1 3.6-2.8 3.8"/>',
    ticket:   '<path d="M3 6.2A1.2 1.2 0 0 1 4.2 5h11.6A1.2 1.2 0 0 1 17 6.2v2a2 2 0 0 0 0 3.6v2A1.2 1.2 0 0 1 15.8 15H4.2A1.2 1.2 0 0 1 3 13.8v-2a2 2 0 0 0 0-3.6z"/><path d="M12 5.4v1.4M12 9.3v1.4M12 13.2v1.4"/>',
    card:     '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><circle cx="7.3" cy="9.4" r="1.7"/><path d="M4.8 13.2c.4-1.2 1.3-1.8 2.5-1.8s2.1.6 2.5 1.8M11.5 8.5h3.6M11.5 11.2h2.6"/>',
    message:  '<path d="M17 12.2a1.6 1.6 0 0 1-1.6 1.6H7l-3.4 2.8v-2.8a1.6 1.6 0 0 1-.6-1.6V5.4A1.6 1.6 0 0 1 4.6 3.8h10.8A1.6 1.6 0 0 1 17 5.4z"/>',
    user:     '<circle cx="10" cy="7" r="3.2"/><path d="M4 17c.6-3 3-4.6 6-4.6s5.4 1.6 6 4.6"/>',
    users:    '<circle cx="7.6" cy="7.4" r="2.8"/><path d="M2.6 16.4c.5-2.6 2.5-4 5-4s4.5 1.4 5 4"/><path d="M13.4 5.2a2.6 2.6 0 0 1 0 5M14.4 12.8c1.8.4 2.8 1.7 3.1 3.6"/>',
    bell:     '<path d="M10 3.2a4.6 4.6 0 0 1 4.6 4.6c0 3.4 1.2 4.4 1.6 4.8H3.8c.4-.4 1.6-1.4 1.6-4.8A4.6 4.6 0 0 1 10 3.2z"/><path d="M8.4 15.2a1.7 1.7 0 0 0 3.2 0"/>',
    lock:     '<rect x="4.2" y="8.8" width="11.6" height="8.2" rx="1.8"/><path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.4 0v2.2"/>',
    unlock:   '<rect x="4.2" y="8.8" width="11.6" height="8.2" rx="1.8"/><path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.2-1.1"/>',
    check:    '<path d="M4.5 10.4 8.2 14l7.3-8"/>',
    checkc:   '<circle cx="10" cy="10" r="7.4"/><path d="M6.8 10.2 9 12.4l4.3-4.6"/>',
    circle:   '<circle cx="10" cy="10" r="7.4"/>',
    search:   '<circle cx="8.8" cy="8.8" r="5.3"/><path d="m12.8 12.8 4 4"/>',
    heart:    '<path d="M10 16.4S3.2 12.4 3.2 7.8A3.6 3.6 0 0 1 10 6.1a3.6 3.6 0 0 1 6.8 1.7c0 4.6-6.8 8.6-6.8 8.6z"/>',
    comment:  '<path d="M16.8 9.6c0 3.4-3 6-6.8 6-.9 0-1.8-.2-2.6-.4L3.6 16.4l1.1-3A5.6 5.6 0 0 1 3.2 9.6c0-3.4 3-6 6.8-6s6.8 2.6 6.8 6z"/>',
    share:    '<path d="M10 12.4V3.2M6.6 6.4 10 3l3.4 3.4M5.4 9.2H4.6a.9.9 0 0 0-.9.9v6.2a.9.9 0 0 0 .9.9h10.8a.9.9 0 0 0 .9-.9v-6.2a.9.9 0 0 0-.9-.9h-.8"/>',
    copy:     '<rect x="6.6" y="6.6" width="10" height="10" rx="1.8"/><path d="M13.4 6.6V4.8a1.4 1.4 0 0 0-1.4-1.4H4.8a1.4 1.4 0 0 0-1.4 1.4V12a1.4 1.4 0 0 0 1.4 1.4h1.8"/>',
    qr:       '<rect x="3" y="3" width="5.4" height="5.4" rx=".8"/><rect x="11.6" y="3" width="5.4" height="5.4" rx=".8"/><rect x="3" y="11.6" width="5.4" height="5.4" rx=".8"/><path d="M11.6 11.6h2.2v2.2h-2.2zM14.8 14.8H17V17h-2.2zM14.8 11.6H17M11.6 17h1.2"/>',
    download: '<path d="M10 3.4v9.4M6.4 9.4 10 13l3.6-3.6M3.6 16.6h12.8"/>',
    external: '<path d="M11.4 3.6h5v5M16.4 3.6 9.2 10.8M14.4 11.8v3.6a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1h3.6"/>',
    arrow:    '<path d="M3.8 10h12.4M11.6 5.4 16.2 10l-4.6 4.6"/>',
    back:     '<path d="M16.2 10H3.8M8.4 5.4 3.8 10l4.6 4.6"/>',
    plus:     '<path d="M10 4v12M4 10h12"/>',
    close:    '<path d="m5 5 10 10M15 5 5 15"/>',
    menu:     '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>',
    grid:     '<rect x="3" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="3" y="11.4" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.3"/>',
    clock:    '<circle cx="10" cy="10" r="7.4"/><path d="M10 5.8V10l2.8 1.8"/>',
    pin:      '<path d="M10 17.4s5.4-5 5.4-9.2a5.4 5.4 0 0 0-10.8 0c0 4.2 5.4 9.2 5.4 9.2z"/><circle cx="10" cy="8.2" r="2"/>',
    yen:      '<path d="M6.2 3.8 10 9.2l3.8-5.4M10 9.2v7M6.8 10.6h6.4M6.8 13.2h6.4"/>',
    star:     '<path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.8L10 13.8l-4.3 2.3.9-4.8L3.1 8l4.8-.6z"/>',
    fire:     '<path d="M10 17.2c-3 0-5.2-2-5.2-4.8 0-3.4 3.2-4.6 3.4-8.6 2.2 1.2 3.4 3.2 3.4 5 .8-.4 1.3-1.2 1.4-2.2 1.4 1.2 2.2 3 2.2 5.2 0 3.2-2.2 5.4-5.2 5.4z"/>',
    logout:   '<path d="M8 16.6H4.6a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1H8M12.4 13.6 16 10l-3.6-3.6M16 10H7.6"/>',
    receipt:  '<path d="M4.6 2.8h10.8v14.4l-2.2-1.4-2 1.4-1.2-.9-1.2.9-2-1.4-2.2 1.4z"/><path d="M7.4 6.6h5.2M7.4 9.4h5.2M7.4 12.2h3"/>',
    shield:   '<path d="M10 2.8 16 5v4.6c0 3.8-2.6 6.4-6 7.6-3.4-1.2-6-3.8-6-7.6V5z"/><path d="m7.4 10 1.8 1.8 3.6-3.8"/>',
    link:     '<path d="M8.6 11.4a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-1 1M11.4 8.6a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l1-1"/>',
    book:     '<path d="M10 5.4C8.4 4.2 6 3.8 3.4 4v11.4c2.6-.2 5 .2 6.6 1.4 1.6-1.2 4-1.6 6.6-1.4V4c-2.6-.2-5 .2-6.6 1.4zM10 5.4v11.4"/>',
    pen:      '<path d="M4.2 15.8 3.4 17l1.2-.8 9.1-9.1-1.7-1.7z"/><path d="M12 4.4 13.7 2.7a1 1 0 0 1 1.4 0l.9.9a1 1 0 0 1 0 1.4L14.3 6.7z"/>',
    chat:     '<path d="M3.4 5a1.6 1.6 0 0 1 1.6-1.6h7.4A1.6 1.6 0 0 1 14 5v4.8a1.6 1.6 0 0 1-1.6 1.6H7.6l-3 2.4v-2.4A1.6 1.6 0 0 1 3.4 9.8z"/><path d="M14 7.4h1.4A1.6 1.6 0 0 1 17 9v4.4a1.6 1.6 0 0 1-1.4 1.6v2l-2.6-2h-3a1.6 1.6 0 0 1-1.6-1.6v-.6"/>',
    line:     '<path d="M10 3.6c-4 0-7 2.5-7 5.6 0 2.8 2.4 5.1 5.7 5.5l-.4 2.2c-.1.3.3.6.6.4l3.4-2.7c2.8-.8 4.7-2.9 4.7-5.4 0-3.1-3-5.6-7-5.6z"/>',
    settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8"/>',
    info:     '<circle cx="10" cy="10" r="7.4"/><path d="M10 9v4.6M10 6.4v.2"/>',
    bolt:     '<path d="M11 2.8 4.6 11h4.8l-.8 6.2L15 9h-4.8z"/>',
    target:   '<circle cx="10" cy="10" r="7.2"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".9" fill="currentColor"/>',
    chart:    '<path d="M3.6 16.4h12.8M5.6 13.4v-3M9 13.4V6.6M12.4 13.4V9M15.8 13.4V4.6"/>',
    upload:   '<path d="M10 13V3.6M6.4 7.2 10 3.6l3.6 3.6M3.6 16.4h12.8"/>',
    camera:   '<path d="M3 7a1.4 1.4 0 0 1 1.4-1.4h2l1.2-1.8h4.8l1.2 1.8h2A1.4 1.4 0 0 1 17 7v7.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 14.6z"/><circle cx="10" cy="10.6" r="3"/>',
    chevdown: '<path d="m5.5 8 4.5 4.5L14.5 8"/>',
    more:     '<circle cx="4.8" cy="10" r=".9" fill="currentColor"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="15.2" cy="10" r=".9" fill="currentColor"/>',
    eye:      '<path d="M2.6 10S5.4 4.8 10 4.8s7.4 5.2 7.4 5.2-2.8 5.2-7.4 5.2S2.6 10 2.6 10z"/><circle cx="10" cy="10" r="2.4"/>',
    eyeoff:   '<path d="M8.2 5a7.6 7.6 0 0 1 1.8-.2c4.6 0 7.4 5.2 7.4 5.2a13 13 0 0 1-2 2.6M12 14.8a6.8 6.8 0 0 1-2 .4C5.4 15.2 2.6 10 2.6 10a13 13 0 0 1 3-3.4M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4M3.4 3.4l13.2 13.2"/>',
    help:     '<circle cx="10" cy="10" r="7.4"/><path d="M7.8 7.8a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.3M10 14.4v.2"/>',
    mail:     '<rect x="2.8" y="4.6" width="14.4" height="10.8" rx="1.8"/><path d="m3.4 5.6 6.6 5.2 6.6-5.2"/>',
    alert:    '<path d="M10 3.2 17.4 16H2.6z"/><path d="M10 8.4v3.8M10 14.2v.2"/>',
    offline:  '<path d="M2.8 7.6a11 11 0 0 1 3.6-2.1M9 4.8a11 11 0 0 1 8.2 2.8M5.2 10.4a7 7 0 0 1 2.9-1.6M12.6 9a7 7 0 0 1 2.2 1.4M7.8 13a3.4 3.4 0 0 1 4.4 0M10 16v.2M3.4 3.4l13.2 13.2"/>',
    refresh:  '<path d="M16.2 10a6.2 6.2 0 1 1-1.8-4.4M16.4 3.6v3.2h-3.2"/>'
  };

  function icon(name, cls) {
    if (!ICONS[name]) return '';
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 20 20" aria-hidden="true" focusable="false" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      ICONS[name] + '</svg>';
  }
  function chevron() {
    return '<svg class="ico chev" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7.8 4.5 13 10l-5.2 5.5"/></svg>';
  }

  /* ---------- 屋号（ロゴ） ----------
     形は assets/img/logo.svg と同じ（作り直さない・色を足さない）。「大」の字を両手を広げて立つ人に見立て、頭を朱の四角で置いたもの。
     墨の部分は fill="currentColor"（.brandmark の色＝--brand-ink）、頭の四角は .brandmark__seal（--brand-seal＝朱）。
     大きさは CSS の --brand-h（ロゴの高さ）で決める（tokens.css・app.css・admin.css）。濃い面では .brandmark--deep か .is-deep の中で --on-deep に */
  var LOGO = {
    mark: 'M 2.21 29.33 L 101.05 29.33 L 101.05 43.25 L 58.92 43.25 C 65.32 62.49 78.57 73.22 96.41 82.18 C 98.68 83.29 100.96 84.38 103.25 85.45 L 96.29 100 C 75.8 89.07 64.27 79.49 51.63 60.08 C 38.99 79.49 27.45 89.07 6.96 100 L 0 85.45 C 2.29 84.38 4.57 83.29 6.84 82.18 C 24.69 73.22 37.93 62.49 44.34 43.25 L 2.21 43.25 Z',
    word: 'M 124.42 25.58 L 162.44 25.58 L 162.44 35.2 L 148.46 35.2 L 148.46 75.92 L 138.4 75.92 L 138.4 35.2 L 124.42 35.2 Z M 176.93 25.58 L 188.73 25.58 L 207.61 75.92 L 197.1 75.92 L 193.33 65.85 L 172.34 65.85 L 168.56 75.92 L 158.06 75.92 Z M 182.83 37.86 L 189.96 56.87 L 175.7 56.87 Z M 214.28 25.58 H 224.35 V 75.92 H 214.28 Z M 250.7 24.97 C 257.75 24.37 263.67 27.42 268.1 32.72 C 265.81 34.78 263.49 36.8 261.14 38.79 C 257.73 35 250.81 32.07 246.36 35.51 C 238.02 42.19 257.42 47.11 261.38 48.97 C 271.58 53.76 273.69 64.81 265.44 72.68 C 261.31 76.61 253.59 77 247.87 76.41 C 247.4 76.32 246.92 76.22 246.45 76.11 C 239.96 74.62 236.02 71.78 232.46 66.15 C 235.15 64.03 237.86 61.93 240.6 59.86 C 243.18 64.64 248.21 67.73 253.82 67.43 C 255.93 67.33 258.39 66.48 259.76 64.79 C 263.82 59.78 254.91 56.52 251.32 55.26 C 242.68 52.24 233.67 49.09 234.51 38.05 C 235.18 29.24 242.54 25.8 250.7 24.97 Z M 278.11 25.58 L 309.47 25.58 L 309.47 35.2 L 288.18 35.2 L 288.18 46.26 L 305.88 46.26 L 305.88 55.88 L 288.18 55.88 L 288.18 66.3 L 309.98 66.3 L 309.98 75.92 L 278.11 75.92 Z M 319.05 25.58 H 329.12 V 75.92 H 319.05 Z',
    head: 'M 42.25 0 H 61 V 18.76 H 42.25 Z'
  };
  function logoSvg(kind, a11y) {
    var seal = '<path class="brandmark__seal" fill="#c63f25" d="' + LOGO.head + '"/>';
    var mark = '<path fill="currentColor" d="' + LOGO.mark + '"/>';
    var word = '<path fill="currentColor" fill-rule="evenodd" d="' + LOGO.word + '"/>';
    var vb = { mark: '0 0 103.25 100', stack: '0 0 149.72 156.11', row: '0 0 329.12 100' }[kind];
    var body = kind === 'mark' ? mark + seal
      : kind === 'stack' ? '<g transform="translate(23.23 0)">' + mark + seal + '</g><g transform="translate(-91 99.79) scale(0.7314)">' + word + '</g>'
      : mark + word + seal;
    return '<svg class="brandmark__logo" viewBox="' + vb + '" focusable="false"' + a11y + '>' + body + '</svg>';
  }
  /** 屋号。brandmark(SITE, sub?, opts?)
      sub：ロゴの右に添える文字（'会員ページ' '運営'。空なら出さない）。
      opts.mark：「大」の印だけ（タブレットの記号の帯など狭い所）。opts.stack：印の下に TAISEI（ログインの画面）。
      opts.decorative：ロゴを読み上げない（包むリンクに aria-label があるとき。二度読まれないように）。
      opts.cls：足す class（'brandmark--deep' で濃い面の色）。
      ロゴは role="img" aria-label="TAISEI"（SITE.name）。sub は文字のまま読む */
  function brandmark(site, sub, opts) {
    opts = opts || {};
    var kind = opts.mark ? 'mark' : opts.stack ? 'stack' : 'row';
    var a11y = opts.decorative ? ' aria-hidden="true"' : ' role="img" aria-label="' + esc(site && site.name || '') + '"';
    return '<span class="brandmark brandmark--' + kind + (opts.cls ? ' ' + esc(opts.cls) : '') + '">' + logoSvg(kind, a11y) +
      (sub ? '<span class="brandmark__sub">' + esc(sub) + '</span>' : '') + '</span>';
  }

  CLG.ui = {
    esc: esc, nl2br: nl2br, jp: jp, $: $, $$: $$,
    yen: yen, num: num, fmtDate: fmtDate, fmtShort: fmtShort, relTime: relTime, pad: pad,
    toast: toast, modal: modal, confirmBox: confirmBox, closePops: closePops, copyText: copyText, download: download,
    smoothScroll: smoothScroll, focusables: focusables,
    initials: initials, avatar: avatar, personLink: personLink, progressBar: progressBar, lvBadge: lvBadge, empty: empty,
    statusTag: statusTag, STATUS: STATUS, notFound: notFound, resumeCard: resumeCard, skeleton: skeleton, fieldErrors: fieldErrors,
    icon: icon, chevron: chevron, brandmark: brandmark, ICONS: ICONS
  };
})(window);
