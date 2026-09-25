/* ============================================================
   ヘルプ（#/help・#/help?cat=<種類>・#/help?focus=<ヘルプid>）
   ------------------------------------------------------------
   DATA.HELP を種類（DATA.HELP_CATS）ごとに、開け閉めできる質問として並べる。
   - 種類の札：?cat= で切り替える（URL で渡せるように。同じ画面の描き直しになる）
   - 絞り込みの欄：打つたびにこの画面の中だけで隠す（描き直すと変換中の文字が消えるため、DOM で隠す）。
     答えの中だけで当たった質問は開いて見せる
   - ?focus=h17：その質問を開いて、そこへ動いて焦点を置く（探す・お知らせから来る）。?focus=rules はコミュニティのルール
   - 答えのあとの「◯◯を見る」は、この画面で持つ行き先（GO）。data.js に link があればそちらを使う
   - 契約が終わった人など、開けない画面へのボタンは出さない（R.planGate）
   規約・プライバシー・特商法・お問い合わせは公開サイト（index.html#/…）を開く。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var filterText = '';        // 絞り込みの文字（描き直しても残す。URL には入れない）
  var lastHash = null;        // ?focus= で動くのは来たときだけ（描き直しのたびに動かさない）
  var sayTimer = null;
  var opened = {};            // 開いている質問（運営画面の書き換えなどで描き直されても閉じないように）
  var ASK = '#/messages?kind=' + encodeURIComponent('質問');

  /* 答えのあとの行き先。質問の id → [行き先, ボタンの文字] */
  var GO = {
    h1: ['#/card', '会員証を見る'],
    h2: ['#/account?focus=password', 'パスワードを変える'],
    h3: ['#/start', 'スタートガイドを見る'],
    h4: [ASK, '運営に聞く'],
    h5: ['#/account?focus=notify', '通知の設定を開く'],
    h6: ['#/messages', '相談・メッセージを開く'],
    h7: ['#/account?focus=card', 'カードを見る'],
    h8: ['#/account?focus=plan', '契約を見る'],
    h9: ['#/account?focus=invoices', '領収書を見る'],
    h10: ['#/account?focus=card', 'カードを更新する'],
    h11: ['#/perks?tab=experts', '専門家を見る'],
    h12: ['#/account/cancel', '解約の手続きへ'],
    h13: ['#/account?focus=plan', '契約を見る'],
    h16: ['#/account?focus=bank', '振込先を見る'],
    h17: ['#/lesson/money-tax/mt-1', '第1回を見る'],
    h18: ['#/gigs', '案件を見る'],
    h19: ['#/messages?kind=' + encodeURIComponent('相談したい'), '運営に相談する'],
    h20: ['#/referral', '紹介を見る'],
    h21: ['#/referral', '紹介を見る'],
    h22: ['#/account?focus=bank', '振込先を見る']
  };
  var DOCS = [
    ['index.html#/terms', '利用規約', 'doc'],
    ['index.html#/privacy', 'プライバシーポリシー', 'doc'],
    ['index.html#/tokushoho', '特定商取引法に基づく表記', 'doc'],
    ['index.html#/contact', 'お問い合わせ', 'contact']
  ];

  /* ---------- 文字のそろえ方（domain.js の normText と同じ。1文字を1文字に直す） ---------- */
  function nchar(c) {
    var x = c;
    if (x.normalize) { var y = x.normalize('NFKC'); if (y.length === 1) x = y; }
    var lo = x.toLowerCase(); if (lo.length === 1) x = lo;
    var code = x.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) x = String.fromCharCode(code - 0x60);
    return x;
  }
  function norm(t) { t = String(t == null ? '' : t); var o = ''; for (var i = 0; i < t.length; i++) o += nchar(t.charAt(i)); return o; }
  function termsOf(q) {
    var raw = String(q || '').trim();
    if (raw.normalize) raw = raw.normalize('NFKC');
    return norm(raw).split(/\s+/).filter(Boolean);
  }
  function has(text, terms) { var n = norm(text); return terms.every(function (t) { return n.indexOf(t) >= 0; }); }
  /** 当たった言葉を <mark> で包む（中の文字は U.jp。esc と同じく安全） */
  function hl(text, terms) {
    text = String(text == null ? '' : text);
    if (!text || !terms.length) return U.jp(text);
    var n = norm(text), hits = [];
    terms.forEach(function (t) {
      for (var i = 0, k; (k = n.indexOf(t, i)) >= 0; i = k + t.length) hits.push([k, k + t.length]);
    });
    if (!hits.length) return U.jp(text);
    hits.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    hits.forEach(function (x) {
      var last = merged[merged.length - 1];
      if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]); else merged.push([x[0], x[1]]);
    });
    var out = '', pos = 0;
    merged.forEach(function (x) { out += U.jp(text.slice(pos, x[0])) + '<mark>' + U.jp(text.slice(x[0], x[1])) + '</mark>'; pos = x[1]; });
    return out + U.jp(text.slice(pos));
  }

  /* ---------- データ ---------- */
  function items() { return DATA.HELP || []; }
  function cats() { return (DATA.HELP_CATS || []).filter(function (c) { return items().some(function (h) { return h.cat === c; }); }); }
  function byId(id) { var l = items(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function hitOf(h, terms) { return !terms.length || has(h.q + ' ' + h.a + ' ' + h.cat, terms); }
  /* 会員期間が終わった人のアカウントには「通知」がなく、解約の手続きももう要らない */
  var ENDED_HIDE = { '#/account?focus=notify': 1, '#/account/cancel': 1 };
  /** その行き先を今の契約で開けるか（終わった人に、止めた画面へのボタンを出さない） */
  function canOpen(href) {
    if (!/^#\//.test(href) || !R.planGate) return true;
    var name = href.slice(2).split(/[/?]/)[0];
    try {
      if (R.planGate(name).ok === false) return false;
      return !(ENDED_HIDE[href] && R.plan().status === 'ended');
    } catch (e) { return true; }
  }
  function coarse() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  /** スマホでは種類の札が横に流れる。描き直すと先頭に戻るので、選んでいる札が隠れていたら見える位置まで送る */
  function chipInView(strip) {
    var on = strip && strip.querySelector('[aria-pressed="true"]');
    if (!on || strip.scrollWidth <= strip.clientWidth) return;
    var r = on.getBoundingClientRect(), p = strip.getBoundingClientRect();
    if (r.left < p.left || r.right > p.right - 24) strip.scrollLeft += r.left - p.left - 16;
  }
  function goOf(h) {
    var g = h.link && h.link.href ? [h.link.href, h.link.label || '見る'] : GO[h.id];
    return g && canOpen(g[0]) ? g : null;
  }
  /** 受付時間は「平日10:00〜18:00」のまとまりで折らない */
  function hours() { return '<span class="nw">' + esc(DATA.SITE.contactHours || '') + '</span>'; }
  function ymd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /* ---------- まとまり ---------- */
  function qa(h, terms) {
    var g = goOf(h);
    return '<details class="hp-q" id="help-' + esc(h.id) + '" data-hp-id="' + esc(h.id) + '"' + (opened[h.id] ? ' open' : '') + '>' +
      '<summary class="hp-q__sum" data-hp-q="' + esc(h.id) + '"><span class="hp-q__txt">' + hl(h.q, terms) + '</span>' + icon('chevdown', 'hp-q__caret') + '</summary>' +
      '<div class="hp-q__a"><p class="hp-q__text">' + hl(h.a, terms) + '</p>' +
        (g ? '<a class="btn btn-soft btn-s hp-q__go" href="' + esc(g[0]) + '">' + esc(g[1]) + '</a>' : '') +
      '</div>' +
    '</details>';
  }
  function catChips(sel, terms) {
    var list = items(), all = list.filter(function (h) { return hitOf(h, terms); }).length;
    function chip(key, label, n) {
      return '<button type="button" class="chip" data-hp-cat="' + esc(key) + '" aria-pressed="' + (sel === key) + '">' + esc(label) +
        '<span class="n num" data-hp-n="' + esc(key) + '">' + U.num(n) + '</span></button>';
    }
    return '<div class="chips hp-chips" role="group" aria-label="種類で絞る">' + chip('', 'すべて', all) +
      cats().map(function (c) {
        return chip(c, c, list.filter(function (h) { return h.cat === c && hitOf(h, terms); }).length);
      }).join('') + '</div>';
  }
  function askBlock() {
    var SITE = DATA.SITE, msg = canOpen('#/messages');
    return '<section class="sec hp-ask" aria-labelledby="hpAsk">' +
      '<div class="card card-pad hp-ask__card">' +
        '<div class="hp-ask__txt"><h2 class="h3" id="hpAsk">運営への質問</h2>' +
          // 2つの文は行を分ける（「受付は」だけが行の終わりに残らないように）
          '<p class="sub">' + U.jp(msg ? SITE.replySla + '。' : '会員期間が終わったあとは、公開サイトのお問い合わせで受け付けます。') +
            '<br>受付は' + hours() + 'です。</p></div>' +
        (msg ? '<a class="btn btn-ink" href="' + esc(ASK) + '">' + icon('message', 'ico-s') + '運営に聞く</a>'
          : '<a class="btn btn-ink" href="index.html#/contact">' + icon('mail', 'ico-s') + 'お問い合わせ</a>') +
      '</div></section>';
  }
  function docsBlock() {
    var SITE = DATA.SITE, rev = ymd(SITE.docsDate && (SITE.docsDate.revised || SITE.docsDate.made));
    var revTxt = rev ? U.fmtDate(rev, { wd: false }) + (SITE.docsDate.revised ? ' 改定' : ' 制定') : '';
    var rules = DATA.RULES || [];
    return '<section class="sec hp-docs" aria-labelledby="hpDocs"><h2 class="sec-ttl" id="hpDocs">規約と表記</h2>' +
      '<div class="list">' +
        (rules.length ? '<details class="hp-q hp-rules" id="help-rules"' + (opened.rules ? ' open' : '') + '>' +
          '<summary class="hp-q__sum" data-hp-q="rules"><span class="hp-q__txt">' + esc(DATA.RULES_TITLE || 'コミュニティのルール') + '</span>' + icon('chevdown', 'hp-q__caret') + '</summary>' +
          '<div class="hp-q__a"><ol class="hp-rules__list">' + rules.map(function (r) { return '<li>' + U.jp(r) + '</li>'; }).join('') + '</ol></div>' +
        '</details>' : '') +
        DOCS.map(function (d) {
          var sub = d[2] === 'doc' ? U.jp(revTxt) : 'フォーム・受付 ' + hours();
          return '<a class="li hp-doc" href="' + esc(d[0]) + '" data-hp-doc="' + esc(d[0].split('#/')[1] || '') + '">' +
            '<span class="li__body"><span class="li__ttl">' + esc(d[1]) + '</span>' + (sub ? '<span class="li__sub">' + sub + '</span>' : '') + '</span>' +
            U.chevron() + '</a>';
        }).join('') +
      '</div></section>';
  }

  CLG.screens.help = {
    title: function (ctx) { return ctx.params[0] ? 'ページが見つかりません' : 'ヘルプ'; },
    back: function (ctx) { return ctx.params[0] ? { href: '#/help', label: 'ヘルプ' } : null; },
    render: function (ctx) {
      if (ctx.params[0]) return U.notFound({ lead: 'このヘルプのページはありません。' });
      var q = ctx.query || {}, focus = q.focus && byId(q.focus);
      // ?focus= で来たときは、その質問が隠れないように種類と絞り込みを外す
      var sel = !focus && cats().indexOf(q.cat) >= 0 ? q.cat : '';
      var terms = termsOf(focus ? '' : filterText);
      var shown = cats().filter(function (c) { return !sel || c === sel; });
      var total = items().length;
      return '<div class="scr-help">' +
        '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">ヘルプ</h1>' +
          '<p class="page-lead">よくある質問 <span class="num">' + U.num(total) + '</span>件</p></div>' +
        '<div class="hp-tools">' +
          '<div class="hp-filter"><label class="sr-only" for="hpQ">質問を絞り込む</label>' + icon('search') +
            '<input class="input" id="hpQ" type="search" enterkeyhint="search" autocomplete="off" maxlength="60" placeholder="絞り込む（例：領収書）" value="' + esc(focus ? '' : filterText) + '" aria-describedby="hpCount">' +
          '</div>' +
          catChips(sel, terms) +
        '</div>' +
        '<p class="hp-count" id="hpCount" aria-live="off"' + (terms.length ? '' : ' hidden') + '></p>' +
        shown.map(function (c, i) {
          var list = items().filter(function (h) { return h.cat === c; });
          return '<section class="sec hp-sec" data-hp-sec="' + esc(c) + '" aria-labelledby="hpCat' + i + '">' +
            '<h2 class="sec-ttl" id="hpCat' + i + '">' + esc(c) + '</h2>' +
            '<div class="list">' + list.map(function (h) { return qa(h, terms); }).join('') + '</div></section>';
        }).join('') +
        '<div class="card hp-none" id="hpNone" hidden></div>' +
        askBlock() +
        docsBlock() +
      '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      var h = window.location.hash, arrived = h !== lastHash;
      lastHash = h;
      var f = ctx.query.focus && byId(ctx.query.focus);
      var fid = f ? f.id : ctx.query.focus === 'rules' && DATA.RULES && DATA.RULES.length ? 'rules' : '';
      if (f) filterText = '';
      apply(root, false);
      chipInView(root.querySelector('.scr-help .hp-chips'));
      if (arrived && fid) {
        var el = document.getElementById('help-' + fid);
        if (el) {
          el.open = true; opened[fid] = true;
          el.classList.add('is-target');
          setTimeout(function () { el.classList.remove('is-target'); }, 2400);
          var sum = el.querySelector('summary');
          setTimeout(function () { U.smoothScroll(sum || el, { block: 'center', focus: true }); }, 0);
        }
      }

      if (root.__boundHelp) return;
      root.__boundHelp = true;
      window.addEventListener('hashchange', function () {
        if (!/^#\/help(?:[?/]|$)/.test(window.location.hash)) lastHash = null;
      });
      // 開け閉めを覚える（toggle は泡立たないので、捕まえる側で拾う）。絞り込みで開いたものは覚えない
      root.addEventListener('toggle', function (e) {
        var d = e.target;
        if (!d || !d.matches || !d.matches('.scr-help details.hp-q')) return;
        var id = d.getAttribute('data-hp-id') || (d.id === 'help-rules' ? 'rules' : '');
        if (!id) return;
        if (d.hasAttribute('data-hp-auto')) {
          // 絞り込みで開いたものを本人が閉じた：次の1文字でまた開かないように印を替える（apply は閉じる前に印を外すので、ここに来るのは本人の操作だけ）
          if (!d.open) { d.removeAttribute('data-hp-auto'); d.setAttribute('data-hp-shut', ''); }
          return;
        }
        if (d.open) opened[id] = true; else delete opened[id];
      }, true);
      root.addEventListener('input', function (e) {
        var inp = e.target.closest('.scr-help #hpQ');
        if (!inp) return;
        filterText = inp.value;
        var n = apply(root, true);
        clearTimeout(sayTimer);
        // 打ち終わるのを待ってから数を読む（1文字ごとに読まない）
        sayTimer = setTimeout(function () {
          if (!termsOf(filterText).length) return;
          cur.announce(n ? n + '件' : '当てはまる質問はありません');
        }, 700);
      });
      // 指で使う端末で「検索」キーを押したら、キーボードを閉じて結果を見せる（件数の行へ焦点を移す）。変換の確定では動かない
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        if (!e.target.closest('.scr-help #hpQ')) return;
        e.preventDefault();
        var to = coarse() && root.querySelector('.scr-help #hpCount:not([hidden])');
        if (!to) return;
        to.setAttribute('tabindex', '-1');
        try { to.focus({ preventScroll: true }); } catch (x) { to.focus(); }
      });
      root.addEventListener('click', function (e) {
        var c = e.target.closest('.scr-help [data-hp-cat]');
        if (c) {
          if (c.getAttribute('aria-pressed') === 'true') return;
          var k = c.getAttribute('data-hp-cat');
          cur.go('#/help' + (k ? '?cat=' + encodeURIComponent(k) : ''));
          return;
        }
        if (e.target.closest('.scr-help [data-hp-clear]')) {
          filterText = '';
          var inp = root.querySelector('#hpQ');
          if (inp) { inp.value = ''; inp.focus(); }
          apply(root, true);
        }
      });
    }
  };

  /** 絞り込みを当てる。見えている質問の数を返す。
      描き直しのたびにも呼ぶ（render は絞り込みの文字を知っているが、札の数・空のときの案内はここで合わせる） */
  function apply(root, typed) {
    var scr = root.querySelector('.scr-help');
    if (!scr) return 0;
    var terms = termsOf(filterText), shown = 0;
    U.$$('.hp-sec .hp-q[data-hp-id]', scr).forEach(function (el) {
      var h = byId(el.getAttribute('data-hp-id'));
      if (!h) return;
      var hit = hitOf(h, terms);
      el.hidden = !hit;
      if (hit) shown++;
      if (typed) {
        el.querySelector('.hp-q__txt').innerHTML = hl(h.q, terms);
        el.querySelector('.hp-q__text').innerHTML = hl(h.a, terms);
      }
      // 答えの中だけで当たったものは開いて見せる。絞り込みをやめたら、開いたものだけ閉じる
      if (terms.length && hit && !has(h.q, terms)) {
        if (!el.open && !el.hasAttribute('data-hp-shut')) { el.open = true; el.setAttribute('data-hp-auto', ''); }
      } else if (el.hasAttribute('data-hp-auto')) {
        el.removeAttribute('data-hp-auto'); el.open = false;
      }
      if (!terms.length) el.removeAttribute('data-hp-shut');
    });
    U.$$('.hp-sec', scr).forEach(function (s) { s.hidden = !s.querySelector('.hp-q:not([hidden])'); });
    // 札の数（どの種類に何件あるか）
    var list = items();
    U.$$('[data-hp-n]', scr).forEach(function (n) {
      var k = n.getAttribute('data-hp-n');
      n.textContent = U.num(list.filter(function (h) { return (!k || h.cat === k) && hitOf(h, terms); }).length);
    });
    var cnt = scr.querySelector('#hpCount');
    if (cnt) {
      cnt.hidden = !terms.length;
      cnt.innerHTML = terms.length ? '「' + esc(filterText.trim()) + '」<b class="num">' + U.num(shown) + '</b>件' : '';
    }
    var none = scr.querySelector('#hpNone');
    if (none) {
      // 種類は知っている名前のときだけ使う（URL の文字を画面に出さない）
      var sel = cur && cur.query && !cur.query.focus && cats().indexOf(cur.query.cat) >= 0 ? cur.query.cat : '';
      var elsewhere = sel ? list.filter(function (h) { return h.cat !== sel && hitOf(h, terms); }).length : 0;
      none.hidden = !(terms.length && !shown);
      none.innerHTML = none.hidden ? '' :
        U.empty('help', sel ? '「' + sel + '」には当てはまる質問がありません' : '当てはまる質問はありません',
          '<div class="row hp-none__acts">' +
            (elsewhere ? '<button type="button" class="btn btn-soft btn-s" data-hp-cat="">すべての種類で見る（' + U.num(elsewhere) + '件）</button>' : '') +
            (canOpen('#/search') ? '<a class="btn btn-soft btn-s" href="#/search?q=' + encodeURIComponent(filterText.trim()) + '">会員ページ全体で探す</a>' : '') +
            '<button type="button" class="btn btn-text btn-s" data-hp-clear>絞り込みをやめる</button>' +
          '</div>');
    }
    return shown;
  }
})();
