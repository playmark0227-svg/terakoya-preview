/* ============================================================
   会員名簿（#/members）と会員のページ（#/members/<id>）
   ------------------------------------------------------------
   - id は PEOPLE の id か会員番号（ROSTER）。'me' は自分
   - 地域は本人の公開範囲のまま出す（R.members / R.memberProfile がもう切ってある。既定は都道府県まで）
   - 会員どうしの1対1のメッセージは作らない（決定事項。相談は運営とだけ）。だから「メッセージを送る」は置かない
   - 他人の会員番号は出さない（ログインに使う番号のため）
   - 名簿の絞り込みは URL（?pref= ?cohort= ?faculty= ?lv= ?q= ?sort=）。名前で探す欄は、打つたびに一覧だけ差し替える
     （画面ごと描き直すと、スマホで入力欄が入れ替わってキーボードが閉じてしまうため）
   - 自分のページでは、運営が非表示にした自分の投稿を上に知らせる（R.memberProfile の投稿には入らないため）
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, enc = encodeURIComponent;
  var SHOW = 60;
  var SORTS = [['new', '入会が新しい順'], ['lv', 'レベルが高い順']];
  var KIND_LABEL = { post: '近況', question: '質問', win: '成果報告', intro: '自己紹介', news: 'お知らせ', 'new': '新着講座', gig: '案件', event: 'イベント' };
  var cur = null;
  var typing = null;   // 名前で探す欄の、打ち終わりを待つタイマー

  /* ---------- 名簿 ---------- */
  function filtersOf(q) {
    q = q || {};
    return { pref: q.pref || '', cohort: q.cohort || '', faculty: q.faculty || '', lv: q.lv || '', q: q.q || '', sort: q.sort === 'lv' ? 'lv' : 'new' };
  }
  function dirHash(f, n) {
    var p = [];
    ['pref', 'cohort', 'faculty', 'lv', 'q'].forEach(function (k) { if (f[k]) p.push(k + '=' + enc(f[k])); });
    if (f.sort && f.sort !== 'new') p.push('sort=' + f.sort);
    if (n && n > SHOW) p.push('n=' + n);
    return '#/members' + (p.length ? '?' + p.join('&') : '');
  }
  function isFiltered(f) { return !!(f.pref || f.cohort || f.faculty || f.lv || f.q.trim()); }
  function select(name, label, opts, val) {
    return '<label class="mb-f"><span class="mb-f__l">' + esc(label) + '</span>' +
      '<select class="select" name="' + name + '" id="mb-' + name + '">' +
        '<option value="">すべて</option>' +
        opts.map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + esc(o.label || o.value) +
            (o.count != null ? '（' + U.num(o.count) + '）' : '') + '</option>';
        }).join('') +
      '</select></label>';
  }
  function memberRow(m, i) {
    var sub = [m.area, m.cohort, 'Lv' + m.lv].filter(Boolean).join('・');
    return '<a class="li mb-row" data-mb-i="' + i + '" href="' + esc(m.href || '#/members/' + enc(m.id)) + '">' + U.avatar(m, 's') +
      '<span class="li__body"><span class="li__ttl">' + esc(m.name) + (m.me ? '<span class="mb-you">あなた</span>' : '') + '</span>' +
        '<span class="li__sub">' + esc(sub) + '</span>' +
        (m.job ? '<span class="li__sub mb-row__job">' + esc(m.job) + '</span>' : '') +
      '</span>' + U.chevron() + '</a>';
  }
  function results(f, n) {
    var list = R.members(f), shown = Math.min(list.length, n), more = list.length - shown;
    // 条件を外したら、並び順は残して最初の絞り込みへ焦点を置く（押したリンクは消えるため）
    var clearHref = '#/members' + (f.sort !== 'new' ? '?sort=' + f.sort : '');
    var clear = '<a class="mb-clear" href="' + clearHref + '" data-focus-after="#mb-pref">条件を外す</a>';
    if (!list.length) {
      return '<div class="card">' + U.empty('users', '条件に合う会員はいません',
        '<a class="btn btn-soft btn-s" href="' + clearHref + '" data-focus-after="#mb-pref">条件を外す</a>') + '</div>';
    }
    return (isFiltered(f) ? '<div class="mb-bar">' +
        '<p class="mb-count" id="mbCount"><b class="num">' + U.num(list.length) + '</b>人</p>' + clear +
      '</div>' : '') +
      '<div class="list mb-list">' + list.slice(0, shown).map(memberRow).join('') + '</div>' +
      (more > 0 ? '<p class="mb-more"><a class="btn btn-ghost" href="' + esc(dirHash(f, shown + SHOW)) + '" data-focus-after="' + esc("[data-mb-i='" + shown + "']") + '">' +
        'もっと見る（あと' + U.num(more) + '人）</a></p>' : '');
  }
  /** 選べない値（古いリンク・打ち間違い）は外す。選択欄は「すべて」なのに0人、とならないように */
  function known(f, fc) {
    function has(list, v) { return list.some(function (o) { return String(o.value) === String(v); }); }
    if (f.pref && !has(fc.prefs, f.pref)) f.pref = '';
    if (f.cohort && !has(fc.cohorts, f.cohort)) f.cohort = '';
    if (f.faculty && !has(fc.faculties, f.faculty)) f.faculty = '';
    if (f.lv && !has(fc.lvs, f.lv)) f.lv = '';
    return f;
  }
  function directory(ctx) {
    var fc = R.membersFacets(), f = known(filtersOf(ctx.query), fc);
    var n = Math.max(SHOW, parseInt(ctx.query.n, 10) || SHOW);
    return '<div class="scr-members">' +
      '<div class="page-head"><h1 class="page-ttl" data-page-title tabindex="-1">会員名簿</h1>' +
        '<p class="page-lead"><span class="num">' + U.num(R.members({}).length) + '</span>人</p></div>' +
      '<form class="card mb-filters" data-mb-form role="search" aria-label="会員を探す" novalidate>' +
        '<div class="mb-filters__top">' +
          '<div class="mb-q">' + icon('search', 'ico-s') +
            '<label class="sr-only" for="mbQ">名前・お仕事・地域で探す</label>' +
            '<input class="input" id="mbQ" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="名前・お仕事・地域で探す" value="' + esc(f.q) + '" aria-controls="mbResults">' +
          '</div>' +
          '<label class="mb-sort"><span class="sr-only">並び順</span><select class="select" name="sort" id="mb-sort">' +
            SORTS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === f.sort ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') +
          '</select></label>' +
        '</div>' +
        '<div class="mb-filters__sel">' +
          select('pref', '都道府県', fc.prefs, f.pref) +
          select('cohort', '入会月', fc.cohorts.map(function (c) { return { value: c.value, label: c.label.replace('入会', ''), count: c.count }; }), f.cohort) +
          select('faculty', '学部', fc.faculties, f.faculty) +
          select('lv', 'レベル', fc.lvs, f.lv) +
        '</div>' +
      '</form>' +
      '<div class="mb-results" id="mbResults" aria-live="off">' + results(f, n) + '</div>' +
    '</div>';
  }

  /* ---------- 会員のページ ---------- */
  function muted(id) { return R.mutes().some(function (m) { return m.id === id; }); }
  /** 運営が隠した自分の投稿（隠した記録から R.post で拾う。R.post は本人にだけ hidden つきで返す） */
  function myHidden() {
    var h = (CLG.store.state && CLG.store.state.hiddenPosts) || {};
    return Object.keys(h).map(function (id) { return R.post(id); })
      .filter(function (x) { return x && x.mine && x.hidden; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function hiddenNotice(list) {
    if (!list.length) return '';
    return '<div class="notice notice-warn mb-hidden">' + icon('info') +
      '<div><p><span class="mb-sent">運営が非表示にした投稿が' + U.num(list.length) + '件あります。</span><span class="mb-sent">ほかの会員には見えていません。</span></p>' +
        '<ul class="mb-hidden__list">' + list.map(function (x) {
          return '<li><a href="#/feed/' + esc(enc(x.id)) + '">' + esc(firstLine(x.text, 30)) + '</a></li>';
        }).join('') + '</ul></div>' +
    '</div>';
  }
  function sec(ttl, body, id) {
    return '<section class="sec mb-sec" aria-labelledby="' + id + '"><h2 class="sec-ttl" id="' + id + '">' + ttl + '</h2>' + body + '</section>';
  }
  /** 最初の行。max 文字（既定 60）より長いときは切って「…」 */
  function firstLine(t, max) {
    var s = String(t || '').split('\n').filter(function (x) { return x.trim(); })[0] || '';
    max = max || 60;
    return s.length > max ? s.slice(0, max) + '…' : s;
  }
  function postRows(list) {
    return '<div class="list">' + list.map(function (p) {
      var meta = [U.relTime(p.at), KIND_LABEL[p.kind] || '', p.comments ? 'コメント' + p.comments + '件' : ''].filter(Boolean).join('・');
      return '<a class="li" href="#/feed/' + esc(enc(p.id)) + '"><span class="li__body">' +
        '<span class="li__ttl mb-post__ttl">' + U.jp(firstLine(p.text)) + '</span><span class="li__sub">' + esc(meta) + '</span></span>' + U.chevron() + '</a>';
    }).join('') + '</div>';
  }
  function profile(p) {
    var mu = !p.me && !p.staff && DATA.PEOPLE[p.id] && muted(p.id);
    var canMute = !p.me && !p.staff && !!DATA.PEOPLE[p.id] && !mu;
    // 提携の専門家は、福利厚生の「専門家」のその人の札へ（申込みは運営を通す。1対1のメッセージは作らない）
    var ex = p.staff ? (DATA.EXPERTS || []).filter(function (x) { return x.person === p.id; })[0] : null;
    var act = p.me ? '<a class="btn btn-ghost btn-s mb-head__act" href="#/account">プロフィールを直す</a>'
      : ex ? '<a class="btn btn-ghost btn-s mb-head__act" href="' + esc('#/perks?tab=experts&focus=' + enc(ex.id)) + '">相談を申し込む</a>' : '';
    var head = '<div class="mb-head' + (act ? ' has-act' : '') + '">' + U.avatar(p, 'l') +
      '<div class="mb-head__txt">' +
        '<h1 class="page-ttl" data-page-title tabindex="-1">' + esc(p.name) + '</h1>' +
        '<p class="mb-head__sub">' + (p.staff ? '<span>' + esc(p.role || '運営') + '</span>'
          : U.lvBadge(p.lv, p.lvName) + (p.cohort ? '<span>' + esc(p.cohort) + '</span>' : '')) +
          (p.me ? '<span class="mb-you">あなた</span>' : '') + '</p>' +
      '</div>' +
      (act ? act
        : canMute ? '<div class="mb-head__more">' +
            '<button type="button" class="iconbtn" data-pop="mbMenu" aria-expanded="false" aria-controls="mbMenu" aria-label="' + esc(p.name + 'さんのメニュー') + '">' + icon('more') + '</button>' +
            '<div class="pop mb-pop" id="mbMenu" hidden><button type="button" class="pop__item" data-mb-mute="' + esc(p.id) + '">この人をミュート</button></div>' +
          '</div>' : '') +
    '</div>';

    var rows = [];
    if (!p.staff) {
      // 自分のページでは、入れていない欄も「未入力」で出す（上の「プロフィールを直す」から入れられる）
      var noArea = p.me && !String(R.me().area || '').trim();
      rows.push(['地域', p.area || (noArea ? '未入力' : p.me ? '出していません（アカウントで変えられます）' : '出していません')]);
      if (p.job || p.me) rows.push(['いまのお仕事', p.job || '未入力']);
      if (p.goal) rows.push(['やりたいこと', p.goal]);
      rows.push(['修了した講座', p.completed ? p.completed + '本' : 'まだありません']);   // 数えるときは「本」（会員証と同じ）
    }
    var kv = rows.length ? '<div class="card card-pad mb-kv"><table class="kv"><tbody>' + rows.map(function (x) {
      return '<tr><th scope="row">' + esc(x[0]) + '</th><td>' + U.jp(x[1]) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '';

    var hidden = p.me ? myHidden() : [];
    var intro = '';
    if (p.intro) {
      intro = sec('自己紹介', '<article class="card mb-intro"><div class="mb-intro__text">' + U.jp(p.intro.text, { br: true }) + '</div>' +
        '<p class="mb-intro__foot"><span class="muted">' + esc(U.fmtShort(p.intro.at)) + '</span>' +
        '<a href="#/feed/' + esc(enc(p.intro.id)) + '">' + (p.intro.comments ? 'コメント' + U.num(p.intro.comments) + '件を見る' : '投稿を見る') + '</a></p></article>', 'mbIntro');
    } else if (p.me && hidden.some(function (x) { return x.kind === 'intro'; })) {
      // 書いたが運営が隠した（「まだ書いていません」と言わない。上の知らせからその投稿へ行ける）
      intro = sec('自己紹介', '<p class="mb-none">自己紹介は運営が非表示にしています。</p>', 'mbIntro');
    } else if (p.me) {
      intro = sec('自己紹介', '<div class="card">' + U.empty('', 'まだ自己紹介を書いていません', { href: '#/feed?intro=1', label: '自己紹介を書く' }) + '</div>', 'mbIntro');
    }

    var posts = p.posts.length ? sec('最近の投稿', postRows(p.posts), 'mbPosts')
      : !p.intro && !p.staff ? sec('最近の投稿', '<p class="mb-none">' + (mu ? 'ミュート中なので、投稿は出ていません。' : 'まだ投稿はありません。') + '</p>', 'mbPosts') : '';
    var events = p.hostedEvents.length ? sec('主催するイベント', '<div class="list">' + p.hostedEvents.map(function (e) {
      return '<a class="li" href="#/events/' + esc(enc(e.id)) + '"><span class="li__body"><span class="li__ttl">' + U.jp(e.title) + '</span>' +
        '<span class="li__sub">' + esc([U.fmtShort(e.at, true), e.place || ''].filter(Boolean).join('・')) + '</span></span>' + U.chevron() + '</a>';
    }).join('') + '</div>', 'mbEvents') : '';
    var gigs = p.gigs.length ? sec('募集中の案件', '<div class="list">' + p.gigs.map(function (g) {
      return '<a class="li" href="#/gigs/' + esc(enc(g.id)) + '"><span class="li__body"><span class="li__ttl">' + U.jp(g.title) + '</span>' +
        '<span class="li__sub">' + esc([g.reward ? g.reward + '（目安）' : '', g.remote ? '在宅' : ''].filter(Boolean).join('・')) + '</span></span>' + U.chevron() + '</a>';
    }).join('') + '</div>', 'mbGigs') : '';
    var taught = p.staff ? DATA.COURSES.filter(function (c) { return c.teacher === p.id; }) : [];
    var courses = taught.length ? sec('担当している講座', '<div class="list">' + taught.map(function (c) {
      return '<a class="li" href="#/courses/' + esc(enc(c.id)) + '"><span class="li__body"><span class="li__ttl">' + U.jp(c.title) + '</span>' +
        '<span class="li__sub">Lv' + esc(c.level) + 'から・全' + c.lessons.length + '回</span></span>' + U.chevron() + '</a>';
    }).join('') + '</div>', 'mbCourses') : '';

    return '<div class="scr-members">' +
      '<p class="crumb"><a href="#/members">会員名簿</a></p>' +
      head +
      (mu ? '<div class="notice notice-warn mb-muted">' + icon('info') + '<div><span class="mb-sent">ミュートしています。</span><span class="mb-sent">この人の投稿とコメントは、タイムラインに出ません。</span></div>' +
        '<button type="button" class="btn btn-soft btn-s" data-mb-unmute="' + esc(p.id) + '">ミュートをやめる</button></div>' : '') +
      hiddenNotice(hidden) +
      (p.bio ? '<p class="mb-bio">' + U.jp(p.bio, { br: true }) + '</p>' : '') +
      // 運営・講師は、担当の講座と会を先に（会員は自己紹介と投稿を先に）
      (p.staff ? courses + events + posts : kv + intro + posts + events + gigs) +
    '</div>';
  }

  /* ---------- 押したとき・打ったとき ---------- */
  function readForm(form) {
    var f = {};
    ['q', 'pref', 'cohort', 'faculty', 'lv', 'sort'].forEach(function (k) { var el = form.elements[k]; f[k] = el ? el.value : ''; });
    return filtersOf(f);
  }
  /** 名前で探す欄：画面ごと描き直さず、一覧だけ差し替える。URL は履歴を増やさずに書きかえる */
  function liveSearch(form) {
    var f = readForm(form), box = document.getElementById('mbResults');
    if (!box) return;
    box.innerHTML = results(f, SHOW);
    try { history.replaceState(history.state, '', dirHash(f)); } catch (e) {}
    var n = R.members(f).length;
    if (cur) cur.announce(isFiltered(f) ? n + '人見つかりました' : '全員を表示しています');
  }

  CLG.screens.members = {
    title: function (ctx) {
      if (!ctx.params[0]) return '会員名簿';
      var p = R.memberProfile(ctx.params[0]);
      return p ? p.name : 'ページが見つかりません';
    },
    back: function (ctx) { return ctx.params[0] ? { href: '#/members', label: '会員名簿' } : null; },
    render: function (ctx) {
      if (ctx.params[0]) {
        var p = R.memberProfile(ctx.params[0]);
        if (!p) return U.notFound({ lead: 'この会員のページはありません。退会したか、アドレスが違います。' });
        return profile(p);
      }
      return directory(ctx);
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundMembers) return;
      root.__boundMembers = true;
      root.addEventListener('change', function (e) {
        var s = e.target.closest && e.target.closest('.scr-members [data-mb-form] select');
        if (!s) return;
        cur.go(dirHash(readForm(s.form)));
      });
      root.addEventListener('input', function (e) {
        if (e.target.id !== 'mbQ' || !e.target.closest('.scr-members')) return;
        if (e.isComposing) return;   // 変換中は待つ（確定したときに compositionend で探す）
        clearTimeout(typing);
        var form = e.target.form;
        typing = setTimeout(function () { liveSearch(form); }, 250);
      });
      root.addEventListener('compositionend', function (e) {
        if (e.target.id !== 'mbQ') return;
        clearTimeout(typing);
        var form = e.target.form;
        typing = setTimeout(function () { liveSearch(form); }, 50);
      });
      root.addEventListener('submit', function (e) {
        var form = e.target.closest && e.target.closest('.scr-members [data-mb-form]');
        if (!form) return;
        e.preventDefault();
        clearTimeout(typing);
        liveSearch(form);
      });
      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.scr-members [data-mb-mute], .scr-members [data-mb-unmute]');
        if (!b) return;
        if (b.hasAttribute('data-mb-unmute')) {
          var uid = b.getAttribute('data-mb-unmute');
          R.unmutePerson(uid);
          U.toast(R.person(uid).name + 'さんのミュートをやめました');
          // 消えたボタンの代わりに、ミュートを入れているメニューのボタンへ
          cur.refresh({ focus: '[data-pop="mbMenu"]' });
          return;
        }
        var id = b.getAttribute('data-mb-mute'), who = R.person(id);
        U.confirmBox(who.name + 'さんをミュートしますか', 'この人の投稿とコメントが、タイムラインに出なくなります。相手には知らされません。', 'ミュートする', false, { kind: 'ink' })
          .then(function (ok) {
            if (!ok) return;
            if (!R.mutePerson(id)) { U.toast('この人はミュートできません', 'error'); return; }
            U.toast(who.name + 'さんをミュートしました', null, { action: '元に戻す', onAction: function () {
              R.unmutePerson(id);
              CLG.app.refresh({ focus: '[data-pop="mbMenu"]' });   // 押した「元に戻す」は消えるので、メニューのボタンへ
            } });
            cur.refresh({ focus: '[data-mb-unmute]' });
          });
      });
    }
  };
})();
