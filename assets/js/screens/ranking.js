/* ============================================================
   ランキング（#/ranking）
   ------------------------------------------------------------
   並べるのは「貢献ポイント」と「学びのXP」の2つだけ。
   紹介の人数・報酬額では並べない（紹介を競わせないための約束）。
   他人のお金の話は、この画面には一切出さない。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var KINDS = [['points', '貢献ポイント'], ['xp', '学び（XP）']];
  var UNIT = { points: 'pt', xp: 'XP' };
  var TOP = 10;
  var LOG_MAX = 8;

  /* 画面の中だけの状態：いま見ているランキング */
  var kind = 'points';

  function pointRule(id) {
    return DATA.POINT_RULES.filter(function (r) { return r.id === id; })[0] || DATA.POINT_RULES[0];
  }
  /** 上の人に届くための「次の一手」。すぐにできて、場のためになることだけを勧める */
  function nextStep(diff) {
    if (kind === 'xp') {
      var per = DATA.XP.lesson, n = Math.ceil(diff / per);
      return { text: '講座をあと' + n + '本見ると届きます（1本 +' + per + ' XP）。', href: '#/courses', label: '講座へ' };
    }
    var r = pointRule('answer'), m = Math.ceil(diff / r.pt);
    return { text: 'タイムラインで質問に' + m + '回答えると届きます（1回 +' + r.pt + 'pt）。', href: '#/feed', label: 'タイムラインへ' };
  }

  /** 月末までの日数。「今月」の締めを具体的な日付で見せる */
  function monthEnd() {
    var now = CLG.now();
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    return { month: now.getMonth() + 1, end: end, left: Math.round((end - a) / 86400000) };
  }

  /** 「1位」「2〜3位」「10位まで」を順位の幅にする。読めなければ null */
  function prizeRange(label) {
    var m;
    if ((m = /^(\d+)位$/.exec(label))) return [+m[1], +m[1]];
    if ((m = /^(\d+)[〜~-](\d+)位$/.exec(label))) return [+m[1], +m[2]];
    if ((m = /^(\d+)位まで$/.exec(label))) return [1, +m[1]];
    return null;
  }

  /* ---------- 部品 ---------- */
  function medal(rank) {
    return '<span class="rk-no num' + (rank <= 3 ? ' rk-no--' + rank : '') + '">' + rank + '</span>';
  }

  function myCard(rows) {
    var mine = rows.filter(function (r) { return r.me; })[0];
    var above = rows[rows.indexOf(mine) - 1] || null;
    var unit = UNIT[kind];
    var what = kind === 'xp' ? '今月の学び（直近30日のXP）' : '今月の貢献ポイント';
    var foot;
    if (!above) {
      foot = '<p class="rk-me__msg">' + icon('star', 'ico-s') +
        (kind === 'xp' ? 'いま、いちばんよく学んでいます。' : 'いま、いちばん場を良くしてくれています。ありがとうございます。') + '</p>';
    } else {
      var diff = Math.max(0, above.value - mine.value), step = nextStep(diff || 1);
      var pct = above.value > 0 ? mine.value / above.value * 100 : 0;
      foot = '<div class="rk-me__next">' +
        '<div class="row-between rk-me__nextrow"><span class="small">上の人（' + above.rank + '位）まで あと <b class="num">' + U.num(diff) + '</b> ' + unit + '</span>' +
          '<span class="xsmall muted num">' + U.num(mine.value) + ' / ' + U.num(above.value) + '</span></div>' +
        U.progressBar(pct, 'gold') +
        '<p class="rk-me__msg">' + (mine.value ? '' : 'まだ' + (kind === 'xp' ? 'XP' : 'ポイント') + 'はありません。') + esc(step.text) +
          ' <a class="rk-me__go" href="' + step.href + '">' + esc(step.label) + U.chevron() + '</a></p>' +
      '</div>';
    }
    return '<section class="card rk-me" aria-label="あなたの順位（' + esc(what) + '）">' +
      '<div class="rk-me__head">' +
        '<p class="rk-me__eyebrow">' + esc(what) + '</p>' +
        (kind === 'xp' ? '<button type="button" class="btn btn-text rk-me__how" data-rk-xp>XPのたまり方</button>'
                       : '<button type="button" class="btn btn-text rk-me__how" data-rk-rules>ポイントのつき方</button>') +
      '</div>' +
      '<div class="rk-me__main">' +
        '<div class="rk-me__who">' + U.avatar({ name: mine.name, color: mine.color }) +
          '<p class="rk-me__rank' + (mine.rank <= 3 ? ' rk-me__rank--' + mine.rank : '') + '"><b class="num">' + mine.rank + '</b><small>位</small></p>' +
        '</div>' +
        '<p class="rk-me__val"><b class="num">' + U.num(mine.value) + '</b><small>' + unit + '</small></p>' +
      '</div>' +
      foot +
    '</section>';
  }

  function row(r) {
    var sub = r.me ? 'あなた' + (r.area ? '・' + r.area : '') : (r.area || '');
    return '<div class="li rk-row' + (r.me ? ' is-me' : '') + '"' + (r.me ? ' aria-current="true"' : '') + '>' +
      medal(r.rank) +
      U.avatar({ name: r.name, color: r.color }, 's') +
      '<span class="li__body"><span class="li__ttl rk-row__name">' + esc(r.name) + '</span>' +
        (sub ? '<span class="li__sub rk-row__sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="rk-row__lv">' + U.lvBadge(r.lv, '') + '</span>' +
      '<span class="rk-row__val"><b class="num">' + U.num(r.value) + '</b><small>' + UNIT[kind] + '</small></span>' +
    '</div>';
  }

  function board(rows) {
    var mine = rows.filter(function (r) { return r.me; })[0];
    var html = rows.slice(0, TOP).map(row).join('');
    if (mine.rank > TOP) {
      html += '<div class="li rk-gap"><span aria-hidden="true">…</span><span class="sr-only">' + (TOP + 1) + '位から' + (mine.rank - 1) + '位は省略</span></div>' + row(mine);
    }
    return '<div class="list rk-board">' + html + '</div>';
  }

  function prizes(myRank) {
    var hit = false;
    var items = DATA.RANK_PRIZES.map(function (s) {
      var i = s.indexOf('：'), who = i > 0 ? s.slice(0, i) : '', what = i > 0 ? s.slice(i + 1) : s;
      var rg = prizeRange(who), mine = !hit && rg && myRank >= rg[0] && myRank <= rg[1];
      if (mine) hit = true;
      return '<li class="rk-prize__li' + (mine ? ' is-mine' : '') + '">' +
        (who ? '<span class="rk-prize__who">' + esc(who) + '</span>' : '') +
        '<span class="rk-prize__what">' + esc(what) + (mine ? '<span class="tag tag-gold rk-prize__tag">いまの順位</span>' : '') + '</span></li>';
    }).join('');
    var me = monthEnd();
    return '<section class="card card-pad rk-prize">' +
      '<h2 class="h3 rk-card__ttl">' + icon('gift') + '今月の特典（お金以外）</h2>' +
      '<ul class="rk-prize__list">' + items + '</ul>' +
      '<p class="xsmall muted rk-prize__close">' + icon('clock', 'ico-s') + me.month + '月の順位は ' + esc(U.fmtShort(me.end)) + ' の終わりに決まります' +
        (me.left > 0 ? '（あと' + me.left + '日）' : '（今日まで）') + '。</p>' +
    '</section>';
  }

  function rules() {
    return '<section class="card card-pad rk-rules" id="rk-rules">' +
      '<h2 class="h3 rk-card__ttl">' + icon('star') + '貢献ポイントのつき方</h2>' +
      '<p class="sub">学びのレベルとは別に、場を良くしてくれたことに付きます。</p>' +
      '<div class="tbl-wrap"><table class="tbl rk-tbl"><thead><tr><th>すること</th><th class="r">ポイント</th></tr></thead><tbody>' +
        DATA.POINT_RULES.map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td class="r num">+' + U.num(r.pt) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      '<p class="rk-note">' + icon('info', 'ico-s') + '<span>ポイントはお金には換えられません。有効期限は付与から1年です。紹介した人数では増えません。</span></p>' +
    '</section>';
  }

  function logRow(l) {
    return '<div class="li rk-log">' +
      '<span class="li__body"><span class="li__ttl rk-log__ttl">' + esc(l.why) + '</span>' +
      '<span class="li__sub">' + esc(U.relTime(l.at)) + '</span></span>' +
      '<span class="li__end rk-log__pt num">+' + U.num(l.pt) + '<small>pt</small></span>' +
    '</div>';
  }

  function pointHistory(pts) {
    var log = pts.log;
    return '<section class="sec rk-history">' +
      '<p class="sec-ttl">あなたのポイントの記録' +
        (log.length > LOG_MAX ? '<button type="button" class="btn btn-text rk-more" data-rk-log>すべて見る（' + log.length + '件）</button>' : '') +
      '</p>' +
      '<div class="list">' + (log.length
        ? log.slice(0, LOG_MAX).map(logRow).join('')
        : U.empty('star', 'まだポイントの記録はありません。質問に答える、新入生に声をかける、などで付きます。')) +
      '</div>' +
      (log.length ? '<p class="xsmall muted rk-history__sum">合計 <b class="num">' + U.num(pts.total) + '</b> pt（付与から1年で消えます）</p>' : '') +
    '</section>';
  }

  CLG.screens.ranking = {
    title: 'ランキング',

    render: function (ctx) {
      var rows = R.ranking(kind);
      var mine = rows.filter(function (r) { return r.me; })[0];
      var me = monthEnd();
      return '<div class="scr-ranking">' +
        '<div class="page-head"><h1 class="page-ttl">ランキング</h1>' +
          '<p class="page-lead">今月、場を良くしてくれた人と、よく学んだ人。紹介の人数では決まりません。</p></div>' +
        '<div class="seg rk-seg" role="group" aria-label="ランキングの種類">' + KINDS.map(function (k) {
          var on = k[0] === kind;
          return '<button type="button" data-rk-kind="' + k[0] + '" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '">' + esc(k[1]) + '</button>';
        }).join('') + '</div>' +
        myCard(rows) +
        '<section class="sec">' +
          '<p class="sec-ttl">' + me.month + '月の順位<span class="rk-sec-note">上位' + TOP + '人' + (mine.rank > TOP ? 'とあなた' : '') + '</span></p>' +
          board(rows) +
        '</section>' +
        '<div class="grid-2 rk-cards">' + prizes(mine.rank) + rules() + '</div>' +
        pointHistory(R.points()) +
      '</div>';
    },

    /* 描き直すたびに中身は新しくなるので、.scr-ranking に付ければ二重にならない */
    mount: function (root, ctx) {
      var el = root.querySelector('.scr-ranking');
      if (!el) return;
      el.addEventListener('click', function (e) {
        var b;
        if ((b = e.target.closest('[data-rk-kind]'))) {
          var k = b.getAttribute('data-rk-kind');
          if (k !== kind) { kind = k; ctx.refresh(); }
          return;
        }
        if ((b = e.target.closest('[data-rk-xp]'))) { CLG.app.levelInfo(); return; }
        if ((b = e.target.closest('[data-rk-rules]'))) {
          // URL の # は画面の切り替えに使っているので、錨リンクにせずここで送る
          var t = el.querySelector('#rk-rules');
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if ((b = e.target.closest('[data-rk-log]'))) {
          var pts = R.points();
          U.modal(
            '<div class="scr-ranking">' +
              '<h3 class="modal__ttl">ポイントの記録</h3>' +
              '<p class="sub rk-modal__lead">合計 <b class="num">' + U.num(pts.total) + '</b> pt。付与から1年で消えます。お金には換えられません。</p>' +
              '<div class="list rk-modal__list">' + pts.log.map(logRow).join('') + '</div>' +
              '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button></div>' +
            '</div>');
        }
      });
    }
  };
})();
