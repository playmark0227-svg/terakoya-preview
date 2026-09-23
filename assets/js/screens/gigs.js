/* ============================================================
   案件（#/gigs 一覧・#/gigs/<id> くわしく）
   ------------------------------------------------------------
   - 報酬はすべて「目安」と書く。収入を約束・断定する言い方はしない。
   - 応募できるかどうかは R.gigLock（レベルと講座の修了）で決まる。画面では判定しない。
   - 種類の絞り込みは #/gigs?type=small のように URL に持つ（戻る・共有で同じ画面になるように）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TYPES = {};
  DATA.GIG_TYPES.forEach(function (t) { TYPES[t.id] = t; });
  var TYPE_ICON = { small: 'sparkle', work: 'briefcase', refer: 'link', peer: 'users' };
  var RT = { shot: '1回ごと', stock: '毎月' };
  var STATUS_TAG = { applied: 'tag-indigo', meeting: 'tag-indigo', active: 'tag-ok', done: 'tag-ok' };
  var STATUS_ICO = { applied: 'clock', meeting: 'calendar', active: 'bolt', done: 'checkc' };
  var PLACEHOLDER = {
    small: '例：平日の21時以降なら作業できます。',
    work: '例：講座を修了しました。平日の夜と土曜の午前に作業できます。',
    peer: '例：市内に住んでいます。土日の午前なら伺えます。'
  };
  /* 紹介できる商材に手順が書かれていないときの流れ。「つなぐだけ」を具体的に見せるため */
  var REFER_STEPS = [
    '紹介先に「担当者から連絡してよいか」の了承をもらう',
    '「担当者につなぐ」から、紹介先を知らせる',
    '担当者が商談と契約を行う（あなたの同席はいりません）',
    '条件を満たすと報酬が確定する（金額は目安）'
  ];

  /* ---------- 小さな道具 ---------- */
  function typeOf(g) { return TYPES[g.type] || { id: g.type, name: '案件', desc: '' }; }
  function gigsOf(type) { return DATA.GIGS.filter(function (g) { return g.type === type; }); }
  function levelMin(lv) { var L = DATA.LEVELS.filter(function (x) { return x.lv === lv; })[0]; return L ? L.min : 0; }
  /** 応募できるものを先に、まだのものを後に（元の並びは保つ） */
  function sorted(list) {
    return list.map(function (g, i) { return { g: g, i: i, l: R.gigLock(g).locked ? 1 : 0 }; })
      .sort(function (a, b) { return a.l - b.l || a.i - b.i; })
      .map(function (x) { return x.g; });
  }
  /* data.js の案件には場所の項目がないので、「2時間・札幌市内」のような所要時間から場所を分けて出す */
  function timePlace(g) {
    var t = String(g.time || ''), i = t.indexOf('・');
    if (g.place) return { time: t, place: g.place };
    if (!g.remote && i > 0) return { time: t.slice(0, i), place: t.slice(i + 1) };
    return { time: t, place: '' };
  }
  function slotsShort(g) {
    var s = String(g.slots || '');
    if (!s || s === '—') return '';
    if (s === '随時') return '随時募集';
    return /^\d/.test(s) ? '募集' + s : s;
  }
  function slotsLong(g) {
    var s = String(g.slots || '');
    if (!s || s === '—') return '人数の制限はありません';
    if (s === '随時') return '随時（人数の制限はありません）';
    return /^\d/.test(s) ? s + 'まで' : s;
  }
  function reqShort(g) {
    var c = g.requires ? R.course(g.requires) : null;
    return 'Lv' + g.level + 'から' + (c ? '・「' + c.title + '」修了' : '');
  }
  /* 「月額の10%（継続中は毎月）」のように報酬の文にもう書いてあるときは、札を重ねない */
  function rtLabel(g) { var rt = RT[g.rewardType] || ''; return rt && String(g.reward || '').indexOf(rt) < 0 ? rt : ''; }

  /** 鍵の理由に「あと何をすれば開くか」を足す */
  function lockOf(g) {
    var lk = R.gigLock(g);
    if (!lk.locked) return lk;
    var out = { locked: true, reason: lk.reason, course: lk.course || null, sub: '', also: '' };
    if (lk.course) {
      var cs = R.courseState(lk.course);
      out.sub = cs.locked ? cs.lockReason : '全' + cs.total + '本中 ' + cs.done + '本を見終えています';
    } else {
      var need = levelMin(g.level) - R.xp();
      if (need > 0) out.sub = 'あと ' + U.num(need) + ' XP';
      var c = g.requires ? R.course(g.requires) : null;
      if (c) out.also = '講座「' + c.title + '」の修了も必要です';
    }
    return out;
  }

  function statusTag(st) {
    return '<span class="tag ' + (STATUS_TAG[st.status] || 'tag-indigo') + '">' + esc(st.label || '応募済み') + '</span>';
  }
  function rewardLine(g) {
    var rt = rtLabel(g);
    return '<p class="gg-reward"><b>' + esc(g.reward) + '</b><span class="gg-reward__est">（目安）</span>' +
      (rt ? '<span class="gg-rt">' + esc(rt) + '</span>' : '') + '</p>';
  }
  function metaItem(ico, text, cls) {
    return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + icon(ico) + '<span>' + esc(text) + '</span></li>';
  }
  function postBtn() {
    return '<button type="button" class="btn btn-ghost btn-s gg-post" data-gg="post">' + icon('plus', 'ico-s') + '募集を出す</button>';
  }

  /* ---------- 一覧のカード ---------- */
  /** h: 題の見出しの段（種類ごとの見出しの下では h4、絞り込み中は h3） */
  function card(g, h) {
    var t = typeOf(g), lk = lockOf(g), st = R.gigState(g.id), p = R.person(g.by), tp = timePlace(g);
    h = h || 'h3';
    var meta = [];
    if (tp.time) meta.push(metaItem('clock', tp.time));
    meta.push(g.remote ? metaItem('home', '在宅OK') : metaItem('pin', tp.place || '現地で作業'));
    var sl = slotsShort(g);
    if (sl) meta.push(metaItem('users', sl));
    if (!lk.locked) meta.push(metaItem('check', reqShort(g), 'gg-meta__ok'));

    var lockRow = '';
    if (lk.locked) {
      lockRow = '<div class="gg-lock">' + icon('lock', 'ico-s') +
        '<span class="gg-lock__txt">' + esc(lk.reason) +
          (lk.sub ? '<small>' + esc(lk.sub) + '</small>' : '') +
          (lk.also ? '<small>' + esc(lk.also) + '</small>' : '') + '</span>' +
        (lk.course
          ? '<a class="gg-lock__go" href="#/courses/' + esc(lk.course) + '">講座を見る</a>'
          : '<button type="button" class="gg-lock__go" data-gg="level">レベルのしくみ</button>') +
      '</div>';
    }

    return '<article class="card gg-card' + (lk.locked ? ' is-locked' : '') + '">' +
      '<div class="gg-card__tags"><span class="tag">' + esc(t.name) + '</span>' +
        (g.isNew ? '<span class="tag tag-accent">新着</span>' : '') +
        (st ? statusTag(st) : '') + '</div>' +
      '<' + h + ' class="gg-card__ttl"><a class="gg-card__link" href="#/gigs/' + esc(g.id) + '">' + esc(g.title) + '</a></' + h + '>' +
      rewardLine(g) +
      '<ul class="gg-meta">' + meta.join('') + '</ul>' +
      lockRow +
      '<div class="gg-card__foot">' + U.avatar(p, 's') +
        '<span class="gg-card__by"><small>掲載元</small>' + esc(p.name) + '・' + (p.staff ? '運営' : '会員') + '</span>' +
        U.chevron() + '</div>' +
    '</article>';
  }

  /* ---------- あなたの応募 ---------- */
  function mineRow(r) {
    var st = r.st, done = st.status === 'done';
    var when = done && st.doneAt ? U.fmtShort(st.doneAt) + 'にやり終えた' : U.fmtShort(st.at) + 'に応募';
    return '<a class="li has-ico" href="#/gigs/' + esc(r.g.id) + '">' +
      '<span class="li__ico' + (done ? ' gg-ico-ok' : '') + '">' + icon(STATUS_ICO[st.status] || 'clock') + '</span>' +
      '<span class="li__body"><span class="li__ttl">' + esc(r.g.title) + '</span>' +
        '<span class="li__sub gg-mine__sub">' + statusTag(st) + '<span>' + esc(when) + '</span>' +
        (done && st.reward ? '<span>報酬 <b class="num">' + U.yen(st.reward) + '</b></span>' : '') + '</span></span>' +
      U.chevron() + '</a>';
  }

  function firstBlock(type) {
    var step = R.steps().filter(function (s) { return s.id === 'gig'; })[0];
    return '<div class="card card-pad gg-first">' +
      '<span class="gg-first__ico">' + icon('sparkle') + '</span>' +
      '<div class="gg-first__body">' +
        '<p class="gg-first__ttl">まだ応募した案件はありません</p>' +
        '<p class="sub">お小遣い案件なら、スマホだけで今日から始められます。' +
          (step && !step.done ? '応募すると、スタートガイドの「' + esc(step.title) + '」も済みになります。' : '') + '</p>' +
        (type !== 'small' ? '<button type="button" class="btn btn-soft btn-s" data-gg="type" data-type="small">' + icon('sparkle', 'ico-s') + 'お小遣い案件を見る</button>' : '') +
      '</div></div>';
  }

  function mineBlock(ctx, type) {
    var gigs = (ctx.state || CLG.store.state).gigs || {};
    var rows = Object.keys(gigs).filter(function (id) { return R.gig(id); })
      .map(function (id) { return { g: R.gig(id), st: R.gigState(id) }; });
    if (!rows.length) return firstBlock(type);
    rows.sort(function (a, b) { return new Date(b.st.doneAt || b.st.at) - new Date(a.st.doneAt || a.st.at); });
    var open = rows.filter(function (r) { return r.st.status !== 'done'; }).length;
    var done = rows.length - open;
    var counts = [open ? '進行中 ' + open + '件' : '', done ? 'やり終えた ' + done + '件' : ''].filter(Boolean).join('・');
    var earned = R.gigEarnings();
    return '<section class="gg-mine">' +
      '<h2 class="sec-ttl">あなたの応募<span class="gg-mine__count">' + esc(counts) + '</span></h2>' +
      '<div class="card gg-mine__card">' +
        '<div class="gg-mine__sum">' +
          '<div><p class="gg-mine__label">これまでに確定した報酬</p>' +
            '<p class="gg-mine__amt num">' + U.yen(earned) + '</p></div>' +
          '<p class="gg-mine__note">' + (earned
            ? '案件の分だけの合計です。紹介の報酬は<a href="#/referral">紹介・報酬</a>で見られます。'
            : '案件をやり終えて、運営が確認すると、ここに合計が出ます。') + '</p>' +
        '</div>' +
        '<div class="gg-mine__rows">' + rows.map(mineRow).join('') + '</div>' +
      '</div></section>';
  }

  /* ---------- 絞り込みと一覧 ---------- */
  function filterBlock(type) {
    var chips = [['', 'すべて', DATA.GIGS.length]].concat(DATA.GIG_TYPES.map(function (t) {
      return [t.id, t.name, gigsOf(t.id).length];
    }));
    var t = type ? TYPES[type] : null;
    return '<div class="gg-filter">' +
      '<div class="chips" role="group" aria-label="案件の種類">' + chips.map(function (c) {
        var on = c[0] === type;
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-gg="type" data-type="' + esc(c[0]) + '" aria-pressed="' + on + '">' +
          esc(c[1]) + '<span class="n num">' + c[2] + '</span></button>';
      }).join('') + '</div>' +
      (t ? '<div class="gg-typedesc">' + icon(TYPE_ICON[t.id] || 'briefcase', 'ico-s') + '<span>' + esc(t.desc) + '</span>' +
        (t.id === 'peer' ? postBtn() : '') + '</div>' : '') +
    '</div>';
  }

  function grid(list, h) {
    return '<div class="grid-2 gg-grid">' + list.map(function (g) { return card(g, h); }).join('') + '</div>';
  }

  function listBody(type) {
    if (type) {
      var items = sorted(gigsOf(type));
      return items.length ? grid(items, 'h3')
        : '<div class="card">' + U.empty('briefcase', 'いま募集中の案件はありません。新しい案件はタイムラインでもお知らせします。') + '</div>';
    }
    return DATA.GIG_TYPES.map(function (t) {
      var items = sorted(gigsOf(t.id));
      if (!items.length) return '';
      return '<section class="gg-group">' +
        '<div class="gg-group__head"><div>' +
          '<h3 class="gg-group__ttl">' + esc(t.name) + '</h3>' +
          '<p class="gg-group__desc">' + esc(t.desc) + '</p></div>' +
          (t.id === 'peer' ? postBtn() : '') + '</div>' +
        grid(items, 'h4') + '</section>';
    }).join('');
  }

  function safeNote() {
    return '<aside class="card-flat gg-safe">' +
      '<span class="gg-safe__ico">' + icon('shield') + '</span>' +
      '<div><p>投資・FX・暗号資産・借入が必要な案件は掲載しません。怪しいと思ったら運営に知らせてください。</p>' +
      '<a class="gg-safe__link" href="#/messages">運営に知らせる' + icon('arrow', 'ico-s') + '</a></div>' +
    '</aside>';
  }

  function renderList(ctx) {
    var q = ctx.query || {};
    var type = TYPES[q.type] ? q.type : '';
    return '<div class="scr-gigs">' +
      '<div class="page-head"><h1 class="page-ttl">案件</h1>' +
        '<p class="page-lead">学んだことを、小さく試す場所。報酬はすべて目安です。</p></div>' +
      mineBlock(ctx, type) +
      '<section class="gg-board">' +
        '<h2 class="sec-ttl">募集中の案件</h2>' +
        filterBlock(type) + listBody(type) +
      '</section>' +
      safeNote() +
    '</div>';
  }

  /* ---------- くわしく ---------- */
  function actionBlock(g, lk, st) {
    var refer = g.type === 'refer', label = refer ? '担当者につなぐ' : '応募する';
    if (st && st.status === 'done') {
      return '<div class="notice notice-ok gd-done">' + icon('checkc') + '<div><b>やり終えました</b>' +
          (st.doneAt ? '<span class="xsmall">（' + esc(U.fmtDate(st.doneAt, { noYear: true, wd: false })) + '）</span>' : '') + '<br>' +
          (st.reward ? '確定した報酬 <b class="num">' + U.yen(st.reward) + '</b>' : '報酬は運営が確認しています') + '</div></div>' +
        '<a class="btn btn-soft btn-block" href="#/gigs?type=' + esc(g.type) + '">同じ種類の案件を見る</a>';
    }
    if (st && st.status === 'applied') {
      return '<div class="gd-status">' + statusTag(st) + '</div>' +
        '<p class="gd-status__txt">' + esc(U.fmtDate(st.at, { noYear: true })) + 'に' + (refer ? '担当者へのつなぎを頼みました' : '応募しました') +
          '。運営から2営業日以内に連絡します。</p>' +
        (st.note ? '<div class="gd-sent"><p class="gd-sent__label">送った内容</p><p>' + U.nl2br(st.note) + '</p></div>' : '') +
        '<a class="btn btn-soft btn-block" href="#/messages">' + icon('message', 'ico-s') + '運営に問い合わせる</a>' +
        '<button type="button" class="btn btn-text gd-withdraw" data-gg="withdraw" data-id="' + esc(g.id) + '">応募を取り消す</button>' +
        '<p class="gd-act__note gd-act__center">運営から連絡が届くまでは、ここから取り消せます。</p>';
    }
    if (st) {
      return '<div class="gd-status">' + statusTag(st) + '</div>' +
        '<p class="gd-status__txt">運営からの連絡は「相談・メッセージ」に届きます。</p>' +
        '<a class="btn btn-soft btn-block" href="#/messages">' + icon('message', 'ico-s') + 'メッセージを開く</a>';
    }
    if (lk.locked) {
      // 押せない朱のボタンは「押してほしいもの」に見えてしまうので、鍵つきの灰色にする
      return '<button type="button" class="btn btn-soft btn-l btn-block" disabled>' + icon('lock', 'ico-s') + label + '</button>' +
        '<div class="gd-lock">' + icon('lock', 'ico-s') + '<div><p class="gd-lock__why">' + esc(lk.reason) + '</p>' +
          (lk.sub ? '<p class="gd-lock__sub">' + esc(lk.sub) + '</p>' : '') +
          (lk.also ? '<p class="gd-lock__sub">' + esc(lk.also) + '</p>' : '') + '</div></div>' +
        (lk.course
          ? '<a class="btn btn-ghost btn-block" href="#/courses/' + esc(lk.course) + '">' + icon('play', 'ico-s') + '講座を見る</a>'
          : '<button type="button" class="btn btn-ghost btn-block" data-gg="level">' + icon('info', 'ico-s') + 'レベルのしくみを見る</button>');
    }
    return '<button type="button" class="btn btn-primary btn-l btn-block" data-gg="apply" data-id="' + esc(g.id) + '">' + label + '</button>' +
      '<p class="gd-act__note">' + (refer ? '紹介先の了承を得てから押してください。' : '') +
        (g.type === 'peer' ? '送った内容は、運営から募集した会員にお渡しします。条件のやりとりは会員どうしで行います。' : '') +
        '送ったあと、運営から2営業日以内に連絡します。連絡が届くまでは取り消せます。</p>';
  }

  function rewardCard(g, lk, st) {
    var rt = rtLabel(g);
    var caution = g.type === 'refer'
      ? '紹介先との契約の内容によって変わります。契約や稼働に至らなければ、報酬はありません。'
      : '作業の量や内容によって変わります。お約束する金額ではありません。';
    return '<div class="card gd-reward">' +
      '<p class="gd-reward__label">報酬の目安</p>' +
      '<p class="gd-reward__amt">' + esc(g.reward) + '</p>' +
      (rt ? '<p class="gd-reward__type"><span class="tag tag-line">' + esc(rt) + '</span></p>' : '') +
      '<p class="gd-reward__note">' + caution + '</p>' +
      '<div class="gd-act">' + actionBlock(g, lk, st) + '</div>' +
    '</div>';
  }

  function hostCell(p) {
    var sub = p.staff ? '運営・' + (p.role || 'スタッフ') : '会員' + (p.area ? '・' + p.area : '');
    return '<span class="gd-host">' + U.avatar(p, 's') + '<span><b>' + esc(p.name) + '</b><small>' + esc(sub) + '</small></span></span>';
  }

  function reqCell(g, lk) {
    var c = g.requires ? R.course(g.requires) : null;
    return '<span class="gd-req">Lv' + esc(g.level) + '「' + esc(R.levelName(g.level)) + '」から</span>' +
      (c ? '<span class="gd-req">講座「<a href="#/courses/' + esc(c.id) + '">' + esc(c.title) + '</a>」の修了</span>' : '') +
      (lk.locked
        ? '<span class="lockmark gd-mark">' + icon('lock', 'ico-s') + 'まだ満たしていません</span>'
        : '<span class="gd-met gd-mark">' + icon('check', 'ico-s') + '満たしています</span>');
  }

  function renderDetail(ctx, g) {
    var t = typeOf(g), lk = lockOf(g), st = R.gigState(g.id), p = R.person(g.by), tp = timePlace(g);
    var refer = g.type === 'refer', rt = rtLabel(g);
    var steps = g.steps || (refer ? REFER_STEPS : null);
    var related = sorted(DATA.GIGS.filter(function (x) { return x.type === g.type && x.id !== g.id; })).slice(0, 3);

    var tags = '<span class="tag">' + esc(t.name) + '</span>' +
      (g.isNew ? '<span class="tag tag-accent">新着</span>' : '') +
      '<span class="tag tag-line">' + (g.remote ? '在宅OK' : '現地' + (tp.place ? '・' + esc(tp.place) : '')) + '</span>';
    // 応募の状態は、すぐ下の「報酬と応募」の面に出す（ここに重ねない）

    var note = '';
    if (refer) {
      note = '<div class="notice gd-notice">' + icon('link') + '<div>' +
        '<b>つなぐだけ（トスアップ）。</b>商談と契約は担当者が行います。紹介先の了承を得てからにしてください。<br>' +
        'SNSで紹介するときは「#PR」など、紹介の報酬があることが分かるように書いてください。</div></div>';
    } else if (g.type === 'peer') {
      note = '<div class="notice gd-notice">' + icon('users') + '<div>' +
        '会員どうしの募集です。手数料はかかりません。運営は仲介しませんが、困ったときは<a href="#/messages">運営に相談</a>できます。</div></div>';
    }

    var kv = [
      ['報酬', '<b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '')],
      ['所要時間', esc(tp.time || '—')],
      ['働き方', g.remote ? '在宅OK（家で完結します）' : '現地で作業' + (tp.place ? '（' + esc(tp.place) + '）' : '')],
      ['募集', esc(slotsLong(g))],
      ['掲載元', hostCell(p)],
      ['応募の条件', reqCell(g, lk)]
    ];

    return '<div class="scr-gigs">' +
      '<nav class="crumb" aria-label="現在地"><a href="#/gigs">案件</a>' + U.chevron() +
        '<a href="#/gigs?type=' + esc(g.type) + '">' + esc(t.name) + '</a></nav>' +
      '<div class="page-head gd-head">' +
        '<div class="gd-tags">' + tags + '</div>' +
        '<h1 class="page-ttl">' + esc(g.title) + '</h1>' +
      '</div>' +
      '<div class="gd">' +
        '<aside class="gd__side" aria-label="報酬と応募">' + rewardCard(g, lk, st) + '</aside>' +
        '<div class="gd__main">' +
          '<section class="gd-sec"><h2 class="sec-ttl">どんな案件か</h2>' +
            '<div class="card card-pad"><p class="gd-desc">' + U.nl2br(g.desc) + '</p></div>' + note + '</section>' +
          '<section class="gd-sec"><h2 class="sec-ttl">条件</h2>' +
            '<div class="card gd-kvcard"><table class="kv gd-kv"><tbody>' + kv.map(function (r) {
              return '<tr><th scope="row">' + r[0] + '</th><td>' + r[1] + '</td></tr>';
            }).join('') + '</tbody></table></div></section>' +
          (steps ? '<section class="gd-sec"><h2 class="sec-ttl">' + (refer && !g.steps ? 'つなぐまでの流れ' : '進め方') + '</h2>' +
            '<div class="card card-pad"><ol class="gd-steps">' + steps.map(function (s) {
              return '<li>' + esc(s) + '</li>';
            }).join('') + '</ol></div></section>' : '') +
          (related.length ? '<section class="gd-sec"><h2 class="sec-ttl">同じ種類の案件<a href="#/gigs?type=' + esc(g.type) + '">すべて見る</a></h2>' +
            '<div class="list">' + related.map(function (x) {
              var xs = R.gigState(x.id), xl = R.gigLock(x).locked;
              return '<a class="li" href="#/gigs/' + esc(x.id) + '"><span class="li__body">' +
                '<span class="li__ttl">' + esc(x.title) + '</span>' +
                '<span class="li__sub">' + esc(x.reward) + '（目安）' +
                  (xs ? '・' + esc(xs.label || '応募済み') : xl ? '・まだ応募できません' : '') + '</span></span>' +
                (xl && !xs ? '<span class="li__end">' + icon('lock', 'ico-s') + '</span>' : '') +
                U.chevron() + '</a>';
            }).join('') + '</div></section>' : '') +
        '</div>' +
      '</div>' +
      safeNote() +
    '</div>';
  }

  function renderMissing() {
    return '<div class="scr-gigs">' +
      '<nav class="crumb" aria-label="現在地"><a href="#/gigs">案件</a></nav>' +
      '<div class="card">' + U.empty('briefcase', 'この案件は見つかりませんでした。掲載が終わったか、URLがまちがっている可能性があります。') + '</div>' +
      '<p style="margin-top:16px"><a class="btn btn-soft" href="#/gigs">' + icon('back', 'ico-s') + '案件の一覧へ</a></p>' +
    '</div>';
  }

  /* ---------- 応募の窓 ---------- */
  function openApply(g) {
    if (!g) return;
    var refer = g.type === 'refer', label = refer ? '担当者につなぐ' : '応募する', rt = rtLabel(g);
    var fields = refer
      ? '<div class="notice gg-apply__notice">' + icon('info') + '<div>紹介先の了承を得てから送ってください。商談と契約は担当者が行います。</div></div>' +
        '<label class="field"><span>紹介先（会社・お店の名前）<em class="gg-apply__req">必須</em></span>' +
          '<input class="input" name="to" maxlength="60" autocomplete="off" placeholder="例：〇〇整骨院"></label>' +
        '<label class="field"><span>あなたとの関係</span>' +
          '<input class="input" name="rel" maxlength="60" autocomplete="off" placeholder="例：学生時代の友人が経営しています"></label>' +
        '<label class="field"><span>メモ</span>' +
          '<textarea class="textarea" name="memo" maxlength="400" placeholder="例：ホームページを作り直したいと話していました。連絡は平日の昼が都合がよいそうです。"></textarea>' +
          '<small>担当者が最初に連絡するときの参考にします。</small></label>'
      : '<label class="field"><span>ひとこと（参加できる時間帯など）</span>' +
          '<textarea class="textarea" name="note" maxlength="400" placeholder="' + esc(PLACEHOLDER[g.type] || PLACEHOLDER.small) + '"></textarea>' +
          '<small>空欄のままでも応募できます。' +
            (g.type === 'peer' ? '送った内容は、運営から募集した会員にお渡しします。' : '') + '</small></label>';

    var m = U.modal(
      '<div class="scr-gigs gg-apply">' +
        '<p class="gg-apply__eyebrow">' + (refer ? '担当者につなぐ' : 'この案件に応募する') + '</p>' +
        '<h3 class="modal__ttl">' + esc(g.title) + '</h3>' +
        '<p class="gg-apply__reward">報酬 <b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '') + '</p>' +
        '<form class="gg-apply__form" novalidate>' + fields +
          '<label class="check gg-apply__check"><input type="checkbox" name="ok">' +
            '<span>報酬は目安で、成果を保証するものではないことを確認しました</span></label>' +
          '<p class="gg-apply__hint" aria-live="polite"></p>' +
          '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
            '<button type="submit" class="btn btn-primary" disabled>' + label + '</button></div>' +
        '</form>' +
      '</div>');

    var form = m.querySelector('form'), submit = form.querySelector('[type="submit"]'), hint = form.querySelector('.gg-apply__hint');
    function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
    function problem() {
      if (refer && !val('to')) return '紹介先の名前を入れてください。';
      if (!form.elements.ok.checked) return '確認のチェックを入れると送れます。';
      return '';
    }
    function sync() { var p = problem(); submit.disabled = !!p; hint.textContent = p; }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (problem()) { sync(); return; }
      var note = refer
        ? [['紹介先', val('to')], ['あなたとの関係', val('rel')], ['メモ', val('memo')]]
            .filter(function (x) { return x[1]; })
            .map(function (x) { return x[0] + '：' + x[1]; }).join('\n')
        : val('note');
      var result = R.applyGig(g.id, note);
      m.close();
      if (!result) {
        U.toast('応募できませんでした。条件をもう一度ご確認ください');
        CLG.app.refresh();
        return;
      }
      CLG.app.reward(result);
      U.toast(refer ? '受け付けました。運営から2営業日以内に連絡します' : '応募しました。運営から2営業日以内に連絡します', 'ok');
      CLG.app.refresh();
    });
  }

  function withdraw(g) {
    if (!g) return;
    U.confirmBox('応募を取り消しますか',
      '「' + g.title + '」への応募を取り消します。\n取り消したあとも、もう一度応募できます。', '取り消す', true)
      .then(function (ok) {
        if (!ok) return;
        R.withdrawGig(g.id);
        // withdrawGig は「確認中」のときだけ消す。消えていなければ、そのことをそのまま伝える
        U.toast(R.gigState(g.id)
          ? '運営の確認が進んでいるため、取り消せませんでした。相談・メッセージからお知らせください'
          : '応募を取り消しました');
        CLG.app.refresh();
      });
  }

  CLG.screens.gigs = {
    title: function (ctx) {
      var g = ctx.params && ctx.params[0] ? R.gig(ctx.params[0]) : null;
      return g ? g.title : '案件';
    },
    render: function (ctx) {
      var id = ctx.params && ctx.params[0];
      if (id) { var g = R.gig(id); return g ? renderDetail(ctx, g) : renderMissing(); }
      return renderList(ctx);
    },
    mount: function (root) {
      // root（#view）はどの画面でも同じ要素。付けるのは1回だけにし、案件の画面の中の押下だけを拾う
      if (root.__boundGigs) return;
      root.__boundGigs = true;
      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-gg]');
        if (!b || b.disabled || !b.closest('.scr-gigs')) return;
        var act = b.getAttribute('data-gg'), id = b.getAttribute('data-id');
        if (act === 'type') {
          var ty = b.getAttribute('data-type');
          CLG.app.go('#/gigs' + (ty ? '?type=' + encodeURIComponent(ty) : ''));
        } else if (act === 'apply') openApply(R.gig(id));
        else if (act === 'withdraw') withdraw(R.gig(id));
        else if (act === 'level') CLG.app.levelInfo();
        else if (act === 'post') U.toast('本番では、募集の内容を書いて送ると、運営が確認してから掲載します');
      });
    }
  };
})();
