/* ============================================================
   案件（#/gigs 一覧・#/gigs/<id> くわしく）
   ------------------------------------------------------------
   - 報酬はすべて「目安」と書く。収入を約束・断定する言い方はしない。
   - 応募できるかどうかは R.gigLock（レベルと講座の修了）で決まる。画面では判定しない。
   - 種類の絞り込みは #/gigs?type=small のように URL に持つ（戻る・共有で同じ画面になるように）。
   - 一覧は求人サイトの一覧と同じ組み方：題・報酬・「15分・在宅・随時募集」の1行。札は1行に1つまで。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;

  var TYPES = {};
  DATA.GIG_TYPES.forEach(function (t) { TYPES[t.id] = t; });
  var RT = { shot: '1回ごと', stock: '毎月' };
  /* 札に出す短い名前（domain.js の label は文で使う） */
  var STATUS_SHORT = { applied: '応募済み', meeting: '面談調整中', active: '稼働中', done: '完了' };
  var STATUS_TAG = { applied: 'tag-indigo', meeting: 'tag-indigo', active: 'tag-ok', done: 'tag-ok' };
  var PLACEHOLDER = {
    small: '例：平日の21時以降なら作業できます。',
    work: '例：講座を修了しました。平日の夜と土曜の午前に作業できます。',
    peer: '例：市内に住んでいます。土日の午前なら伺えます。'
  };
  /* 紹介できる商材に手順が書かれていないときの流れ */
  var REFER_STEPS = [
    '紹介先に「担当者から連絡してよいか」の了承をもらう',
    '「担当者につなぐ」から紹介先を知らせる',
    '担当者が商談と契約を行う（同席はいりません）',
    '条件を満たすと報酬が確定'
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
    if (!s || s === '—') return '制限なし';
    return s;
  }
  /* 支払いの単位。「1件 500円」「月 24,000円」「（継続中は毎月）」のように報酬の文で分かるときは書かない */
  function rtLabel(g) {
    var rt = RT[g.rewardType] || '', r = String(g.reward || '');
    if (!rt || r.indexOf(rt) >= 0) return '';
    if (g.rewardType === 'shot' && /^1\S/.test(r)) return '';
    if (g.rewardType === 'stock' && /^月/.test(r)) return '';
    return rt;
  }
  function shortStatus(g, st) {
    if (st.status === 'applied' && g.type === 'refer') return '依頼済み';
    return STATUS_SHORT[st.status] || '応募済み';
  }
  function statusTag(g, st) {
    return '<span class="tag ' + (STATUS_TAG[st.status] || 'tag-indigo') + '">' + esc(shortStatus(g, st)) + '</span>';
  }

  /** 鍵の理由に「あと何をすれば開くか」を足す */
  function lockOf(g) {
    var lk = R.gigLock(g);
    if (!lk.locked) return lk;
    var out = { locked: true, reason: lk.reason, course: lk.course || null, sub: '' };
    if (lk.course) {
      var cs = R.courseState(lk.course);
      out.sub = cs.locked ? '講座は' + cs.lockReason : cs.done + '/' + cs.total + '本';
    } else {
      // レベルが足りないときは XP だけ書く（講座の条件は「募集要項」の応募条件に出る）
      var need = levelMin(g.level) - R.xp();
      if (need > 0) out.sub = 'あと' + U.num(need) + ' XP';
    }
    return out;
  }
  /** 「講座「Instagram運用」の修了で応募できます（0/5本）」の1文 */
  function lockText(lk) {
    return lk.reason + (lk.sub ? '（' + lk.sub + '）' : '');
  }

  function postBtn() {
    return '<button type="button" class="btn btn-ghost btn-s gg-post" data-gg="post">' + icon('plus', 'ico-s') + '募集を出す</button>';
  }

  /* ---------- 一覧の1行 ---------- */
  /** h: 題の見出しの段（種類ごとの見出しの下では h4、絞り込み中は h3） */
  function item(g, h) {
    var lk = lockOf(g), st = R.gigState(g.id), tp = timePlace(g);
    h = h || 'h3';
    // 紹介の案件は所要時間が「つなぐだけ」しかなく、題と報酬で足りるので条件の行を出さない
    var meta = [];
    if (g.type !== 'refer') {
      if (tp.time) meta.push(tp.time);
      meta.push(g.remote ? '在宅' : (tp.place || '現地'));
    }
    var sl = slotsShort(g);
    if (sl) meta.push(sl);

    // 札は1つだけ。応募の状態があればそれ、なければ新着
    var tag = st ? statusTag(g, st) : g.isNew ? '<span class="tag tag-accent">新着</span>' : '';

    var lockRow = '';
    if (lk.locked) {
      lockRow = '<p class="gg-item__lock">' + esc(lockText(lk)) + ' ' +
        (lk.course
          ? '<a class="gg-item__go" href="#/courses/' + esc(lk.course) + '">講座を見る</a>'
          : '<button type="button" class="gg-item__go" data-gg="level">レベルのしくみ</button>') +
      '</p>';
    }

    return '<article class="gg-item' + (lk.locked ? ' is-locked' : '') + '">' +
      '<' + h + ' class="gg-item__ttl"><a class="gg-item__link" href="#/gigs/' + esc(g.id) + '">' + esc(g.title) + '</a>' +
        (tag ? ' ' + tag : '') + '</' + h + '>' +
      '<p class="gg-item__pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p>' +
      (meta.length ? '<p class="gg-item__meta">' + esc(meta.join('・')) + '</p>' : '') +
      lockRow +
      U.chevron() +
    '</article>';
  }

  function itemList(list, h) {
    return '<div class="list gg-list">' + list.map(function (g) { return item(g, h); }).join('') + '</div>';
  }

  /* ---------- 応募した案件 ---------- */
  function mineRow(r) {
    var st = r.st, done = st.status === 'done';
    var when = done && st.doneAt ? U.fmtShort(st.doneAt) + 'に完了' : U.fmtShort(st.at) + 'に応募';
    return '<a class="li gg-mine__row" href="#/gigs/' + esc(r.g.id) + '">' +
      '<span class="li__body"><span class="li__ttl">' + esc(r.g.title) + '</span>' +
        '<span class="li__sub">' + esc(when) +
          (done && st.reward ? '・報酬 ' + U.yen(st.reward) : '') + '</span></span>' +
      '<span class="li__end">' + statusTag(r.g, st) + '</span>' +
      U.chevron() + '</a>';
  }

  function mineBlock(ctx) {
    var gigs = (ctx.state || CLG.store.state).gigs || {};
    var rows = Object.keys(gigs).filter(function (id) { return R.gig(id); })
      .map(function (id) { return { g: R.gig(id), st: R.gigState(id) }; });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return new Date(b.st.doneAt || b.st.at) - new Date(a.st.doneAt || a.st.at); });
    var earned = R.gigEarnings();
    return '<section class="gg-mine">' +
      '<h2 class="gg-h2">応募した案件</h2>' +
      '<div class="list">' + rows.map(mineRow).join('') +
        (earned ? '<div class="gg-mine__total"><span>確定した報酬の合計</span><b class="num">' + U.yen(earned) + '</b></div>' : '') +
      '</div></section>';
  }

  /* ---------- 絞り込みと一覧 ---------- */
  function filterBlock(type) {
    var chips = [['', 'すべて', DATA.GIGS.length]].concat(DATA.GIG_TYPES.map(function (t) {
      return [t.id, t.name, gigsOf(t.id).length];
    }));
    return '<div class="chips gg-filter" role="group" aria-label="案件の種類">' + chips.map(function (c) {
      var on = c[0] === type;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-gg="type" data-type="' + esc(c[0]) + '" aria-pressed="' + on + '">' +
        esc(c[1]) + '<span class="n num">' + c[2] + '</span></button>';
    }).join('') + '</div>';
  }

  function listBody(type) {
    if (type) {
      var items = sorted(gigsOf(type));
      return (type === 'peer' ? '<div class="gg-postrow">' + postBtn() + '</div>' : '') +
        (items.length ? itemList(items, 'h3')
          : '<div class="card">' + U.empty('', '募集中の案件はありません。') + '</div>');
    }
    return DATA.GIG_TYPES.map(function (t) {
      var items = sorted(gigsOf(t.id));
      if (!items.length) return '';
      return '<section class="gg-group">' +
        '<div class="gg-group__head"><h3 class="gg-group__ttl">' + esc(t.name) + '</h3>' +
          (t.id === 'peer' ? postBtn() : '') + '</div>' +
        itemList(items, 'h4') + '</section>';
    }).join('');
  }

  function renderList(ctx) {
    var q = ctx.query || {};
    var type = TYPES[q.type] ? q.type : '';
    return '<div class="scr-gigs">' +
      '<div class="page-head"><h1 class="page-ttl">案件</h1></div>' +
      mineBlock(ctx) +
      '<section class="gg-board">' +
        '<h2 class="gg-h2">募集中の案件</h2>' +
        filterBlock(type) + listBody(type) +
      '</section>' +
      '<p class="gg-safe">投資・FX・暗号資産・借入が必要な案件は載せていません。あやしい案件を見つけたら<a href="#/messages">運営に知らせてください</a>。</p>' +
    '</div>';
  }

  /* ---------- くわしく ---------- */
  function actionBlock(g, lk, st) {
    var refer = g.type === 'refer', label = refer ? '担当者につなぐ' : '応募する';
    if (st && st.status === 'done') {
      return '<p class="gd-state"><b>完了</b>' +
          (st.doneAt ? '（' + esc(U.fmtDate(st.doneAt, { noYear: true, wd: false })) + '）' : '') + '<br>' +
          (st.reward ? '確定した報酬 <b class="num">' + U.yen(st.reward) + '</b>' : '報酬は運営が確認しています') + '</p>' +
        '<a class="btn btn-soft btn-block" href="#/gigs?type=' + esc(g.type) + '">同じ種類の案件を見る</a>';
    }
    if (st && st.status === 'applied') {
      return '<p class="gd-state"><b>' + esc(U.fmtDate(st.at, { noYear: true })) + 'に' + (refer ? '依頼しました' : '応募しました') + '</b><br>' +
          '運営から2営業日以内に連絡します。</p>' +
        (st.note ? '<div class="gd-sent"><p class="gd-sent__label">送った内容</p><p>' + U.nl2br(st.note) + '</p></div>' : '') +
        '<a class="btn btn-soft btn-block" href="#/messages">運営に問い合わせる</a>' +
        '<button type="button" class="btn btn-text gd-withdraw" data-gg="withdraw" data-id="' + esc(g.id) + '">' + (refer ? '依頼' : '応募') + 'を取り消す</button>';
    }
    if (st) {
      return '<p class="gd-state"><b>' + esc(st.label || shortStatus(g, st)) + '</b></p>' +
        '<a class="btn btn-soft btn-block" href="#/messages">メッセージを見る</a>';
    }
    if (lk.locked) {
      return '<p class="gd-state">' + esc(lockText(lk)) + '</p>' +
        (lk.course
          ? '<a class="btn btn-soft btn-block" href="#/courses/' + esc(lk.course) + '">講座を見る</a>'
          : '<button type="button" class="btn btn-soft btn-block" data-gg="level">レベルのしくみ</button>');
    }
    return '<button type="button" class="btn btn-primary btn-l btn-block" data-gg="apply" data-id="' + esc(g.id) + '">' + label + '</button>';
  }

  function sideCard(g, lk, st) {
    // 「目安」は金額の横に書いてあるので、紹介の「契約しなければ出ない」だけを足す（完了したあとは出さない）
    var caution = g.type === 'refer' && !(st && st.status === 'done')
      ? '<p class="gd-pay__note">契約に至らなければ報酬は出ません。</p>' : '';
    return '<div class="card gd-side">' +
      '<p class="gd-pay"><b>' + esc(g.reward) + '</b><span>（目安）</span></p>' + caution +
      '<div class="gd-act">' + actionBlock(g, lk, st) + '</div>' +
    '</div>';
  }

  function hostText(p) {
    var sub = p.staff ? '運営' : '会員' + (p.area ? '・' + p.area : '');
    return esc(p.name) + '（' + esc(sub) + '）';
  }

  function reqText(g) {
    var c = g.requires ? R.course(g.requires) : null;
    return 'Lv' + esc(g.level) + '「' + esc(R.levelName(g.level)) + '」から' +
      (c ? '<br>講座「<a href="#/courses/' + esc(c.id) + '">' + esc(c.title) + '</a>」の修了' : '');
  }

  function renderDetail(ctx, g) {
    var t = typeOf(g), lk = lockOf(g), st = R.gigState(g.id), p = R.person(g.by), tp = timePlace(g);
    var refer = g.type === 'refer', rt = rtLabel(g);
    var steps = g.steps || (refer ? REFER_STEPS : null);
    var related = sorted(DATA.GIGS.filter(function (x) { return x.type === g.type && x.id !== g.id; })).slice(0, 3);

    var note = '';
    if (refer) {
      note = '<p class="gd-note">※紹介先の了承を取ってから依頼してください。SNSで紹介するときは「#PR」を付けて、報酬があることが分かるように書いてください。</p>';
    } else if (g.type === 'peer') {
      note = '<p class="gd-note">※会員どうしの募集です（手数料なし）。条件は募集した会員と直接決め、困ったときは<a href="#/messages">運営に相談</a>してください。</p>';
    }

    // 紹介は「作業：つなぐだけ」になり、説明文と「流れ」で言っていることの繰り返しなので行を作らない
    var kv = [['報酬', '<b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '')]];
    if (!refer) {
      kv.push(['作業時間', esc(tp.time || '—')]);
      kv.push(['場所', g.remote ? '在宅' : '現地' + (tp.place ? '（' + esc(tp.place) + '）' : '')]);
    }
    kv.push(['募集人数', esc(slotsLong(g))], ['掲載', hostText(p)], ['応募条件', reqText(g)]);
    if (steps) {
      kv.push([refer && !g.steps ? '流れ' : '進め方', '<ol class="gd-steps">' + steps.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol>']);
    }

    return '<div class="scr-gigs">' +
      '<nav class="crumb" aria-label="現在地"><a href="#/gigs">案件</a>' + U.chevron() +
        '<a href="#/gigs?type=' + esc(g.type) + '">' + esc(t.name) + '</a></nav>' +
      '<div class="page-head gd-head"><h1 class="page-ttl">' + esc(g.title) + '</h1></div>' +
      '<div class="gd">' +
        '<aside class="gd__side" aria-label="報酬と応募">' + sideCard(g, lk, st) + '</aside>' +
        '<div class="gd__main">' +
          '<div class="card gd-body">' +
            '<p class="gd-desc">' + U.nl2br(g.desc) + '</p>' + note +
            '<h2 class="gd-h">募集要項</h2>' +
            '<table class="kv gd-kv"><tbody>' + kv.map(function (r) {
              return '<tr><th scope="row">' + r[0] + '</th><td>' + r[1] + '</td></tr>';
            }).join('') + '</tbody></table>' +
          '</div>' +
          (related.length ? '<section class="gd-related"><h2 class="sec-ttl">同じ種類の案件<a href="#/gigs?type=' + esc(g.type) + '">すべて見る</a></h2>' +
            '<div class="list">' + related.map(function (x) {
              var xs = R.gigState(x.id), xl = R.gigLock(x).locked;
              return '<a class="li" href="#/gigs/' + esc(x.id) + '"><span class="li__body">' +
                '<span class="li__ttl">' + esc(x.title) + '</span>' +
                '<span class="li__sub">' + esc(x.reward) + '（目安）' +
                  (xs ? '・' + esc(shortStatus(x, xs)) : xl ? '・まだ応募できません' : '') + '</span></span>' +
                U.chevron() + '</a>';
            }).join('') + '</div></section>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderMissing() {
    return '<div class="scr-gigs">' +
      '<nav class="crumb" aria-label="現在地"><a href="#/gigs">案件</a></nav>' +
      '<div class="card">' + U.empty('', 'この案件は見つかりません。掲載が終わった可能性があります。') + '</div>' +
      '<p style="margin-top:16px"><a class="btn btn-soft" href="#/gigs">案件の一覧へ</a></p>' +
    '</div>';
  }

  /* ---------- 応募の窓 ---------- */
  function openApply(g) {
    if (!g) return;
    var refer = g.type === 'refer', label = refer ? '担当者につなぐ' : '応募する', rt = rtLabel(g);
    var fields = refer
      ? '<p class="gg-apply__lead">紹介先の了承を取ってから送ってください。</p>' +
        '<label class="field"><span>紹介先の会社・お店の名前（必須）</span>' +
          '<input class="input" name="to" maxlength="60" autocomplete="off" placeholder="例：〇〇整骨院"></label>' +
        '<label class="field"><span>紹介先との関係</span>' +
          '<input class="input" name="rel" maxlength="60" autocomplete="off" placeholder="例：学生時代の友人が経営しています"></label>' +
        '<label class="field"><span>担当者へのメモ</span>' +
          '<textarea class="textarea" name="memo" maxlength="400" placeholder="例：ホームページを作り直したいと話していました。連絡は平日の昼が都合がよいそうです。"></textarea></label>'
      : '<label class="field"><span>' + (g.type === 'peer' ? 'ひとこと（任意・募集した会員に届きます）' : 'ひとこと（任意）') + '</span>' +
          '<textarea class="textarea" name="note" maxlength="400" placeholder="' + esc(PLACEHOLDER[g.type] || PLACEHOLDER.small) + '"></textarea></label>';

    var m = U.modal(
      '<div class="scr-gigs gg-apply">' +
        '<h3 class="modal__ttl">' + esc(g.title) + '</h3>' +
        '<p class="gg-apply__reward">報酬 <b>' + esc(g.reward) + '</b>（目安）' + (rt ? '・' + esc(rt) : '') + '</p>' +
        '<form class="gg-apply__form" novalidate>' + fields +
          '<label class="check gg-apply__check"><input type="checkbox" name="ok">' +
            '<span>報酬は目安で、成果を保証するものではないことを確認しました</span></label>' +
          '<p class="gg-apply__hint" aria-live="polite"></p>' +
          '<div class="modal__foot"><button type="button" class="btn btn-soft" data-close>やめる</button>' +
            '<button type="submit" class="btn btn-primary">' + label + '</button></div>' +
        '</form>' +
      '</div>');

    var form = m.querySelector('form'), hint = form.querySelector('.gg-apply__hint'), tried = false;
    function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
    function problem() {
      if (refer && !val('to')) return { msg: '紹介先の名前を入れてください。', el: form.elements.to };
      if (!form.elements.ok.checked) return { msg: '確認のチェックを入れてください。', el: form.elements.ok };
      return null;
    }
    // 間違いは送ろうとしたときに初めて出す。そのあとは直すたびに消える
    function sync() { if (!tried) return; var p = problem(); hint.textContent = p ? p.msg : ''; }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = problem();
      if (p) { tried = true; sync(); if (p.el && p.el.focus) p.el.focus(); return; }
      var note = refer
        ? [['紹介先', val('to')], ['関係', val('rel')], ['メモ', val('memo')]]
            .filter(function (x) { return x[1]; })
            .map(function (x) { return x[0] + '：' + x[1]; }).join('\n')
        : val('note');
      var result = R.applyGig(g.id, note);
      m.close();
      if (!result) {
        U.toast('応募できませんでした。条件をもう一度確認してください');
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
    var w = g.type === 'refer' ? '依頼' : '応募';
    U.confirmBox(w + 'を取り消しますか',
      '「' + g.title + '」への' + w + 'を取り消します。あとでまた' + w + 'できます。', '取り消す', true)
      .then(function (ok) {
        if (!ok) return;
        R.withdrawGig(g.id);
        // withdrawGig は「確認中」のときだけ消す。消えていなければ、そのことをそのまま伝える
        U.toast(R.gigState(g.id)
          ? '運営の確認が進んでいるため取り消せませんでした。相談・メッセージから連絡してください'
          : w + 'を取り消しました');
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
        else if (act === 'post') U.toast('本番ではここから募集を出せます。運営が確認してから載せます');
      });
    }
  };
})();
