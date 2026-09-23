/* ============================================================
   タイムライン（#/feed）
   ------------------------------------------------------------
   運営・講師・仲間の新しい動きが流れる場所。打ち合わせの
   「X や Instagram のように、新しい情報がどんどん流れる」に当たる。
   - 絞り込みは URL の ?kind= で持つ（戻るボタンで戻れるように）
   - #/feed?intro=1 で開くと、自己紹介のひな形が入った状態で始まる
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var KINDS = {
    news:  { label: 'お知らせ', tag: 'tag-indigo' },
    'new': { label: '新着講座', tag: 'tag-accent', link: '講座を見る' },
    gig:   { label: '案件',     tag: 'tag-warn',   link: '案件を見る' },
    event: { label: 'イベント', tag: 'tag-indigo', link: 'イベントを見る' },
    win:   { label: '成果',     tag: 'tag-gold' },
    intro: { label: '自己紹介', tag: 'tag-ok' },
    post:  { label: 'つぶやき', tag: '' }
  };
  var FILTERS = [
    ['all', 'すべて'], ['news', 'お知らせ'], ['new', '新着講座'], ['gig', '案件'],
    ['event', 'イベント'], ['win', '成果'], ['post', 'みんなの投稿']
  ];
  var EMPTY = {
    all:   ['feed', 'まだ投稿はありません。最初のひとことをどうぞ。'],
    news:  ['bell', 'いまはお知らせがありません。'],
    'new': ['play', '新しい講座の知らせは、まだありません。'],
    gig:   ['briefcase', '新着の案件は、まだありません。'],
    event: ['calendar', 'イベントの知らせは、まだありません。'],
    win:   ['star', 'まだ成果の報告はありません。小さなことでも、ぜひ。'],
    post:  ['chat', 'まだ投稿はありません。']
  };
  var PLACEHOLDER = {
    post: '今日やったこと、聞きたいこと、なんでも',
    win: 'できたこと、うれしかったこと（例：講座を1本見終えた、はじめて応募した）',
    intro: '住んでいるところ、いまのお仕事、ここでやりたいこと'
  };
  /* 成果の報告は金額の話になりやすい。収入を言い切る投稿が並ばないよう、書き方をそっと示す */
  var HINT = {
    post: '',
    win: '金額よりも「やったこと・できたこと」を書くと、仲間の参考になります。',
    intro: '空いているところを埋めて、そのまま投稿できます。'
  };
  var DAILY_XP = 3;   // domain.js の addPost と同じ「1日3回まで」

  /* 書きかけの投稿。いいねや絞り込みで描き直しても消えないよう、画面の外に持つ */
  var draft = { text: '', kind: 'post' };
  var draftOwner = null;       // 試作版は会員を切り替えられる。別の人の書きかけを持ち越さない
  var focusComposer = false;   // ひな形を入れた直後だけ、入力欄に移る
  var lastPosted = null;       // 投稿した直後の1件を、ひと呼吸だけ目立たせる
  var popLike = null;          // いいねした直後のハートだけ弾ませる
  var refocus = null;          // 描き直すと押したボタンが消えるので、キーボードの位置をここで引き継ぐ [属性, 値]

  function filterOf(q) {
    var k = q && q.kind;
    return EMPTY[k] ? k : 'all';
  }
  function introStep() { return R.steps().filter(function (s) { return s.id === 'intro'; })[0] || null; }
  function postsToday(state) {
    var today = CLG.now().toDateString();
    return state.posts.filter(function (p) { return new Date(p.at).toDateString() === today; }).length;
  }
  function xpNote(state) {
    var left = Math.max(0, DAILY_XP - postsToday(state));
    if (!left) return '今日のXPは上限に達しました（投稿はいつでもできます）';
    return '+' + DATA.XP.post + ' XP（1日' + DAILY_XP + '回まで' + (left < DAILY_XP ? '・今日はあと' + left + '回' : '') + '）';
  }
  /* 自己紹介のすすめは、書く欄にひな形が入っているあいだは隠す（同じことを2か所で言わない） */
  function showIntroCard() { return !(draft.kind === 'intro' && draft.text.trim()); }
  /* ひな形の「〜：」のあとが空のままの行（カーソルを置く先・投稿前の確認に使う） */
  var BLANK = /：[ \t\u3000]*(\n|$)/;
  function blankLabel(text) {
    var m = /^(.+?)：[ \t\u3000]*$/m.exec(text);
    return m ? m[1].trim() : '';
  }

  /* ---------- 部品 ---------- */
  function introCard(step) {
    return '<div class="card intro-cta">' +
      '<span class="intro-cta__ico">' + icon('pen') + '</span>' +
      '<div class="intro-cta__body">' +
        '<p class="intro-cta__ttl">自己紹介を書いてみましょう（1分）</p>' +
        '<p class="sub">ひな形に沿って書くだけです。スタートガイドの項目にもなっています（+' + esc(step.xp) + ' XP）。</p>' +
      '</div>' +
      '<button type="button" class="btn btn-ink btn-s" data-feed-intro>ひな形で書く</button>' +
    '</div>';
  }

  function composer(me, state, introOpen) {
    var k = draft.kind;
    var opts = [['post', 'つぶやき'], ['win', '成果報告']];
    if (introOpen || k === 'intro') opts.push(['intro', '自己紹介']);
    return '<form class="card composer" data-feed-form novalidate>' +
      '<div class="composer__row">' + U.avatar({ name: me.name, color: me.color }) +
        '<div class="composer__main">' +
          '<label class="sr-only" for="feedText">投稿の本文</label>' +
          '<textarea id="feedText" class="textarea composer__ta" rows="3" maxlength="1000" placeholder="' +
            esc(PLACEHOLDER[k] || PLACEHOLDER.post) + '">' + esc(draft.text) + '</textarea>' +
          '<p class="composer__hint xsmall"' + (HINT[k] ? '' : ' hidden') + '>' + esc(HINT[k] || '') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="composer__foot">' +
        '<div class="seg composer__seg" role="group" aria-label="投稿の種類">' + opts.map(function (o) {
          var on = o[0] === k;
          return '<button type="button" data-feed-kind="' + o[0] + '" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '">' + esc(o[1]) + '</button>';
        }).join('') + '</div>' +
        '<div class="composer__act">' +
          '<span class="composer__xp xsmall">' + esc(xpNote(state)) + '</span>' +
          '<button type="submit" class="btn btn-primary composer__send"' + (draft.text.trim() ? '' : ' disabled') + '>投稿する</button>' +
        '</div>' +
      '</div>' +
    '</form>';
  }

  function chips(cur) {
    return '<div class="chips feed-chips" role="group" aria-label="絞り込み">' + FILTERS.map(function (f) {
      var on = f[0] === cur;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-feed-filter="' + f[0] + '" aria-pressed="' + on + '">' + esc(f[1]) + '</button>';
    }).join('') + '</div>';
  }

  function postCard(p, now) {
    var who = R.person(p.by);
    var k = KINDS[p.kind] || KINDS.post;
    var meta = who.me ? 'あなた' + (who.area ? '・' + who.area : '') : who.staff ? (who.role || '運営') : (who.area || '');
    var age = now - new Date(p.at);
    var isNew = age >= 0 && age < 86400000;
    // 外へ飛ぶリンクは作らない（会員ページの中の画面だけ）
    var link = p.link && /^#\//.test(p.link) ? p.link : '';
    return '<article class="card post' + (p.id === lastPosted ? ' is-fresh' : '') + '">' +
      '<header class="post__head">' + U.avatar(who) +
        '<div class="post__who">' +
          '<p class="post__name">' + esc(who.name) + '</p>' +
          '<p class="post__meta">' +
            (meta ? '<span class="post__role">' + esc(meta) + '</span><span aria-hidden="true">·</span>' : '') +
            '<time datetime="' + esc(p.at) + '">' + esc(U.relTime(p.at)) + '</time>' +
            (isNew ? '<span class="post__new">NEW</span>' : '') +
          '</p>' +
        '</div>' +
        '<div class="post__tags">' +
          (p.pinned ? '<span class="tag tag-line">' + icon('pin', 'ico-s') + '固定</span>' : '') +
          '<span class="tag' + (k.tag ? ' ' + k.tag : '') + '">' + esc(k.label) + '</span>' +
        '</div>' +
      '</header>' +
      '<div class="post__text">' + U.nl2br(p.text) + '</div>' +
      (link ? '<a class="btn btn-soft btn-s post__link" href="' + esc(link) + '">' + esc(k.link || '詳しく見る') + icon('arrow', 'ico-s') + '</a>' : '') +
      '<footer class="post__foot">' +
        '<button type="button" class="post__like' + (p.liked ? ' is-on' : '') + (p.id === popLike ? ' is-pop' : '') + '" data-feed-like="' + esc(p.id) + '"' +
          ' aria-pressed="' + (p.liked ? 'true' : 'false') + '" aria-label="いいね（' + U.num(p.likeCount) + '件）">' +
          icon('heart') + '<span class="num">' + U.num(p.likeCount) + '</span></button>' +
        (p.comments ? '<span class="post__cmt">' + icon('comment', 'ico-s') + 'コメント ' + U.num(p.comments) + '件</span>' : '') +
      '</footer>' +
    '</article>';
  }

  /** 横の列（広い画面では右、せまい画面では下）。ほかの画面への入口と、場の約束 */
  function side() {
    var mine = R.ranking('points').filter(function (r) { return r.me; })[0];
    var ev = R.upcoming().slice(0, 2);
    return '<aside class="feed-side" aria-label="あわせて見る">' +
      '<div class="list">' +
        '<a class="li has-ico" href="#/ranking"><span class="li__ico">' + icon('trophy') + '</span>' +
          '<span class="li__body"><span class="li__ttl">ランキング</span>' +
          // 0pt で「13位」と出すと、入ったばかりの人には下から数えた順位に見えてしまう
          '<span class="li__sub">' + (mine && mine.value ? '今月 ' + mine.rank + '位・' + U.num(mine.value) + 'pt' : '貢献ポイントと学びの順位') + '</span></span>' + U.chevron() + '</a>' +
      '</div>' +
      (ev.length ?
        '<p class="sec-ttl feed-side__ttl">近いイベント<a href="#/events">すべて見る</a></p>' +
        '<div class="list">' + ev.map(function (e) {
          return '<a class="li has-ico" href="#/events/' + esc(encodeURIComponent(e.id)) + '"><span class="li__ico">' + icon('calendar') + '</span>' +
            '<span class="li__body"><span class="li__ttl">' + esc(e.title) + '</span>' +
            '<span class="li__sub">' + esc(U.fmtShort(e.at, true)) + (R.isReserved(e.id) ? '<span class="tag tag-ok feed-side__tag">予約済み</span>' : '') + '</span></span>' +
            U.chevron() + '</a>';
        }).join('') + '</div>' : '') +
      '<div class="card-flat feed-rules">' +
        '<p class="feed-rules__ttl">' + icon('shield', 'ico-s') + 'この場所のルール</p>' +
        '<ul>' + DATA.RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
    '</aside>';
  }

  /* ---------- 入力欄の見た目を、描き直さずに合わせる（打っている途中で入力欄が消えないように） ---------- */
  function autosize(ta) {
    ta.style.height = 'auto';
    var h = Math.min(ta.scrollHeight + 2, 360);
    ta.style.height = h + 'px';
    ta.style.overflowY = ta.scrollHeight + 2 > 360 ? 'auto' : 'hidden';
  }
  function syncComposer(form) {
    var ta = form.querySelector('textarea'), k = draft.kind;
    U.$$('[data-feed-kind]', form).forEach(function (b) {
      var on = b.getAttribute('data-feed-kind') === k;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ta.placeholder = PLACEHOLDER[k] || PLACEHOLDER.post;
    var hint = form.querySelector('.composer__hint');
    hint.textContent = HINT[k] || '';
    hint.hidden = !HINT[k];
    form.querySelector('.composer__send').disabled = !ta.value.trim();
    autosize(ta);
  }
  /** ひな形の最初の空欄（「：」で終わる行）にカーソルを置く */
  function caretToBlank(ta) {
    var m = BLANK.exec(ta.value);
    var pos = m ? m.index + 1 : ta.value.length;
    try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
  }

  CLG.screens.feed = {
    title: 'タイムライン',

    render: function (ctx) {
      var q = ctx.query || {};
      var me = R.me(), step = introStep(), introOpen = !!(step && !step.done);
      if (draftOwner !== me.id) { draft = { text: '', kind: 'post' }; draftOwner = me.id; }
      // #/feed?intro=1（スタートガイドなどから）→ 書きかけがなければ、ひな形を入れておく。
      // 書きかけがあるときは消さずに書く欄へ送る（すすめのカードから、確かめてから置きかえられる）
      if (q.intro === '1') {
        if (!draft.text.trim()) draft = { text: R.introText(), kind: 'intro' };
        focusComposer = true;
      }
      var cur = filterOf(q);
      var list = R.feed(cur);
      var now = CLG.now();
      var empty = EMPTY[cur];

      return '<div class="scr-feed">' +
        '<div class="page-head"><h1 class="page-ttl">タイムライン</h1>' +
          '<p class="page-lead">運営・講師・仲間の、新しい動き。</p></div>' +
        '<div class="feed-layout">' +
          '<div class="feed-main">' +
            (introOpen && showIntroCard() ? introCard(step) : '') +
            composer(me, ctx.state, introOpen) +
            chips(cur) +
            (list.length
              ? '<div class="feed-list">' + list.map(function (p) { return postCard(p, now); }).join('') + '</div>' +
                '<p class="feed-end proto-note">試作版では、最近の投稿だけを表示しています。</p>'
              : '<div class="card">' + U.empty(empty[0], empty[1]) + '</div>') +
          '</div>' +
          side() +
        '</div>' +
      '</div>';
    },

    /* 描き直すたびに中身は新しくなるので、.scr-feed に付ければ二重にならない */
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-feed');
      if (!el) return;
      var q = ctx.query || {};
      var form = el.querySelector('[data-feed-form]');
      var ta = form.querySelector('textarea');
      var send = form.querySelector('.composer__send');
      var posting = false;

      // ?intro=1 は一度だけ効かせる。残したままだと、投稿後の描き直しでまたひな形が入ってしまう
      if (q.intro) {
        try { history.replaceState(null, '', '#/feed' + (q.kind ? '?kind=' + encodeURIComponent(q.kind) : '')); } catch (e) {}
      }
      autosize(ta);
      if (focusComposer) {
        focusComposer = false;
        caretToBlank(ta);
        try { form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
      }
      // せまい画面では絞り込みが横に流れる。選んでいる札が見える位置まで送っておく
      var strip = el.querySelector('.feed-chips'), onChip = strip && strip.querySelector('.is-on');
      if (onChip && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, onChip.offsetLeft - 16);
      if (refocus) {
        var again = U.$$('[' + refocus[0] + ']', el).filter(function (x) { return x.getAttribute(refocus[0]) === refocus[1]; })[0];
        if (again) { try { again.focus({ preventScroll: true }); } catch (e) {} }
        refocus = null;
      }
      lastPosted = null;
      popLike = null;

      function post(text) {
        posting = true;
        // 描き直しが終わるまでに2回押されても、同じ投稿が2つできないように先に空けておく
        ta.value = ''; send.disabled = true;
        var res = R.addPost(text, draft.kind);
        if (!res) { posting = false; ta.value = text; send.disabled = false; return; }
        var posts = CLG.store.state.posts;
        lastPosted = posts.length ? posts[posts.length - 1].id : null;
        draft = { text: '', kind: 'post' };
        CLG.app.reward(res);
        if (!res.xp) U.toast('投稿しました。今日のXPは上限に達しています');
        // 絞り込み中でも、自分の投稿が見えるように「すべて」へ戻す
        ctx.go('#/feed');
      }
      function submit() {
        var text = ta.value;
        if (posting) return;
        if (!text.trim()) { ta.focus(); return; }
        // ひな形の空欄を残したまま出してしまわないよう、1回だけ確かめる
        var label = draft.kind === 'intro' && BLANK.test(text) ? blankLabel(text) : '';
        if (!label) { post(text); return; }
        posting = true;
        U.confirmBox('まだ空いているところがあります', '「' + label + '」が空いたままです。このまま投稿しますか？', 'このまま投稿する')
          .then(function (ok) {
            posting = false;
            if (ok) post(text); else caretToBlank(ta);
          });
      }

      ta.addEventListener('input', function () {
        draft.text = ta.value;
        syncComposer(form);
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); submit(); }
      });
      form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });

      el.addEventListener('click', function (e) {
        var b;
        if ((b = e.target.closest('[data-feed-kind]'))) {
          draft.kind = b.getAttribute('data-feed-kind');
          if (draft.kind === 'intro' && !ta.value.trim()) {
            ta.value = R.introText(); draft.text = ta.value;
            syncComposer(form); caretToBlank(ta);
          } else {
            syncComposer(form);
          }
          // 上のすすめのカードはここでは消さない（押した場所の上で入力欄が動いてしまうため。次に描き直すときに合わせる）
          return;
        }
        if ((b = e.target.closest('[data-feed-intro]'))) {
          var cur = ta.value.trim(), tpl = R.introText();
          var apply = function () { draft = { text: tpl, kind: 'intro' }; focusComposer = true; ctx.refresh(); };
          if (cur && cur !== tpl.trim()) {
            U.confirmBox('書きかけの文章があります', '自己紹介のひな形に置きかえます。いま書いている文章は消えます。', '置きかえる')
              .then(function (ok) { if (ok) apply(); });
          } else apply();
          return;
        }
        if ((b = e.target.closest('[data-feed-filter]'))) {
          var k = b.getAttribute('data-feed-filter');
          refocus = ['data-feed-filter', k];
          ctx.go(k === 'all' ? '#/feed' : '#/feed?kind=' + encodeURIComponent(k));
          return;
        }
        if ((b = e.target.closest('[data-feed-like]'))) {
          var id = b.getAttribute('data-feed-like');
          popLike = R.toggleLike(id) ? id : null;
          refocus = ['data-feed-like', id];
          ctx.refresh();
        }
      });
    }
  };
})();
