/* ============================================================
   ランキング（#/ranking）
   ------------------------------------------------------------
   並べるのは「貢献ポイント」と「学びのXP」の2つだけ。
   紹介の人数・報酬額では並べない（紹介を競わせないための約束）。
   他人のお金の話は、この画面には一切出さない。
   見た目は表のまま。順位の飾り（メダル・大きな数字・進みの棒）は使わない。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc;

  var KINDS = [['points', '貢献ポイント'], ['xp', '学び（XP）']];
  var UNIT = { points: 'pt', xp: 'XP' };
  var TOP = 10;
  var LOG_MAX = 8;

  /* 画面の中だけの状態：いま見ているランキング */
  var kind = 'points';

  function monthEnd() {
    var now = CLG.now();
    return { month: now.getMonth() + 1, end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }

  /* ---------- 部品 ---------- */
  function row(r, above) {
    var sub = r.area || '';
    if (r.me) {
      // 自分の行だけ、ひとつ上の人との差を書く（1位なら「あなた」だけ）
      sub = above ? above.rank + '位まで あと' + U.num(Math.max(1, above.value - r.value)) + UNIT[kind] : 'あなた';
    }
    return '<tr class="rk-row' + (r.me ? ' is-me' : '') + '"' + (r.me ? ' aria-current="true"' : '') + '>' +
      '<td class="rk-no num">' + r.rank + '</td>' +
      '<td class="rk-who"><span class="rk-who__in">' + U.avatar({ name: r.name, color: r.color }, 's') +
        '<span class="rk-who__txt"><span class="rk-who__name">' + esc(r.name) + '</span>' +
        (sub ? '<span class="rk-who__sub">' + esc(sub) + '</span>' : '') + '</span></span></td>' +
      '<td class="rk-lv num">Lv' + esc(r.lv) + '</td>' +
      '<td class="r rk-val num">' + U.num(r.value) + '</td>' +
    '</tr>';
  }

  function board(rows) {
    var mine = rows.filter(function (r) { return r.me; })[0];
    var above = rows[rows.indexOf(mine) - 1] || null;
    var pick = function (r) { return row(r, r.me ? above : null); };
    var body = rows.slice(0, TOP).map(pick).join('');
    if (mine.rank > TOP) {
      body += '<tr class="rk-gap"><td colspan="4"><span aria-hidden="true">…</span><span class="sr-only">' + (TOP + 1) + '位から' + (mine.rank - 1) + '位は省略</span></td></tr>' + pick(mine);
    }
    return '<div class="card rk-board"><table class="tbl rk-tbl">' +
      '<thead><tr><th class="rk-no">順位</th><th>名前</th><th class="rk-lv">Lv</th><th class="r rk-val">' + UNIT[kind] + '</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  /* 締めの日は表の見出しに書く（「9/30まで」）。ここに同じことを文で書き足さない */
  function prizes() {
    return '<section class="card card-pad rk-prize">' +
      '<h2 class="h3 rk-card__ttl">今月の特典</h2>' +
      '<table class="kv rk-kv"><tbody>' + DATA.RANK_PRIZES.map(function (s) {
        var i = s.indexOf('：');
        return i > 0 ? '<tr><th>' + esc(s.slice(0, i)) + '</th><td>' + esc(s.slice(i + 1)) + '</td></tr>'
                     : '<tr><td colspan="2">' + esc(s) + '</td></tr>';
      }).join('') + '</tbody></table>' +
    '</section>';
  }

  function rules() {
    return '<section class="card card-pad rk-rules">' +
      '<h2 class="h3 rk-card__ttl">貢献ポイントのつき方</h2>' +
      '<table class="tbl rk-ptbl"><tbody>' +
        DATA.POINT_RULES.map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td class="r num">+' + U.num(r.pt) + '</td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<p class="rk-foot">お金には換えられません。有効期限は付与から1年です。紹介した人数では増えません。</p>' +
    '</section>';
  }

  function logRow(l) {
    return '<li class="rk-log">' +
      '<span class="rk-log__date num">' + esc(U.fmtShort(l.at)) + '</span>' +
      '<span class="rk-log__why">' + esc(l.why) + '</span>' +
      '<span class="rk-log__pt num">+' + U.num(l.pt) + '</span>' +
    '</li>';
  }

  function pointHistory(pts) {
    var log = pts.log;
    return '<section class="sec rk-history">' +
      '<h2 class="rk-sec-ttl">ポイントの記録' + (log.length ? '<span class="rk-sec-ttl__sum num">合計 ' + U.num(pts.total) + 'pt</span>' : '') +
        (log.length > LOG_MAX ? '<button type="button" class="btn btn-text rk-more" data-rk-log>すべて見る（' + log.length + '件）</button>' : '') +
      '</h2>' +
      (log.length
        ? '<ul class="card rk-loglist">' + log.slice(0, LOG_MAX).map(logRow).join('') + '</ul>'
        : '<div class="card">' + U.empty('', 'まだ記録はありません。') + '</div>') +
    '</section>';
  }

  CLG.screens.ranking = {
    title: 'ランキング',

    render: function (ctx) {
      var rows = R.ranking(kind);
      var me = monthEnd();
      return '<div class="scr-ranking">' +
        '<div class="page-head"><h1 class="page-ttl">ランキング</h1></div>' +
        '<div class="rk-bar">' +
          '<div class="seg rk-seg" role="group" aria-label="ランキングの種類">' + KINDS.map(function (k) {
            var on = k[0] === kind;
            return '<button type="button" data-rk-kind="' + k[0] + '" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '">' + esc(k[1]) + '</button>';
          }).join('') + '</div>' +
          (kind === 'xp' ? '<button type="button" class="btn btn-text rk-how" data-rk-xp>XPのたまり方</button>' : '') +
        '</div>' +
        '<section>' +
          '<h2 class="rk-sec-ttl">' + (kind === 'xp' ? '直近30日のXP'
            : me.month + '月の貢献ポイント<span class="rk-sec-ttl__sum num">' + esc(U.fmtShort(me.end)) + 'まで</span>') + '</h2>' +
          board(rows) +
        '</section>' +
        '<div class="grid-2 rk-cards">' + prizes() + rules() + '</div>' +
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
        if ((b = e.target.closest('[data-rk-log]'))) {
          var pts = R.points();
          U.modal(
            '<div class="scr-ranking">' +
              '<h3 class="modal__ttl">ポイントの記録（合計 ' + U.num(pts.total) + 'pt）</h3>' +
              '<ul class="rk-loglist rk-modal__list">' + pts.log.map(logRow).join('') + '</ul>' +
              '<div class="modal__foot"><button class="btn btn-soft" data-close>閉じる</button></div>' +
            '</div>');
        }
      });
    }
  };
})();
