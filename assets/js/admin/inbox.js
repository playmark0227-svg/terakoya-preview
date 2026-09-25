/* ============================================================
   運営画面：メッセージ（#/inbox）
   ------------------------------------------------------------
   #/inbox                    やりとりの一覧（未返信 → 対応中 → 完了の順。未返信は待っている時間の長い順）
                              ?status=open|doing|done  ?kind=質問…|専門家|運営から  ?staff=me|none|<staff id>  ?q=
   #/inbox/<id>               1件（デモ会員は live）。左にやりとりと返信の欄、右に会員・状態と担当・面談・専門家
   #/inbox?view=slots         面談の枠（毎週の枠・休みの日・これから2週間の予約）
   #/inbox?view=experts       専門家への引き継ぎ（受付 → 日程調整 → 予約確定 → 相談済み）
   返信は AD.ops.reply(id, 文)。live は R.staffReply なので、開いている会員ページのタブに1秒以内に届く。
   運営のメモ（会員には見えない）は thread.notes / liveThread.notes に足し、やりとりの中に時刻の順で出す。
   面談の枠は AD.ops.meetSlots で直す（運営画面の保存と、会員ページの面談の候補 R.setMeetingSlots の両方）。
   役割（会員・メッセージ）：代表・運営は全部。講師は「講座の質問」のやりとりだけ返信・対応できる。経理は見るだけ。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon, P = AD.people;
  var cur = null, mode = 'reply', modeFor = null;
  var KINDS = DATA.MESSAGE_KINDS.concat(['専門家', '運営から']);
  var STEPS = R.EXPERT_STEPS || ['受付', '日程調整', '予約確定', '相談済み'];

  function nowIso() { return CLG.now().toISOString(); }
  /* 役割：このやりとりに返信・対応できるか（講師は講座の質問だけ） */
  function canT(t) { return AU.can('members', { kind: t && t.kind }); }
  function byId(list, id) { for (var i = 0; list && i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function staffId() { var s = AD.db.staff(); return s ? s.id : AD.db.DEMO_STAFF; }
  function who(t) { return AD.data.member(t.no) || { no: t.no, name: t.no, realName: t.no }; }
  function staffName(id) { return (DATA.PEOPLE[id] && DATA.PEOPLE[id].name) || AD.db.staffName(id); }
  function fromName(id, t) { return id === 'member' ? who(t).name : staffName(id); }
  function prio(t) {
    var rank = { open: 0, doing: 1, done: 2 }[t.status] || 0;
    var at = new Date(t.status === 'open' ? (t.waitingSince || t.updatedAt) : t.updatedAt || 0).getTime() || 0;
    // 未返信は古い順（待たせている順）、ほかは新しい順
    return rank * 1e13 + (t.status === 'open' ? at : 1e13 - at);
  }
  function whenText(at) { return DATA.mdw(at) + ' ' + DATA.hm(at); }
  function dayText(at) { var d = new Date(at); return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + P.WD[d.getDay()] + ')'; }
  function headSub(ctx) {
    var rows = ctx.data.threads();
    var open = rows.filter(function (t) { return t.status === 'open'; });
    var over = open.filter(function (t) { return t.waitingSince && AU.age(t.waitingSince).over; }).length;
    var doing = rows.filter(function (t) { return t.status === 'doing'; }).length;
    return '未返信 <b class="num">' + open.length + '</b>件' + (over ? '（<span class="a-ib__over">24時間を過ぎた ' + over + '件</span>）' : '') +
      '・対応中 <b class="num">' + doing + '</b>件・' + esc(DATA.SITE.replySla);
  }
  function tabsHtml(ctx, view) {
    var th = ctx.data.threads(), open = th.filter(function (t) { return t.status === 'open'; }).length;
    var over = th.filter(function (t) { return t.status === 'open' && t.waitingSince && AU.age(t.waitingSince).over; }).length;
    var ex = ctx.data.queues().experts.filter(function (x) { return x.status === '受付' || x.status === '日程調整'; }).length;
    return AU.tabs([
      { id: 'list', label: 'メッセージ', href: '#/inbox', n: open || '', alert: over > 0 },
      { id: 'slots', label: '面談の枠', href: '#/inbox?view=slots' },
      { id: 'experts', label: '専門家への引き継ぎ', href: '#/inbox?view=experts', n: ex || '' }
    ], view, 'メッセージの表示');
  }

  /* ============================================================
     一覧
     ============================================================ */
  function list(ctx) {
    var rows = ctx.data.threads(), me = staffId();
    var staffOpts = AD.db.state.staff.filter(function (s) { return s.active; }).map(function (s) { return [s.id, s.name]; });
    return '<div class="a-inbox">' +
      AU.head({ title: 'メッセージ', subHtml: true, sub: headSub(ctx) }) +
      tabsHtml(ctx, 'list') + AU.roleNote('members', '返信') +
      AU.table({
        id: 'inbox', rows: rows, query: ctx.query, sort: 'prio', label: 'メッセージの一覧', pageSize: 50,
        search: { placeholder: '名前・会員番号・本文', keys: ['who', 'no', 'all'] },
        filters: [
          { key: 'status', label: '状態', chips: true, options: [['', 'すべて'], ['open', '未返信'], ['doing', '対応中'], ['done', '完了']] },
          { key: 'kind', label: '種類', options: [['', 'すべて']].concat(KINDS.map(function (k) { return [k, k]; })) },
          { key: 'staff', label: '担当', options: [['', 'すべて'], ['me', '自分'], ['none', '担当なし']].concat(staffOpts),
            match: function (t, v) { return v === 'me' ? t.assignee === me : v === 'none' ? !t.assignee : t.assignee === v; } }
        ],
        columns: [
          AU.col.status('status', '状態', 'thread', { key: 'prio', value: prio, csv: function (t) { return AU.statusLabel('thread', t.status); }, html: function (t) { return AU.status('thread', t.status); } }),
          { key: 'who', label: '会員', main: true, value: function (t) { return who(t).name; },
            html: function (t) { return AU.who(who(t), { link: false, sub: t.no + (t.live ? '・デモ会員' : '') }); }, csv: function (t) { return who(t).name + ' ' + t.no; } },
          { key: 'kind', label: '種類', nowrap: true, hide: 'sm' },
          { key: 'text', label: '最後のメッセージ', sort: false, value: function (t) { return t.last ? t.last.text : ''; },
            html: function (t) {
              // 本文が狭いときは「種類」の列を隠し、ここに出す（CSS で切り替える）
              var kind = '<span class="a-ib__lkind">' + esc(t.kind) + '</span>';
              if (!t.last) return kind + '<span class="muted">―</span>';
              var mine = t.last.from !== 'member';
              return kind + '<a class="a-ib__last" href="#/inbox/' + encodeURIComponent(t.id) + '">' + (mine ? '<span class="a-ib__lastfrom">' + (t.last.auto ? '自動送信' : '運営') + '：</span>' : '') +
                esc(String(t.last.text).replace(/\s+/g, ' ').slice(0, 64)) + '</a>' +
                ((t.notes || []).length ? '<span class="a-ib__notes num">メモ ' + t.notes.length + '</span>' : '');
            } },
          { key: 'wait', label: '待ち', align: 'r', dir: 'desc', value: function (t) { return t.waitingSince ? CLG.now() - new Date(t.waitingSince) : -1; },
            html: function (t) { return t.waitingSince ? AU.ageTag(t.waitingSince, 24) : '<span class="muted">―</span>'; }, csv: function (t) { return t.waitingSince ? AU.age(t.waitingSince).text : ''; } },
          { key: 'assignee', label: '担当', hide: 'sm', nowrap: true, value: function (t) { return t.assignee ? staffName(t.assignee) : ''; },
            html: function (t) { return t.assignee ? esc(staffName(t.assignee)) : '<span class="muted">担当なし</span>'; } },
          AU.col.rel('updatedAt', '最後の更新', { hide: 'md' }),
          { key: 'all', label: '本文', csvOnly: true, csv: false, value: function (t) {
            return [t.kind].concat(t.messages.map(function (x) { return x.text; }), (t.notes || []).map(function (n) { return n.text; })).join(' ');
          } },
          { key: 'body', label: '本文', csvOnly: true, csv: function (t) { return t.messages.map(function (x) { return fromName(x.from, t) + '：' + x.text; }).join(' / '); } }
        ],
        rowHref: function (t) { return '#/inbox/' + encodeURIComponent(t.id); },
        rowClass: function (t) { return t.status === 'open' ? (t.waitingSince && AU.age(t.waitingSince).over ? 'is-alert a-ib__open' : 'a-ib__open') : t.status === 'done' ? 'a-ib__done' : ''; },
        rowLabel: function (t) { return who(t).name + 'とのメッセージ'; },
        select: AU.can('members'),
        bulk: [
          { id: 'done', label: '完了にする', icon: 'check', run: function (sel, tb) {
            sel.forEach(function (t) { AD.ops.setThreadStatus(t.id, 'done'); });
            tb.clear(); U.toast(sel.length + '件を完了にしました', 'ok'); if (cur) cur.refresh();
          } },
          { id: 'assign', label: '担当を変える', icon: 'user', run: function (sel, tb) { assignMany(sel, tb.clear); } }
        ],
        csv: { name: 'メッセージ' }, empty: 'まだメッセージはありません。'
      }) + '</div>';
  }
  function assignMany(sel, clear) {
    var m = U.modal('<form id="ibAssignForm" novalidate><p class="a-ib__assignto">' + sel.length + '件の担当を変えます。</p>' +
      '<label class="field"><span>担当</span><select class="select" name="staff">' + P.staffOptions(staffId(), '担当なし') + '</select></label></form>',
      { title: '担当を変える', cls: 'a-inbox', foot: '<button type="button" class="btn btn-soft" data-close>やめる</button><button type="submit" form="ibAssignForm" class="btn btn-ink">変える</button>' });
    m.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = e.target.staff.value || null;
      sel.forEach(function (t) { AD.ops.setThreadStatus(t.id, t.status, v); });
      m.close(); clear();
      U.toast(sel.length + '件の担当を' + (v ? staffName(v) : '「担当なし」') + 'にしました', 'ok');
      if (cur) cur.refresh();
    });
  }

  /* ============================================================
     1件
     ============================================================ */
  function refText(ref) {
    var mm = /^lesson:([^/]+)\/(.+)$/.exec(ref || '');
    if (!mm) return '';
    var c = byId(DATA.COURSES, mm[1]), l = c ? byId(c.lessons, mm[2]) : null;
    return c ? '「' + c.title + '」' + (l ? '第' + (c.lessons.indexOf(l) + 1) + '回 ' + l.title : '') : '';
  }
  function fileSize(n) { n = +n || 0; return n >= 1048576 ? (Math.round(n / 104857.6) / 10) + 'MB' : n ? Math.max(1, Math.round(n / 1024)) + 'KB' : ''; }
  function msgItem(x, t) {
    var me = x.from === 'member';
    var cls = me ? 'is-member' : x.auto ? 'is-staff is-auto' : 'is-staff';
    var extra = '';
    var rt = refText(x.ref);
    if (rt) extra += '<p class="a-ib__ref">どの回：' + esc(rt) + '</p>';
    if (x.attachments && x.attachments.length) {
      extra += '<ul class="a-ib__files">' + x.attachments.map(function (a) {
        var img = a.type === 'image' && /^data:image\//.test(a.url || '') ? '<img src="' + esc(a.url) + '" alt="' + esc(a.name) + '" loading="lazy">' : '';
        return '<li>' + (img || icon('upload', 'ico-s')) + '<span>' + esc(a.name) + (a.size ? '・' + esc(fileSize(a.size)) : '') + '</span></li>';
      }).join('') + '</ul>';
    }
    if (x.card && x.card.type === 'meeting') {
      extra += '<div class="a-ib__card"><span>面談の予約：<b class="num">' + esc(whenText(x.card.at)) + '</b>（' + esc(x.card.min || 15) + '分）</span>' +
        AU.status('interview', x.card.status === 'canceled' ? 'canceled' : x.card.status) +
        (x.card.status === 'pending' ? '<button type="button" class="btn btn-ink btn-s" data-ib-ivok="' + esc(x.card.id) + '">確定する</button>' : '') + '</div>';
    }
    return '<li class="a-ib__msg ' + cls + '">' +
      '<p class="a-ib__from"><b>' + esc(x.auto ? '運営' : fromName(x.from, t)) + '</b>' + (x.auto ? '<span>自動送信</span>' : '') + (me && x.kind ? '<span>' + esc(x.kind) + '</span>' : '') +
        '<time class="num" datetime="' + esc(x.at) + '">' + esc(DATA.hm(x.at)) + '</time></p>' +
      (x.text ? '<div class="a-ib__text">' + U.jp(x.text, { br: true }) + '</div>' : '') + extra + '</li>';
  }
  function noteItem(n) {
    return '<li class="a-ib__msg is-note"><p class="a-ib__from"><b>運営のメモ</b><span>' + esc(staffName(n.by)) + '</span>' +
      '<time class="num" datetime="' + esc(n.at) + '">' + esc(DATA.hm(n.at)) + '</time></p><div class="a-ib__text">' + U.jp(n.text, { br: true }) + '</div></li>';
  }
  function timeline(t) {
    var items = t.messages.map(function (x) { return { at: x.at, html: msgItem(x, t) }; })
      .concat((t.notes || []).map(function (n) { return { at: n.at, html: noteItem(n) }; }))
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var lastDay = '', out = '';
    items.forEach(function (it) {
      var d = new Date(it.at).toDateString();
      if (d !== lastDay) { out += '<li class="a-ib__day" aria-hidden="true"><span>' + esc(dayText(it.at)) + '</span></li>'; lastDay = d; }
      out += it.html;
    });
    return out;
  }

  function composer(t, m) {
    var note = mode === 'note';
    if (!canT(t)) return '<div class="a-ib__composer is-locked">' + AU.roleNote('members', '返信') + '</div>';
    return '<form class="a-ib__composer' + (note ? ' is-note' : '') + '" id="ibForm" data-ib-form="' + esc(t.id) + '" novalidate>' +
      '<div class="seg a-ib__modes" role="group" aria-label="書くもの">' +
        '<button type="button" data-ib-mode="reply" aria-pressed="' + !note + '">返信</button>' +
        '<button type="button" data-ib-mode="note" aria-pressed="' + note + '">運営のメモ</button>' +
      '</div>' +
      '<label class="sr-only" for="ibText" id="ibTextL">' + (note ? '運営のメモ' : esc(m.name) + 'さんへの返信') + '</label>' +
      '<textarea class="textarea" id="ibText" name="text" rows="5" maxlength="2000" placeholder="' + (note ? '会員には見えません' : esc(P.callName(m)) + 'さんへの返信') + '"></textarea>' +
      '<div class="a-ib__bar">' +
        '<span class="a-ib__tplw"' + (note ? ' hidden' : '') + '><label class="sr-only" for="ibTpl">ひな形</label>' +
          '<select class="select a-ib__tpl" id="ibTpl" data-ib-tpl>' + '<option value="">ひな形を入れる</option>' + P.REPLIES.map(function (r) {
            return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>';
          }).join('') + '</select></span>' +
        '<span class="a-ib__key" aria-hidden="true"><kbd>⌘</kbd>+<kbd>Enter</kbd></span>' +
        '<span class="a-ib__send">' +
          '<button type="button" class="btn btn-ghost btn-s" data-ib-senddone="' + esc(t.id) + '"' + (note ? ' hidden' : '') + '>送って完了にする</button>' +
          '<button type="submit" class="btn ' + (note ? 'btn-ink' : 'btn-primary') + ' btn-s" data-ib-submit>' + (note ? 'メモを残す' : icon('arrow', 'ico-s') + '送る') + '</button>' +
        '</span>' +
      '</div>' +
      '<p class="form-err" role="alert" data-ib-err></p>' +
    '</form>';
  }

  function sideMember(t, m) {
    return AU.panel({ title: '会員', id: 'ibMember', cls: 'a-ib__sidep',
      actions: '<a class="ad-panel__link" href="#/members/' + esc(encodeURIComponent(m.no)) + '">詳細</a>',
      body: '<div class="a-ib__who">' + AU.who(m, { size: 's', sub: m.no }) + '</div>' + AU.kv([
        ['入会', m.joinedAt ? U.fmtShort(m.joinedAt) + '（' + m.day + '日目）' : '―'],
        ['レベル', m.level ? 'Lv' + m.level + ' ' + m.levelName : '―'],
        ['状態', AU.status('member', m.status) + (m.suspended ? '<span class="a-ib__stop">ログイン停止中</span>' : ''), true],
        ['スタートガイド', m.stepsDone != null ? AU.steps(m.stepsDone) : '―', true],
        ['最後のログイン', m.lastActive ? U.relTime(m.lastActive) : '―']
      ]) });
  }
  function sideHandle(t) {
    var d = canT(t) ? '' : ' disabled';
    return AU.panel({ title: '対応', id: 'ibHandle', cls: 'a-ib__sidep', body:
      '<div class="a-ib__handle">' +
        '<label class="field"><span>状態</span><select class="select" id="ibStatus" data-ib-status="' + esc(t.id) + '"' + d + '>' +
          [['open', '未返信'], ['doing', '対応中'], ['done', '完了']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === t.status ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="field"><span>担当</span><select class="select" id="ibAssign" data-ib-assign="' + esc(t.id) + '"' + d + '>' + P.staffOptions(t.assignee, '担当なし', true) + '</select></label>' +
      '</div>' });
  }
  function sideMeeting(t, m) {
    var iv = P.interviewOf(t.no);
    var show = t.kind === '面談の予約' || iv;
    if (!show) return '';
    var slots = P.nextSlots(3);
    var ivHtml = iv ? '<p class="a-ib__iv">' + AU.status('interview', iv.status) + '<b class="num">' + esc(whenText(iv.at)) + '</b></p>' +
      (iv.status === 'pending' ? '<button type="button" class="btn btn-ink btn-s" data-ib-ivok="' + esc(iv.id) + '"' + (canT(t) ? '' : ' disabled') + '>確定する</button>' : '') : '<p class="a-ib__none">まだ予約はありません。</p>';
    return AU.panel({ title: '面談', id: 'ibMeet', cls: 'a-ib__sidep', actions: '<a class="ad-panel__link" href="#/inbox?view=slots">枠</a>',
      body: ivHtml + (slots.length ? '<p class="a-ib__label">空いている枠</p><ul class="a-ib__slots">' + slots.map(function (s) {
        return '<li><span class="num">' + esc(whenText(s.at)) + '</span><span class="a-ib__slotst">' + esc(staffName(s.staff)) + '</span></li>';
      }).join('') + '</ul>' + (canT(t) ? '<button type="button" class="btn btn-ghost btn-s" data-ib-slots="' + esc(t.id) + '">候補を返信に入れる</button>' : '') : '<p class="a-ib__none">これから3週間、空いている枠がありません。</p>') });
  }
  /* 次に進めるボタンの言葉は、福利厚生・専門家の画面と同じにする（perks.js の AD.expertSteps） */
  function nextLabel(st) { var n = AD.expertSteps && AD.expertSteps.NEXT[st]; return n || '「' + STEPS[STEPS.indexOf(st) + 1] + '」にする'; }
  function exPerson(x) { var ex = byId(DATA.EXPERTS, x.expert) || { title: '専門家' }; var p = ex.person && DATA.PEOPLE[ex.person]; return { ex: ex, name: p ? p.name : '' }; }
  function exSteps(x) {
    var idx = Math.max(0, STEPS.indexOf(x.status));
    return '<ol class="a-ib__exsteps" aria-label="引き継ぎの進み">' + STEPS.map(function (s, i) {
      return '<li class="' + (i < idx ? 'is-done' : i === idx ? 'is-cur' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + esc(s) + '</li>';
    }).join('') + '</ol>';
  }
  function sideExpert(t) {
    var exs = AD.data.queues().experts.filter(function (x) { return x.no === t.no; });
    if (t.kind !== '専門家' && !exs.length) return '';
    var body = exs.map(function (x) {
      var e = exPerson(x), next = STEPS[STEPS.indexOf(x.status) + 1];
      return '<div class="a-ib__ex"><p class="a-ib__exttl"><b>' + esc(e.ex.title) + '</b>' + (e.name ? '・' + esc(e.name) : '') + '</p>' + exSteps(x) +
        (next ? '<button type="button" class="btn btn-ghost btn-s" data-ib-exnext="' + esc(x.id) + '"' + (AU.can('members') ? '' : ' disabled') + '>' + esc(nextLabel(x.status)) + '</button>' : '') + '</div>';
    }).join('');
    var form = '<form class="a-ib__handoff" data-ib-handoff="' + esc(t.id) + '" novalidate><label class="field"><span>引き継ぐ専門家</span><select class="select" name="expert">' +
      DATA.EXPERTS.map(function (ex) { var p = DATA.PEOPLE[ex.person]; return '<option value="' + esc(ex.id) + '">' + esc(ex.title + (p ? '（' + p.name + '）' : '')) + '</option>'; }).join('') +
      '</select></label><button type="submit" class="btn btn-ghost btn-s"' + (AU.can('members') ? '' : ' disabled') + '>引き継ぐ</button></form>';
    return AU.panel({ title: '専門家', id: 'ibExpert', cls: 'a-ib__sidep', actions: '<a class="ad-panel__link" href="#/inbox?view=experts">一覧</a>',
      body: body + (exs.some(function (x) { return x.status !== '相談済み'; }) ? '' : form) });
  }
  function sideOthers(t) {
    var others = AD.data.threads().filter(function (x) { return x.no === t.no && x.id !== t.id; });
    if (!others.length) return '';
    return AU.panel({ title: 'ほかのやりとり', id: 'ibOthers', cls: 'a-ib__sidep', flush: true, body: '<ul class="a-ib__others">' + others.map(function (x) {
      return '<li><a href="#/inbox/' + esc(encodeURIComponent(x.id)) + '"><span>' + esc(x.kind) + '</span>' + AU.status('thread', x.status) + '<time class="num">' + esc(U.fmtShort(x.updatedAt)) + '</time></a></li>';
    }).join('') + '</ul>' });
  }

  function detail(ctx, t) {
    var m = who(t);
    if (modeFor !== t.id) { mode = 'reply'; modeFor = t.id; }
    // 次の未返信（待たせている順）
    var opens = ctx.data.threads().filter(function (x) { return x.status === 'open' && x.id !== t.id; }).sort(function (a, b) { return prio(a) - prio(b); });
    var nextOpen = opens[0] || null;
    var acts = (t.live ? '<a class="btn btn-ghost btn-s" href="' + esc(ctx.data.memberHref('#/messages')) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + 'この会員として見る</a>' : '') +
      (nextOpen ? '<a class="btn btn-ghost btn-s" href="#/inbox/' + esc(encodeURIComponent(nextOpen.id)) + '">次の未返信' + icon('arrow', 'ico-s') + '</a>' : '');
    var rt = refText(t.ref);
    var sub = AU.status('thread', t.status) + '<span class="a-ib__kind">' + esc(t.kind) + (rt ? '：' + esc(rt) : '') + '</span>' +
      (t.waitingSince ? '<span class="a-ib__waiting">待ち ' + AU.ageTag(t.waitingSince, 24) + '</span>' : '') +
      (t.live ? '<span class="a-ib__livenote">デモ会員・返信は会員ページに届きます</span>' : '');
    return '<div class="a-inbox a-inbox--one">' +
      AU.head({ title: m.name, crumb: [['#/inbox', 'メッセージ']], actions: acts, subHtml: true, sub: sub }) +
      '<div class="a-ib__grid">' +
        '<section class="ad-panel a-ib__main" aria-label="やりとり">' +
          '<div class="a-ib__scroll" tabindex="0" role="region" aria-label="やりとり（古い順）">' +
            '<ol class="a-ib__msgs">' + (t.messages.length || (t.notes || []).length ? timeline(t) : '<li class="a-ib__emptymsg">まだやりとりはありません。</li>') + '</ol></div>' +
          composer(t, m) +
        '</section>' +
        '<aside class="a-ib__side" aria-label="会員と対応">' + sideMember(t, m) + sideHandle(t) + sideMeeting(t, m) + sideExpert(t) + sideOthers(t) + '</aside>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     面談の枠
     ============================================================ */
  function slotsView(ctx) {
    var cfg = P.slotCfg(), list = P.slotList(14), n = CLG.now(), ds = AU.can('members') ? '' : ' disabled';
    var weekly = cfg.weekly.slice().sort(function (a, b) { return ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || (a.time < b.time ? -1 : 1); });
    var wk = AU.panel({ title: '毎週の枠', id: 'ibWeekly', flush: true, count: weekly.length + '枠・1回' + cfg.min + '分', body:
      (weekly.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="毎週の枠"><thead><tr><th scope="col">曜日と時刻</th><th scope="col">担当</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>' +
        weekly.map(function (w) {
          return '<tr><td class="is-main nw"><b>' + esc(P.WD[w.dow]) + '曜</b> <span class="num">' + esc(w.time) + '</span></td><td data-label="担当">' + esc(staffName(w.staff)) + '</td>' +
            '<td class="r" data-label="操作"><button type="button" class="btn btn-text btn-s" data-ib-slotdel="' + esc(w.id) + '" aria-label="' + esc(P.WD[w.dow] + '曜 ' + w.time + 'の枠を外す') + '"' + ds + '>外す</button></td></tr>';
        }).join('') + '</tbody></table></div>' : AU.empty('毎週の枠がありません。下から足してください。')) +
      '<form class="a-ib__slotform" id="ibSlotForm" data-ib-slotadd novalidate>' +
        '<label class="field"><span>曜日</span><select class="select" name="dow">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<option value="' + d + '">' + P.WD[d] + '曜</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>時刻</span><input class="input" type="time" name="time" id="ibSlotTime" step="900" value="21:00" required></label>' +
        '<label class="field"><span>担当</span><select class="select" name="staff">' + P.staffOptions(staffId()) + '</select></label>' +
        '<button type="submit" class="btn btn-ink btn-s"' + ds + '>枠を足す</button>' +
      '</form>' });
    var offs = (cfg.off || []).filter(function (o) { return new Date(o.at) >= new Date(n.getFullYear(), n.getMonth(), n.getDate()); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var off = AU.panel({ title: '休みにする日', id: 'ibOff', flush: true, body:
      (offs.length ? '<ul class="a-ib__offs">' + offs.map(function (o) {
        return '<li><b class="num">' + esc(U.fmtShort(o.at)) + '</b><span>' + esc(o.why || '') + '</span><button type="button" class="btn btn-text btn-s" data-ib-offdel="' + esc(o.id) + '" aria-label="' + esc(U.fmtShort(o.at) + 'の休みを外す') + '"' + ds + '>外す</button></li>';
      }).join('') + '</ul>' : '<p class="a-ib__none a-ib__pad">休みにする日はありません。</p>') +
      '<form class="a-ib__slotform" id="ibOffForm" data-ib-offadd novalidate>' +
        '<label class="field"><span>日付</span><input class="input" type="date" name="date" id="ibOffDate" required></label>' +
        '<label class="field a-ib__offwhy"><span>理由<span class="opt">任意</span></span><input class="input" name="why" id="ibOffWhy" maxlength="30" placeholder="研修・出張など" autocomplete="off"></label>' +
        '<button type="submit" class="btn btn-ghost btn-s"' + ds + '>休みにする</button>' +
      '</form>' });
    var lastDay = '';
    var sched = AU.panel({ title: 'これから2週間', id: 'ibSched', flush: true,
      count: list.reduce(function (n, s) { return n + (s.all || []).length; }, 0) + '件の予約・空き' + list.filter(function (s) { return !s.booked && !s.off; }).length + '枠',
      body: list.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-dense is-cards" aria-label="これから2週間の面談"><thead><tr><th scope="col">日時</th><th scope="col">担当</th><th scope="col">予約</th></tr></thead><tbody>' +
        list.map(function (s) {
          var d = new Date(s.at).toDateString(), first = d !== lastDay; lastDay = d;
          var all = s.all || (s.booked ? [s.booked] : []);
          // 同じ時刻に2件以上あるときは1人目だけ出し、残りは数で（面談の一覧で日時を決め直す）
          var bk = all.length ? AU.who(all[0].no, { sub: AU.statusLabel('interview', all[0].status) }) +
              (all.length > 1 ? '<p class="a-ib__clash"><a href="#/onboarding?view=interviews&amp;status=*">ほか' + (all.length - 1) + '件が同じ時刻</a></p>' : '') +
              (s.off ? '<p class="a-ib__off">休みの日です</p>' : '')
            : s.off ? '<span class="a-ib__off">休み' + (s.off.why ? '（' + esc(s.off.why) + '）' : '') + '</span>' : '<span class="muted">空き</span>';
          return '<tr class="' + (first ? 'a-ib__dayrow' : '') + (s.off && !all.length ? ' is-quiet' : '') + (all.length > 1 || (s.off && all.length) ? ' is-warn' : '') + '"><td class="is-main nw"><span class="num">' + esc(U.fmtShort(s.at, true)) + '</span></td>' +
            '<td data-label="担当">' + esc(staffName(s.staff)) + '</td><td data-label="予約">' + bk + '</td></tr>';
        }).join('') + '</tbody></table></div>' : AU.empty('これから2週間の枠はありません。') });
    return '<div class="a-inbox">' + AU.head({ title: 'メッセージ', subHtml: true, sub: headSub(ctx) }) + tabsHtml(ctx, 'slots') +
      (AU.can('members') ? '' : AU.roleNote('members', '面談の枠の編集', { strict: true })) +
      '<div class="a-ib__slotgrid"><div>' + wk + off + '</div><div>' + sched + '</div></div></div>';
  }

  /* ============================================================
     専門家への引き継ぎ
     ============================================================ */
  function expertsView(ctx) {
    var rows = ctx.data.queues().experts.map(function (x) {
      var m = ctx.data.member(x.no), e = exPerson(x);
      return Object.assign({}, x, { who: m ? m.name : x.no, exTitle: e.ex.title + (e.name ? '（' + e.name + '）' : ''), idx: STEPS.indexOf(x.status) });
    });
    return '<div class="a-inbox">' + AU.head({ title: 'メッセージ', subHtml: true, sub: headSub(ctx) }) + tabsHtml(ctx, 'experts') +
      (AU.can('members') ? '' : AU.roleNote('members', '専門家への引き継ぎ', { strict: true })) +
      AU.table({
        id: 'experts', rows: rows, query: ctx.query, qp: 'ex', sort: 'idx', label: '専門家への引き継ぎ',
        search: { placeholder: '名前・会員番号・内容', label: '名前・会員番号・相談の内容で探す', keys: ['who', 'no', 'text', 'exTitle'] },
        filters: [{ key: 'status', label: '状態', chips: true, options: [['', 'すべて']].concat(STEPS.map(function (s) { return [s, s]; })) }],
        columns: [
          { key: 'who', label: '会員', main: true, html: function (r) { return AU.who(r.no, { sub: r.no + (r.live ? '・デモ会員' : '') }); }, csv: function (r) { return r.who + ' ' + r.no; } },
          { key: 'exTitle', label: '専門家' },
          { key: 'text', label: '相談の内容', sort: false, html: function (r) { return '<span class="a-ib__extext">' + esc(r.text) + '</span>' + (r.when ? '<span class="a-ib__exwhen">希望：' + esc(r.when) + '</span>' : ''); } },
          AU.col.date('at', '受付', { hide: 'sm' }),
          AU.col.status('status', '状態', 'expert', { key: 'idx', value: function (r) { return r.idx; }, csv: function (r) { return r.status; }, html: function (r) { return AU.status('expert', r.status); } }),
          { key: 'act', label: '操作', sort: false, csv: false, nowrap: true, html: function (r) {
            var next = STEPS[r.idx + 1];
            return next ? '<button type="button" class="btn btn-ghost btn-s" data-ib-exnext="' + esc(r.id) + '"' + AU.dis('members') + '>' + esc(nextLabel(r.status)) + '</button>' : '<span class="muted">―</span>';
          } }
        ],
        rowHref: function (r) { return '#/members/' + encodeURIComponent(r.no) + '?tab=msg'; },
        rowClass: function (r) { return r.status === '相談済み' ? 'is-quiet' : ''; },
        csv: { name: '専門家への引き継ぎ' }, empty: 'まだ専門家への相談はありません。'
      }) + '</div>';
  }

  /* ============================================================
     書くもの
     ============================================================ */
  function addNote(id, text) {
    text = String(text || '').trim();
    if (!text) return { ok: false, errors: { text: 'メモを入れてください' } };
    if (text.length > 1000) return { ok: false, errors: { text: '1000文字までにしてください' } };
    var ok = AD.db.update(function (s) {
      var t = id === 'live' ? AD.ops.liveMark(s) : byId(s.threads, id);
      if (!t) return false;
      t.notes = (t.notes || []).concat([{ by: staffId(), at: nowIso(), text: text }]);
      return true;
    });
    return ok ? { ok: true } : { ok: false, error: 'やりとりが見つかりません' };
  }
  function advanceExpert(id) {
    var x = AD.data.queues().experts.filter(function (e) { return e.id === id; })[0];
    if (!x) return null;
    var next = STEPS[STEPS.indexOf(x.status) + 1];
    if (!next) return null;
    if (x.live) R.advanceExpert(x.id, next);
    else AD.db.update(function (s) { var r = byId(s.experts, id); if (r) { r.status = next; r.history = (r.history || []).concat([{ at: nowIso(), status: next }]); } });
    return next;
  }
  function handoff(tid, expertId) {
    var t = AD.data.thread(tid); if (!t) return { ok: false, error: 'やりとりが見つかりません' };
    var ex = byId(DATA.EXPERTS, expertId); if (!ex) return { ok: false, error: '専門家を選んでください' };
    var lastM = null; t.messages.forEach(function (x) { if (x.from === 'member' && !x.auto) lastM = x; });
    var text = lastM ? lastM.text : '運営のメッセージから引き継ぎ';
    if (text.length < 10) text = '運営のメッセージから引き継ぎ：' + text;
    if (t.live) {
      var res = R.requestExpert(expertId, { text: text.slice(0, 1000), when: '' });
      if (!res || !res.ok) return { ok: false, error: '引き継げませんでした' };
    } else {
      var at = nowIso();
      AD.db.update(function (s) {
        s.experts.unshift({ id: AD.db.uid('xr'), no: t.no, expert: expertId, at: at, status: '日程調整', text: text.slice(0, 1000), when: '',
          history: [{ at: at, status: '受付' }, { at: at, status: '日程調整' }] });
      });
    }
    var p = DATA.PEOPLE[ex.person];
    addNote(tid, ex.title + (p ? '（' + p.name + 'さん）' : '') + 'に引き継いだ。日程を聞いている。');
    return { ok: true, name: ex.title };
  }

  function sendReply(form, done) {
    var id = form.getAttribute('data-ib-form'), ta = form.querySelector('#ibText'), err = form.querySelector('[data-ib-err]');
    err.innerHTML = '';
    U.fieldErrors(form, { text: '' }, { focus: false });
    var res;
    if (mode === 'note') {
      res = addNote(id, ta.value);
      if (!res.ok) { if (res.errors) U.fieldErrors(form, res.errors); else err.innerHTML = icon('info', 'ico-s') + '<span>' + esc(res.error) + '</span>'; return; }
      ta.value = '';
      U.toast('メモを残しました', 'ok');
      cur.refresh({ focus: '#ibText' });
      return;
    }
    res = AD.ops.reply(id, ta.value);
    if (!res.ok) { if (res.errors) U.fieldErrors(form, res.errors); else err.innerHTML = icon('info', 'ico-s') + '<span>' + esc(res.error) + '</span>'; return; }
    if (done) AD.ops.setThreadStatus(id, 'done');
    ta.value = '';
    var t = AD.data.thread(id), m = t ? who(t) : null;
    var name = m ? P.callName(m) : '';
    if (t && t.live) {
      U.toast(name + 'さんに返信しました（会員ページに届きました）', 'ok', { action: '会員ページで見る', onAction: function () { window.open(AD.data.memberHref('#/messages'), '_blank', 'noopener'); } });
    } else U.toast(name + 'さんに返信しました' + (done ? '。完了にしました' : ''), 'ok');
    cur.refresh({ focus: '#ibText' });
  }
  function setMode(form, next) {
    mode = next;
    var note = next === 'note', ta = form.querySelector('#ibText'), t = AD.data.thread(form.getAttribute('data-ib-form')), m = t ? who(t) : {};
    form.classList.toggle('is-note', note);
    U.$$('[data-ib-mode]', form).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-ib-mode') === next)); });
    ta.placeholder = note ? '会員には見えません' : P.callName(m) + 'さんへの返信';
    form.querySelector('#ibTextL').textContent = note ? '運営のメモ' : (m.name || '') + 'さんへの返信';
    form.querySelector('.a-ib__tplw').hidden = note;
    form.querySelector('[data-ib-senddone]').hidden = note;
    var sb = form.querySelector('[data-ib-submit]');
    sb.className = 'btn ' + (note ? 'btn-ink' : 'btn-primary') + ' btn-s';
    sb.innerHTML = note ? 'メモを残す' : icon('arrow', 'ico-s') + '送る';
    ta.focus();
  }
  function insertText(ta, text) {
    var v = ta.value;
    ta.value = v ? v.replace(/\s+$/, '') + '\n' + text : text;
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  AD.screens.inbox = {
    title: function (ctx) {
      if (!ctx.params[0]) return ctx.query.view === 'slots' ? '面談の枠' : ctx.query.view === 'experts' ? '専門家への引き継ぎ' : 'メッセージ';
      var t = ctx.data.thread(ctx.params[0]);
      return t ? who(t).name + 'さんとのメッセージ' : 'ページが見つかりません';
    },
    skeleton: 'table',
    render: function (ctx) {
      if (!ctx.params[0]) {
        if (ctx.query.view === 'slots') return slotsView(ctx);
        if (ctx.query.view === 'experts') return expertsView(ctx);
        return list(ctx);
      }
      var t = ctx.data.thread(ctx.params[0]);
      if (!t) return '<div class="a-inbox">' + AU.head({ title: 'ページが見つかりません', crumb: [['#/inbox', 'メッセージ']], sub: 'このメッセージはありません。' }) +
        '<div class="row"><a class="btn btn-ink" href="#/inbox">メッセージの一覧へ</a></div></div>';
      return detail(ctx, t);
    },
    mount: function (root, ctx) {
      cur = ctx;
      // やりとりは枠の中でスクロールする（パソコン）。描くたびにいちばん新しいものを見せる
      var box = root.querySelector('.a-inbox .a-ib__scroll');
      if (box) box.scrollTop = box.scrollHeight;
      if (root.__boundInbox) return;
      root.__boundInbox = true;
      root.addEventListener('submit', function (e) {
        var f = e.target;
        if (!f.closest || !f.closest('.a-inbox')) return;
        if (f.matches('[data-ib-form]')) { e.preventDefault(); if (canT(AD.data.thread(f.getAttribute('data-ib-form')))) sendReply(f, false); else AU.need('members', { kind: '' }); return; }
        if (!AU.can('members')) { e.preventDefault(); AU.need('members'); return; }
        if (f.matches('[data-ib-handoff]')) {
          e.preventDefault();
          var r = handoff(f.getAttribute('data-ib-handoff'), f.expert.value);
          U.toast(r.ok ? r.name + 'に引き継ぎました' : r.error, r.ok ? 'ok' : 'error');
          if (r.ok) cur.refresh();
          return;
        }
        if (f.matches('[data-ib-slotadd]')) {
          e.preventDefault();
          var tm = String(f.time.value || '');
          if (!/^\d{2}:\d{2}$/.test(tm)) { U.fieldErrors(f, { time: '時刻を入れてください' }); return; }
          var dow = +f.dow.value, st = f.staff.value;
          var dup = P.slotCfg().weekly.some(function (w) { return w.dow === dow && w.time === tm && w.staff === st; });
          if (dup) { U.fieldErrors(f, { time: '同じ枠があります' }); return; }
          AD.ops.meetSlots(function (c) { c.weekly.push({ id: AD.db.uid('ms'), dow: dow, time: tm, staff: st }); });
          U.toast(P.WD[dow] + '曜 ' + tm + 'の枠を足しました。会員ページの面談の候補にも出ます', 'ok');
          cur.refresh({ focus: '#ibSlotTime' });
          return;
        }
        if (f.matches('[data-ib-offadd]')) {
          e.preventDefault();
          var dv = String(f.date.value || ''), mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dv);
          if (!mm) { U.fieldErrors(f, { date: '日付を入れてください' }); return; }
          var d = new Date(+mm[1], +mm[2] - 1, +mm[3]), n = CLG.now();
          if (d < new Date(n.getFullYear(), n.getMonth(), n.getDate())) { U.fieldErrors(f, { date: '今日より前の日は選べません' }); return; }
          if (P.slotCfg().off.some(function (o) { return new Date(o.at).toDateString() === d.toDateString(); })) { U.fieldErrors(f, { date: 'この日はもう休みにしています' }); return; }
          var why = String(f.why.value || '').trim();
          AD.ops.meetSlots(function (c) { c.off.push({ id: AD.db.uid('off'), at: d.toISOString(), why: why }); });
          U.toast(U.fmtShort(d) + 'を休みにしました', 'ok');
          cur.refresh({ focus: '#ibOffDate' });
        }
      });
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-inbox')) return;
        if ((b = t.closest('[data-ib-senddone]'))) { var f = b.closest('form'); if (f) sendReply(f, true); return; }
        if ((b = t.closest('[data-ib-mode]'))) { var f2 = b.closest('form'); if (f2) setMode(f2, b.getAttribute('data-ib-mode')); return; }
        if ((b = t.closest('[data-ib-slots]'))) {
          var ta = root.querySelector('#ibText'); if (!ta) return;
          var th = AD.data.thread(b.getAttribute('data-ib-slots'));
          var f3 = root.querySelector('#ibForm'); if (f3 && mode === 'note') setMode(f3, 'reply');
          insertText(ta, P.fill(byId(P.REPLIES, 'slots').text, th ? who(th) : {}));
          return;
        }
        if (t.closest('button[disabled]')) return;
        if ((b = t.closest('[data-ib-exnext],[data-ib-slotdel],[data-ib-offdel]')) && !AU.need('members')) return;
        if ((b = t.closest('[data-ib-ivok]'))) {
          if (!AU.need('members')) return;
          var id = b.getAttribute('data-ib-ivok');
          var iv = AD.data.queues().interviews.filter(function (x) { return x.id === id; })[0];
          var r = P.confirmInterview(iv);
          U.toast(r.ok ? '面談を確定しました' : r.error, r.ok ? 'ok' : 'error');
          cur.refresh({ focus: '#ibText' });
          return;
        }
        if ((b = t.closest('[data-ib-exnext]'))) {
          // 本人に送る文・日時を決める窓は福利厚生・専門家の画面のものを使う（ここで状態だけ変えると、本人に何も届かないため）
          if (AD.expertSteps && AD.expertSteps.step(b.getAttribute('data-ib-exnext'))) return;
          var nx = advanceExpert(b.getAttribute('data-ib-exnext'));
          if (nx) U.toast('「' + nx + '」にしました', 'ok');
          cur.refresh();
          return;
        }
        if ((b = t.closest('[data-ib-slotdel]'))) {
          var sid = b.getAttribute('data-ib-slotdel'), gone = byId(P.slotCfg().weekly, sid);
          if (!gone) return;
          AD.ops.meetSlots(function (c) { c.weekly = c.weekly.filter(function (w) { return w.id !== sid; }); });
          // 押し間違えても戻せるように（入っている予約は消えない。枠が表に出なくなるだけ）
          U.toast(P.WD[gone.dow] + '曜 ' + gone.time + 'の枠を外しました', 'ok', { action: '元に戻す', onAction: function () {
            AD.ops.meetSlots(function (c) { if (!byId(c.weekly, gone.id)) c.weekly.push(gone); });
            if (cur) cur.refresh();
          } });
          cur.refresh({ focus: '#ibSlotTime' });
          return;
        }
        if ((b = t.closest('[data-ib-offdel]'))) {
          var oid = b.getAttribute('data-ib-offdel'), og = byId(P.slotCfg().off, oid);
          if (!og) return;
          AD.ops.meetSlots(function (c) { c.off = c.off.filter(function (o) { return o.id !== oid; }); });
          U.toast(U.fmtShort(og.at) + 'の休みを外しました', 'ok', { action: '元に戻す', onAction: function () {
            AD.ops.meetSlots(function (c) { if (!byId(c.off, og.id)) c.off.push(og); });
            if (cur) cur.refresh();
          } });
          cur.refresh({ focus: '#ibOffDate' });
        }
      });
      root.addEventListener('change', function (e) {
        var t = e.target;
        if (!t.closest || !t.closest('.a-inbox')) return;
        if (t.matches('[data-ib-tpl]')) {
          var tp = byId(P.REPLIES, t.value); if (!tp) return;
          var ta = root.querySelector('#ibText'), th = AD.data.thread(root.querySelector('#ibForm').getAttribute('data-ib-form'));
          insertText(ta, P.fill(tp.text, th ? who(th) : {}));
          t.value = '';
          return;
        }
        if (t.matches('[data-ib-status]')) {
          var id = t.getAttribute('data-ib-status'), th2 = AD.data.thread(id);
          AD.ops.setThreadStatus(id, t.value, th2 ? th2.assignee : undefined);
          U.toast(AU.statusLabel('thread', t.value) + 'にしました', 'ok');
          cur.refresh({ focus: '#ibStatus' });
          return;
        }
        if (t.matches('[data-ib-assign]')) {
          var id2 = t.getAttribute('data-ib-assign'), th3 = AD.data.thread(id2);
          AD.ops.setThreadStatus(id2, th3 ? (th3.status === 'open' && !th3.waitingSince ? 'doing' : th3.status) : 'doing', t.value || null);
          U.toast('担当を' + (t.value ? staffName(t.value) : '「担当なし」') + 'にしました', 'ok');
          cur.refresh({ focus: '#ibAssign' });
        }
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
        var f = e.target.closest && e.target.closest('.a-inbox [data-ib-form]'); if (!f) return;
        e.preventDefault(); sendReply(f, false);
      });
      root.addEventListener('input', function (e) {
        var f = e.target.closest && e.target.closest('.a-inbox [data-ib-form]');
        if (f && e.target.getAttribute('aria-invalid')) U.fieldErrors(f, { text: '' }, { focus: false });
      });
    }
  };
})();
