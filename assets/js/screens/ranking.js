/* ============================================================
   ランキング（#/ranking ・ ?kind=xp ・ ?month=last）
   ------------------------------------------------------------
   並べるのは「貢献ポイント」と「学びのXP」の2つだけ。
   紹介の人数・報酬額では並べない（紹介を競わせないための約束）。
   他人のお金の話は、この画面には一切出さない。
   期間は暦の月（9月なら9/1〜9/30。決定事項）。先月の分は確定した順位と、特典の連絡の状態を出す。
   見た目は表のまま。順位の飾り（メダル・金色・大きな数字・進みの棒）は使わない。1〜3位は太字だけ。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc;

  var KINDS = [['points', '貢献ポイント'], ['xp', '学び（XP）']];
  var MONTHS = [['this', '今月'], ['last', '先月']];
  var UNIT = { points: 'pt', xp: 'XP' };
  var TOP = 10;
  var LOG_MAX = 8;
  var cur = null;   // mount で受け取った ctx（押したときに、もう一方の切り替えを残すため）

  /* ---------- 小さな道具 ---------- */
  function viewOf(q) { q = q || {}; return { kind: q.kind === 'xp' ? 'xp' : 'points', last: q.month === 'last' }; }
  function hashOf(v) {
    var p = [];
    if (v.kind === 'xp') p.push('kind=xp');
    if (v.last) p.push('month=last');
    return '#/ranking' + (p.length ? '?' + p.join('&') : '');
  }
  /** 暦の月（今月か先月）。「9/1〜9/30」 */
  function monthOf(last) {
    var n = CLG.now(), s = new Date(n.getFullYear(), n.getMonth() - (last ? 1 : 0), 1);
    var e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    return { m: s.getMonth() + 1, text: DATA.md(s) + '〜' + DATA.md(e) };
  }
  /* 記録・特典の短い文は、文節で折れる環境（word-break: auto-phrase）ではそのまま出す。
     U.jp の「15分」などの印が文節をまたぐと「運営と／15分／の面談」と3つに割れるため。効かない環境（Safari）では U.jp */
  var PHRASE = !!(window.CSS && CSS.supports && CSS.supports('word-break', 'auto-phrase'));
  function phrase(t) { return PHRASE ? esc(t) : U.jp(t); }
  /* 「で始まる文字は、かぎかっこの左の空きを詰める */
  function palt(t) { return /^「/.test(String(t || '')) ? ' is-palt' : ''; }
  function flatten(top) {
    var out = [];
    (top || []).forEach(function (c) { out.push(c); (c.replies || []).forEach(function (r) { out.push(r); }); });
    return out;
  }

  /* ---------- 順位の表 ---------- */
  /** 顔＋名前（会員のページへ）。2行目は地域。狭い画面では Lv もここに入る */
  function who(r, sub) {
    return '<a class="plink rk-person" href="' + esc(r.href || '#/members/' + encodeURIComponent(r.id)) + '">' + U.avatar(r, 's') +
      '<span class="rk-person__txt"><span class="plink__name' + palt(r.name) + '">' + esc(r.name) + '</span>' +
      '<span class="rk-person__sub">' + esc(sub || '') + (r.lv ? '<span class="rk-lvsub">' + (sub ? '・' : '') + 'Lv' + esc(r.lv) + '</span>' : '') + '</span></span></a>';
  }
  function row(r, v, above) {
    // 自分の行だけ、ひとつ上の人との差を別の行に書く（狭い画面でも切らない）
    var need = r.me && above ? above.rank + '位まで あと' + U.num(Math.max(1, above.value - r.value)) + UNIT[v.kind] : '';
    return '<tr class="rk-row' + (r.me ? ' is-me' : '') + (r.rank <= 3 ? ' is-top' : '') + '"' + (r.me ? ' aria-current="true"' : '') + '>' +
      '<td class="rk-no num">' + r.rank + '</td>' +
      '<td class="rk-who">' + who(r, r.me ? '' : r.area) + (need ? '<span class="rk-need">' + esc(need) + '</span>' : '') + '</td>' +
      '<td class="rk-lv num">Lv' + esc(r.lv) + '</td>' +
      '<td class="r rk-val num">' + U.num(r.value) + '</td>' +
    '</tr>';
  }
  function zeroText(v) { return v.kind === 'xp' ? 'XPがたまるとここに載ります' : 'ポイントがつくとここに載ります'; }
  function board(rows, v) {
    var mine = rows.filter(function (r) { return r.me; })[0];
    var zero = !mine || !mine.value;
    var above = zero ? null : rows[rows.indexOf(mine) - 1] || null;
    // 0 の人は並べない（入ったばかりの人に、最下位が出ないように）
    var shown = rows.filter(function (r) { return r.value > 0; }).slice(0, TOP);
    var body = shown.map(function (r) { return row(r, v, r.me ? above : null); }).join('');
    if (!shown.length) body = '<tr class="rk-none"><td colspan="4">' + (v.last ? '先月の記録はありません' : 'まだ誰も載っていません') + '</td></tr>';
    if (!zero && mine.rank > TOP) {
      body += '<tr class="rk-gap"><td colspan="4"><span aria-hidden="true">…</span><span class="sr-only">' + (TOP + 1) + '位から' + (mine.rank - 1) + '位は省略</span></td></tr>' +
        row(mine, v, above);
    }
    // 先月の分は、上の「先月のポイントはありません」で足りる（同じことを表の中でもう一度言わない）
    if (zero && mine && !v.last) {
      body += '<tr class="rk-row is-me is-zero" aria-current="true"><td class="rk-no num" aria-label="順位なし">—</td>' +
        '<td class="rk-who" colspan="3">' + who(mine, '') + '<span class="rk-need">' + esc(zeroText(v)) + '</span></td></tr>';
    }
    return '<div class="card rk-board"><table class="tbl rk-tbl">' +
      '<caption class="sr-only">' + esc(monthOf(v.last).m + '月の' + (v.kind === 'xp' ? '学び（XP）' : '貢献ポイント') + 'の順位') + '</caption>' +
      '<thead><tr><th class="rk-no" scope="col">順位</th><th scope="col">名前</th><th class="rk-lv" scope="col">Lv</th><th class="r rk-val" scope="col">' + UNIT[v.kind] + '</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- 特典（表の上の帯） ---------- */
  function prizes(rows, v, mo) {
    var P = DATA.RANK_PRIZES || [];
    if (!P.length) return '';
    // 先月の分は、上位の人へ運営から連絡したかどうかを出す
    var st = v.last ? [rows[0] && rows[0].value > 0 ? rows[0].prizeStatus : '',
      rows.slice(1, 3).some(function (r) { return r.prizeStatus; }) ? '連絡済み' : ''] : [];
    return '<section class="card rk-prize" aria-labelledby="rkPrizeTtl">' +
      '<h2 class="rk-prize__ttl" id="rkPrizeTtl">' + mo.m + '月の特典</h2>' +
      '<ul class="rk-prize__list">' + P.map(function (s, i) {
        var k = s.indexOf('：'), head = k > 0 ? s.slice(0, k) : '', body = (k > 0 ? s.slice(k + 1) : s).replace('今月', mo.m + '月');
        return '<li class="rk-prize__it">' + (head ? '<span class="rk-prize__k">' + esc(head) + '</span>' : '') +
          '<span class="rk-prize__v' + palt(body) + '">' + phrase(body) + '</span>' +
          (st[i] ? '<span class="rk-prize__st">' + U.statusTag('done', st[i]) + '</span>' : '') + '</li>';
      }).join('') + '</ul>' +
    '</section>';
  }

  function rules() {
    return '<section class="card card-pad rk-rules" aria-labelledby="rkRulesTtl">' +
      '<h2 class="h3 rk-card__ttl" id="rkRulesTtl">貢献ポイントのつき方</h2>' +
      '<table class="tbl rk-ptbl"><tbody>' +
        DATA.POINT_RULES.map(function (r) {
          return '<tr><td class="' + palt(r.name) + '">' + U.jp(r.name) + '</td><td class="r num">+' + U.num(r.pt) + '</td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<p class="rk-foot">お金には換えられません。有効期限は付与から1年です。紹介した人数では増えません。</p>' +
    '</section>';
  }

  /* ---------- ポイントの記録 ---------- */
  /** 記録からのリンク。「ありがとう」「回答」「声かけ」は、自分のコメントの場所まで（?c=） */
  function logHref(l) {
    var link = String(l.link || ''), m = /^#\/feed\/([\w-]+)$/.exec(link);
    if (m && /^(thanks|answer|welcome)$/.test(l.rule || '')) {
      var mine = flatten(R.comments(m[1])).filter(function (c) { return c.mine; });
      var pick = l.rule === 'answer' ? mine.filter(function (c) { return c.answer; })[0]
        : l.rule === 'thanks' ? mine.filter(function (c) { return c.thanks > 0; })[0] : null;
      pick = pick || (mine.length === 1 ? mine[0] : null);
      if (pick) link += '?c=' + encodeURIComponent(pick.id);
    }
    // 「#/feed」だけのような、行き先の決まらないリンクは付けない
    return /^#\/.+\/./.test(link) || /\?./.test(link) ? link : '';
  }
  function logRow(l) {
    var href = logHref(l);
    var inner = '<span class="rk-log__date num">' + esc(U.fmtShort(l.at)) + '</span>' +
      '<span class="rk-log__why' + palt(l.why) + '">' + phrase(l.why) + '</span>' +
      '<span class="rk-log__pt num">+' + U.num(l.pt) + '</span>';
    // リンクのない行も、山かっこの幅だけ空けて pt の列を右でそろえる
    return '<li>' + (href ? '<a class="rk-log" href="' + esc(href) + '">' + inner + U.chevron() + '</a>'
      : '<div class="rk-log">' + inner + '<span class="rk-log__sp" aria-hidden="true"></span></div>') + '</li>';
  }
  function pointHistory(pts) {
    var log = pts.log;
    return '<section class="rk-history" aria-labelledby="rkLogTtl">' +
      '<h2 class="rk-sec-ttl" id="rkLogTtl">ポイントの記録' + (log.length ? '<span class="rk-sec-ttl__sum num">合計 ' + U.num(pts.total) + 'pt</span>' : '') + '</h2>' +
      (log.length
        ? '<ul class="card rk-loglist">' + log.slice(0, LOG_MAX).map(logRow).join('') + '</ul>'
        : '<div class="card rk-loglist">' + U.empty('', 'まだ記録はありません', { href: '#/feed?kind=question', label: '質問を見る' }) + '</div>') +
      // 見出しの外に置く（狭い画面では記録の下へ回す）
      (log.length > LOG_MAX ? '<button type="button" class="btn btn-text rk-more" data-rk-log>すべて見る（' + log.length + '件）</button>' : '') +
    '</section>';
  }

  function seg(label, list, on, attr) {
    return '<div class="seg rk-seg" role="group" aria-label="' + esc(label) + '">' + list.map(function (k) {
      var p = k[0] === on;
      return '<button type="button" ' + attr + '="' + k[0] + '" aria-pressed="' + p + '">' + esc(k[1]) + '</button>';
    }).join('') + '</div>';
  }

  CLG.screens.ranking = {
    title: 'ランキング',

    render: function (ctx) {
      var v = viewOf(ctx.query), mo = monthOf(v.last), opt = { month: v.last ? -1 : 0 };
      var rows = R.ranking(v.kind, opt);
      var mine = rows.filter(function (r) { return r.me; })[0];
      var total = R.rankTotal ? R.rankTotal(v.kind, opt) : rows.filter(function (r) { return r.value > 0; }).length;
      var place = mine && mine.value ? U.num(total) + '人中' + mine.rank + '位'
        : (v.last ? '先月' : '今月') + (v.kind === 'xp' ? 'のXPは' : 'のポイントは') + (v.last ? 'ありません' : 'まだありません');
      var what = v.kind === 'xp' ? '学び（XP）' : '貢献ポイント';
      return '<div class="scr-ranking">' +
        '<div class="page-head rk-head"><h1 class="page-ttl" data-page-title tabindex="-1">ランキング</h1>' +
          '<a class="rk-dir" href="#/members">会員名簿</a></div>' +
        '<div class="rk-bar">' +
          seg('ランキングの種類', KINDS, v.kind, 'data-rk-kind') +
          seg('期間', MONTHS, v.last ? 'last' : 'this', 'data-rk-month') +
          (v.kind === 'xp' ? '<button type="button" class="btn btn-text rk-how" data-rk-level>レベルのしくみ</button>' : '') +
        '</div>' +
        (v.kind === 'points' ? prizes(rows, v, mo) : '') +
        '<section class="rk-main" aria-labelledby="rkTtl">' +
          '<div class="rk-sec-head">' +
            '<h2 class="rk-sec-ttl" id="rkTtl">' + mo.m + '月の' + what + '<span class="rk-sec-ttl__sum num">' + esc(mo.text) + (v.last ? '・確定' : '') + '</span></h2>' +
            '<p class="rk-place' + (mine && mine.value ? '' : ' is-zero') + '">' + U.jp(place) + '</p>' +
          '</div>' +
          board(rows, v) +
        '</section>' +
        (v.kind === 'points' ? rules() + pointHistory(R.points()) : '') +
      '</div>';
    },

    /* #view に1回だけ付ける（mount は描き直すたびに呼ばれる） */
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundRanking) return;
      root.__boundRanking = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.scr-ranking [data-rk-kind], .scr-ranking [data-rk-month], .scr-ranking [data-rk-level], .scr-ranking [data-rk-log]');
        if (!b) return;
        var v = viewOf(cur.query);
        if (b.hasAttribute('data-rk-kind')) { v.kind = b.getAttribute('data-rk-kind'); cur.go(hashOf(v)); return; }
        if (b.hasAttribute('data-rk-month')) { v.last = b.getAttribute('data-rk-month') === 'last'; cur.go(hashOf(v)); return; }
        if (b.hasAttribute('data-rk-level')) { CLG.app.levelInfo(); return; }
        var pts = R.points();
        U.modal('<ul class="rk-loglist rk-modal__list">' + pts.log.map(logRow).join('') + '</ul>',
          { title: 'ポイントの記録（合計 ' + U.num(pts.total) + 'pt）', foot: true, cls: 'scr-ranking' });
      });
    }
  };
})();
