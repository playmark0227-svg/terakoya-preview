/* ============================================================
   運営画面：案件（#/gigs ?tab=list|apps|review|closed、#/gigs/<案件id>）
   ------------------------------------------------------------
   - 募集中の案件：作る・直す・締め切る。紹介できるサービスは紹介先の担当者を持つ。
   - 応募：応募 → 面談 → 稼働中 → 完了 → 報酬確定 の順に進める（1件ずつ・まとめて）。
     紹介できるサービスは「担当者に引き継ぐ」（紹介先の担当者へ渡す）→ 商談中 → 成約 → 報酬確定。
   - 会員どうしの募集の確認：掲載する／差し戻す（理由つき）。載せられない言葉があれば掲載できない。
     デモ会員の募集は R.reviewGig（会員ページのタブで「掲載中」になる）。ほかの会員の分は AD.db.state.peerGigs。
   - 会員ページとのつながり：デモ会員の応募は R.advanceGigApp(案件, 会員番号, 段)（見送りは 'declined'。応募中・面談の調整中だけ）。
     作った・直した・締め切った案件は R.cmsUpsert('gig') で会員ページの案件にも出す（一覧の元は data.js の元の中身 cms.base('gig')）。
     新しい案件のお知らせは AD.cms.notify（会員ページの鈴）。
   - 役割：案件を作る・直す・締め切る・応募を進める・会員の募集の確認は代表・運営だけ（講師・経理は見るだけ）。
   紹介できるサービスへの申し出は seed.js の応募に無いので、ここで3件を AD.db.state.gigApps に足す（seedRefer: true の印）。
   同じ列に入れておくと、メニュー・ダッシュボードの「確認待ち」の数と、この画面の数がそろう。デモを作り直したときも足し直す。
   運営の保存：AD.db.state.gigOps { created[], edits{}, closed{}, apps{}, appLog{}, handoffs{}, owners{} }
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var DAY = 86400000;
  function cms() { return AD.cms; }

  var K = 'gigOps';
  function empty() { return { created: [], edits: {}, closed: {}, apps: {}, appLog: {}, handoffs: {}, owners: {} }; }
  /* 紹介できるサービスへの申し出（決まった3件。日付は今日から数える） */
  function referSeed() {
    var r = DATA.rng(777), pool = DATA.ROSTER.filter(function (m) { return m.status === 'active' && !m.person && m.joinedDaysAgo > 40; });
    function pick() { return (pool.splice(Math.floor(r() * pool.length), 1)[0] || DATA.ROSTER[0]).no; }
    return [
      { id: 'ra1', gig: 'g7', no: pick(), at: DATA.D(-1, 21, 12), note: '知り合いの工務店が、ホームページを作り直したいそうです。', status: 'applied', src: 'ops' },
      { id: 'ra2', gig: 'g8', no: pick(), at: DATA.D(-9, 13, 40), note: '前の職場の歯科医院が、Instagramを任せられる人を探しています。', status: 'meeting', src: 'ops',
        handoff: { at: DATA.D(-8, 10, 5), by: 'staff4', to: 'sns@partner.example.jp', note: '' } },
      { id: 'ra3', gig: 'g9', no: pick(), at: DATA.D(-24, 20, 30), note: '営業職の友人が、フリーランスで働きたいそうです。', status: 'done' }
    ].map(function (x) { x.updatedAt = x.handoff ? x.handoff.at : x.at; x.seedRefer = true; return x; });
  }
  /* 応募の列（AD.db.state.gigApps）に紹介の申し出を足す。前の形（gigOps.referApps）で持っていたら、そちらを移す */
  function ensureRefer() {
    var st = AD.db.state;
    if (!st || !Array.isArray(st.gigApps)) return;
    var old = st[K] && st[K].referApps, has = st.gigApps.some(function (x) { return x.seedRefer; });
    if (has && !old) return;
    AD.db.update(function (s) {
      var rows = s[K] && s[K].referApps ? s[K].referApps : referSeed();
      if (s[K]) delete s[K].referApps;
      if (s.gigApps.some(function (x) { return x.seedRefer; })) return;
      rows.forEach(function (x) { var y = Object.assign({}, x, { seedRefer: true }); delete y.src; s.gigApps.push(y); });
    });
  }
  ensureRefer();
  AD.db.on(ensureRefer);
  function box() { return cms().box(K, empty); }
  function save(fn) { return cms().save(K, empty, fn); }
  function me() { return (AD.db.staff() || {}).id; }
  function nowIso() { return CLG.now().toISOString(); }

  function typeName(id) { var t = DATA.GIG_TYPES.filter(function (x) { return x.id === id; })[0]; return t ? t.name : ''; }
  function courseTitle(id) { var c = DATA.COURSES.filter(function (x) { return x.id === id; })[0]; return c ? c.title : ''; }

  /* 紹介できるサービスの紹介先（提携先は交渉中のため仮の名前。メールは example.jp） */
  var OWNERS = {
    g7: { company: 'Web制作の提携先', name: '野口', email: 'web@partner.example.jp' },
    g8: { company: 'SNS運用代行の提携先', name: '島田', email: 'sns@partner.example.jp' },
    g9: { company: '営業フリーランスの登録サービス', name: '三宅', email: 'entry@partner.example.jp' }
  };
  function ownerOf(g) { var o = box().owners[g.id]; return o || OWNERS[g.id] || null; }

  /* ---------- 案件 ---------- */
  function baseOpen() { return cms().base('gig').filter(function (g) { return g.status !== 'closed'; }); }
  function baseClosed() { return cms().base('gig').filter(function (g) { return g.status === 'closed'; }); }
  function canC() { return AU.can('content'); }
  function dis() { return canC() ? '' : ' disabled'; }
  function clean(o) { Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; }); return o; }
  /** 運営の案件（作った・直した・締め切った）を会員ページにも出す */
  function syncGig(id) {
    var g = allGigs().filter(function (x) { return x.id === id; })[0];
    if (!g || g.peer || g.type === 'peer' && !cms().base('gig').some(function (x) { return x.id === id; })) return false;
    var cl = box().closed[g.id];
    // 場所（現地の案件）は CMS の place に。時間の欄には詰めない（data.js の「時間・場所」の形も分けて渡す）
    var tp = g.remote === false ? timePlace(g) : { time: String(g.time || ''), place: '' };
    return cms().push('gig', clean({ id: g.id, type: g.type, title: g.title, reward: g.reward, rewardType: g.rewardType || 'shot', level: +g.level || 1, time: tp.time.slice(0, 60),
      remote: g.remote !== false, place: String(tp.place || '').trim().slice(0, 60), slots: g.slots || '', by: g.by, requires: g.requires || '', desc: g.desc || '', steps: g.steps || [], closesAt: g.closesAt || null,
      postedAt: g.postedAt || undefined, status: cl ? 'closed' : 'open', closedAt: cl ? cl.at : null }), '案件を');
  }
  /* 現地の案件の時間と場所。data.js の案件は「1回 3時間・札幌の収録スタジオ」のように時間の欄に場所まで入っているので分ける
     （会員ページの案件の画面と同じ分け方） */
  function timePlace(g) {
    var t = String((g && g.time) || ''), i = t.lastIndexOf('・');
    if (g && g.place) return { time: t, place: g.place };
    if (g && g.remote === false && i > 0) return { time: t.slice(0, i), place: t.slice(i + 1) };
    return { time: t, place: '' };
  }
  function applyEdits(g) {
    var b = box(), x = Object.assign({}, g, b.edits[g.id] || {});
    var cl = b.closed[g.id];
    if (cl) { x.closedBy = cl; x.status = 'closed'; }
    else if (x.closesAt && new Date(x.closesAt) < CLG.now()) x.status = 'closed';
    return x;
  }
  function peerRows() {
    return AD.data.queues().peerGigs.map(function (p) {
      return { id: p.id, type: 'peer', title: p.title, desc: p.desc, reward: p.reward, payment: p.payment, rewardType: 'shot', level: p.level || 1, time: p.time,
        remote: p.remote, place: p.place, slots: p.slots, by: p.no, postedAt: p.reviewedAt || p.submittedAt, submittedAt: p.submittedAt, closesAt: p.closesAt,
        status: p.status === 'open' ? 'open' : p.status === 'closed' ? 'closed' : p.status, peerStatus: p.status, live: !!p.live, peer: true, no: p.no, rejectReason: p.rejectReason };
    });
  }
  function allGigs() {
    var b = box(), seen = {};
    var list = baseOpen().concat(b.created || []).map(applyEdits);
    list.forEach(function (g) { seen[g.id] = 1; });
    peerRows().forEach(function (p) { if (!seen[p.id] && (p.peerStatus === 'open' || p.peerStatus === 'closed')) list.push(applyEdits(p)); });
    return list;
  }
  function closedGigs() {
    return baseClosed().map(function (g) { return Object.assign({}, g, { closedAt: g.closesAt }); })
      .concat(allGigs().filter(function (g) { return g.status === 'closed'; }).map(function (g) { return Object.assign({}, g, { closedAt: g.closedBy ? g.closedBy.at : g.closesAt }); }));
  }
  function findGig(id) {
    return allGigs().filter(function (g) { return g.id === id; })[0] ||
      baseClosed().filter(function (g) { return g.id === id; }).map(function (g) { return Object.assign({ archived: true }, g); })[0] ||
      peerRows().filter(function (g) { return g.id === id; })[0] || null;
  }
  function staffName(id) { return DATA.PEOPLE[id] ? DATA.PEOPLE[id].name : ''; }

  /* ---------- 応募 ---------- */
  var ORDER = ['applied', 'meeting', 'active', 'done', 'rewarded'];
  var LABEL = { applied: '応募', meeting: '面談', active: '稼働中', done: '完了', rewarded: '報酬確定', declined: '見送り' };
  var REFER = { applied: '紹介の申し出', meeting: '引き継ぎ済み', active: '商談中', done: '成約', rewarded: '報酬確定', declined: '見送り' };
  var NEXT = { applied: '面談にする', meeting: '稼働にする', active: '完了にする', done: '報酬を確定する' };
  var NEXT_REFER = { applied: '担当者に引き継ぐ', meeting: '商談中にする', active: '成約にする', done: '報酬を確定する' };
  function isRefer(g) { return !!g && g.type === 'refer'; }
  function apps() {
    var b = box();
    return AD.data.queues().gigApps.map(function (a) {
      var g = findGig(a.gig) || { id: a.gig, title: a.gig, type: '' };
      var o = b.apps[a.id];
      var x = Object.assign({}, a, { gigTitle: g.title, gigType: g.type, refer: isRefer(g) });
      // デモ会員の応募は会員ページの記録（R.advanceGigApp が書く）がそのまま進み。ほかの会員は運営の記録
      if (o && !a.live) { x.status = o.status; x.updatedAt = o.at; x.reward = o.reward; }
      else if (o && a.live && o.reward != null && x.reward == null) x.reward = o.reward;
      x.handoff = b.handoffs[a.id] || a.handoff || null;
      return x;
    });
  }
  function appLabel(a) { return (a.refer ? REFER : LABEL)[a.status] || a.status; }
  function appStatus(a) { return a.status === 'declined' ? '<span class="ad-st">見送り</span>' : AU.status('app', a.status, appLabel(a)); }
  function nextLabel(a) { return (a.refer ? NEXT_REFER : NEXT)[a.status] || ''; }
  function nextOf(s) { var i = ORDER.indexOf(s); return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null; }

  /** 応募を1つ進める（報酬確定は金額と理由の窓、紹介の引き継ぎは引き継ぎの窓を通す） */
  function advance(a, to, extra) {
    extra = extra || {};
    var g = findGig(a.gig) || {}, at = nowIso(), who = me();
    if (a.live) {
      // 会員ページの案件の進み・お知らせ・XP（完了で +XP）がそろって動く
      var r = R.advanceGigApp(a.gig, a.no, to, extra);
      if (!r || r.ok === false) { U.toast((r && r.error) || '進められませんでした', 'error'); return false; }
    } else {
      AD.db.update(function (s) {
        var x = (s.gigApps || []).filter(function (y) { return y.id === a.id; })[0];
        if (x) { x.status = to; x.updatedAt = at; }
      });
    }
    save(function (b) {
      if (extra.reward != null) b.apps[a.id] = Object.assign({}, b.apps[a.id] || {}, { status: to, at: at, by: who, reward: extra.reward });
      (b.appLog[a.id] = b.appLog[a.id] || []).push({ at: at, by: who, text: (a.refer ? REFER : LABEL)[to] + 'にしました' + (extra.note ? '（' + extra.note + '）' : '') });
    });
    if (to !== 'rewarded') AD.db.audit({ action: 'gig_app', label: '応募を進めた', target: { type: 'member', id: a.no, name: cms().personName(a.no) }, detail: g.title + '：' + (a.refer ? REFER : LABEL)[to] });
    return true;
  }
  function stepApp(a) {
    var to = nextOf(a.status); if (!to) return;
    if (to === 'rewarded') { rewardForm(a); return; }
    if (a.refer && to === 'meeting') { handoffForm(a); return; }
    if (advance(a, to)) { U.toast(cms().personName(a.no) + 'さんの応募を「' + (a.refer ? REFER : LABEL)[to] + '」にしました' + (a.live ? '。会員ページの案件も変わりました' : ''), 'ok'); cur.refresh(); }
  }
  /* 案件の報酬の支払日（会員ページの R.gigReward と同じ決まり）：いま確定したら、手順に「当月末」とある案件は今月末、
     ほかは翌月末。土日なら翌営業日 */
  function bizDay(d) { d = new Date(d); if (d.getDay() === 6) d.setDate(d.getDate() + 2); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; }
  function payDateFor(g) {
    var n = CLG.now(), same = /当月末/.test(((g && g.steps) || []).join(' '));
    return bizDay(new Date(n.getFullYear(), n.getMonth() + (same ? 1 : 2), 0, 10, 0));
  }
  function rewardForm(a) {
    var g = findGig(a.gig) || {};
    var guess = (String(g.reward || '').match(/[\d,]+(?=円)/) || [''])[0].replace(/,/g, '');
    var noBank = a.live && R.bank && !R.bank();
    AU.act({
      title: '報酬を確定する', ok: '確定する', kind: 'ink',
      text: cms().personName(a.no) + 'さん・「' + g.title + '」の報酬を確定します。' + U.fmtDate(payDateFor(g), { noYear: true }) + 'に振り込みます。' +
        (noBank ? '\n振込先が未登録なので、登録するまでは次の支払日に繰り越します。' : ''),
      fields: '<label class="field"><span>報酬の額（税込）</span><input class="input" type="number" name="amount" inputmode="numeric" min="1" max="1000000" required value="' + esc(guess) + '"><small>目安ではなく、実際に払う額</small></label>',
      reason: 'optional', reasonLabel: 'メモ', reasons: ['作業報告を受け取った', '先方の検収が済んだ', '成約の連絡があった'],
      run: function (reason, d) {
        var n = parseInt(String(d.amount || '').replace(/[,\s]/g, ''), 10);
        if (!(n >= 1 && n <= 1000000)) return { ok: false, errors: { amount: '報酬の額を1〜1,000,000円で入れてください' } };
        if (!advance(a, 'rewarded', { reward: n, note: U.yen(n) })) return { ok: false, error: '報酬を確定できませんでした' };
        return { ok: true, amount: n };
      },
      audit: function (reason, d, res) { return { action: 'gig_reward', label: '案件の報酬を確定した', target: { type: 'member', id: a.no, name: cms().personName(a.no) }, detail: g.title + '・' + U.yen(res.amount) }; }
    }).then(function (r) {
      if (!r) return;
      // デモ会員は会員ページの記録の支払日（R.gigReward。振込先がなければ繰り越しの一言つき）
      var rw = a.live && R.gigReward ? R.gigReward(a.gig) : null, pay = rw ? rw.payAt : payDateFor(g);
      U.toast('報酬を確定しました。' + U.fmtDate(pay, { noYear: true }) + 'に振り込みます' + (rw && rw.carried && rw.note ? '（' + rw.note + '）' : ''), 'ok');
      cur.refresh();
    });
  }
  function handoffForm(a) {
    var g = findGig(a.gig) || {}, o = ownerOf(g) || { company: '', name: '', email: '' }, who = AD.data.member(a.no) || { name: '', no: a.no };
    var note = '紹介者：' + who.name + '（' + who.no + '）\n案件：' + g.title + '\n' + (a.note ? '会員のひとこと：' + a.note + '\n' : '') + '紹介先の連絡先は、会員が本人の同意を取ってから送ります。';
    cms().formDrawer({
      title: '担当者に引き継ぐ', ok: '引き継ぐ', kind: 'ink', cls: 'a-gigs',
      lead: '<div class="a-gg__owner">' + AU.kv([['紹介先', o.company], ['担当者', o.name ? o.name + 'さん' : ''], ['メール', o.email]]) + '</div>',
      body: cms().field({ name: 'note', label: '担当者に送る文', type: 'textarea', rows: 6, value: note, required: true, maxlength: 800 }) +
        cms().check({ name: 'tell', label: who.name + 'さんに、引き継いだことを知らせる', value: true }),
      onSubmit: function (d) {
        var text = String(d.note || '').trim();
        if (!text) return { ok: false, errors: { note: '担当者に送る文を入れてください' } };
        if (!o.email) return { ok: false, error: '紹介先の担当者が決まっていません。案件の画面で担当者を入れてください' };
        if (!advance(a, 'meeting', { note: o.company })) return { ok: false, error: '引き継ぎにできませんでした' };
        save(function (b) { b.handoffs[a.id] = { at: nowIso(), by: me(), to: o.email, note: text }; });
        AD.db.audit({ action: 'gig_handoff', label: '紹介を担当者に引き継いだ', target: { type: 'member', id: a.no, name: who.name }, detail: g.title + '→' + o.company });
        if (d.tell && a.live) R.staffReply('「' + g.title + '」の件、' + o.company + 'の' + o.name + 'さんに引き継ぎました。担当者から連絡が来たら、ここで知らせます。');
        U.toast('担当者に引き継ぎました。本番では担当者にメールで送ります', 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }
  function declineApp(a) {
    AU.act({
      title: '応募を見送る', ok: '見送る', danger: true,
      text: cms().personName(a.no) + 'さんの「' + a.gigTitle + '」への応募を見送ります。',
      reasons: ['人数が集まった', '条件の講座がまだ', '日程が合わない'],
      run: function (reason) {
        // デモ会員：会員ページの案件は「見送り」になり、お知らせが届く（R.advanceGigApp の 'declined' ＝ R.declineGigApp）
        if (a.live) { var r = R.advanceGigApp(a.gig, a.no, 'declined', { reason: reason }); if (!r || r.ok === false) return r || { ok: false, error: '見送りにできませんでした' }; }
        else AD.db.update(function (s) { var x = (s.gigApps || []).filter(function (y) { return y.id === a.id; })[0]; if (x) { x.status = 'declined'; x.updatedAt = nowIso(); } });
        save(function (b) { (b.appLog[a.id] = b.appLog[a.id] || []).push({ at: nowIso(), by: me(), text: '見送りにしました' }); });
        return { ok: true };
      },
      audit: { action: 'gig_decline', label: '応募を見送った', target: { type: 'member', id: a.no, name: cms().personName(a.no) }, detail: a.gigTitle },
      done: '応募を見送りました' + (a.live ? '。会員ページの案件も「見送り」になりました' : '')
    }).then(function (r) { if (r) cur.refresh(); });
  }
  function appDrawer(a) {
    var g = findGig(a.gig) || {}, log = box().appLog[a.id] || [];
    var hist = [{ at: a.at, text: (a.refer ? '紹介を申し出ました' : '応募しました') + (a.note ? '：' + a.note : '') }];
    if (a.live && R.gigHistory) R.gigHistory(a.gig).forEach(function (h) { if (h.done && h.at && h.at !== a.at) hist.push({ at: h.at, text: h.text, member: true }); });
    log.forEach(function (l) { hist.push({ at: l.at, text: l.text, by: l.by }); });
    hist.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });
    var ho = a.handoff;
    var nx = nextLabel(a);
    var dw = AU.drawer(
      '<div class="a-gg__who">' + AU.who(a.no, { size: 's' }) + (a.live ? '<span class="a-gg__live">デモ会員</span>' : '') + '</div>' +
      AU.kv([
        ['案件', '<a href="#/gigs/' + esc(encodeURIComponent(a.gig)) + '">' + esc(g.title || a.gig) + '</a>', true],
        ['種類', typeName(g.type)],
        ['報酬（目安）', g.reward || ''],
        ['進み', appStatus(a), true],
        a.reward ? ['確定した報酬', U.yen(a.reward)] : null,
        ho ? ['引き継ぎ', U.fmtShort(ho.at, true) + '・' + ho.to] : null
      ]) +
      '<h3 class="a-gg__h">これまで</h3><ol class="a-hist">' + hist.map(function (h) {
        return '<li><time class="num" datetime="' + esc(h.at) + '">' + esc(U.fmtShort(h.at, true)) + '</time><span>' + esc(h.text) +
          (h.by ? '<small>' + esc(staffName(h.by) || AD.db.staffName(h.by)) + '</small>' : h.member ? '<small>会員ページの記録</small>' : '') + '</span></li>';
      }).join('') + '</ol>',
      { title: '応募', cls: 'a-gigs',
        // 見送れるのは、応募中・面談の調整中のもの（会員ページの決まりと同じ）
        foot: (a.status === 'applied' || a.status === 'meeting' ? '<button type="button" class="btn btn-text a-gg__decline" data-gg-decline="' + esc(a.id) + '"' + dis() + '>見送る</button>' : '') +
          '<button type="button" class="btn btn-soft" data-close>閉じる</button>' +
          (nx && a.status !== 'declined' ? '<button type="button" class="btn btn-ink" data-gg-step="' + esc(a.id) + '"' + dis() + '>' + esc(nx) + '</button>' : '') });
    dw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gg-step],[data-gg-decline]'); if (!b || b.disabled) return;
      dw.close(false);
      var fresh = apps().filter(function (x) { return x.id === a.id; })[0] || a;
      if (b.hasAttribute('data-gg-step')) stepApp(fresh); else declineApp(fresh);
    });
  }

  /* ---------- 会員どうしの募集の確認 ---------- */
  function reviewDrawer(p) {
    var hits = cms().flags(p.title + '\n' + (p.desc || '') + '\n' + (p.reward || ''));
    var checks = [
      [hits.length === 0, hits.length ? '載せられない言葉：' + hits.join('・') : '載せられない言葉はありません'],
      [!!String(p.reward || '').trim(), p.reward ? '報酬の目安が書いてある' : '報酬の目安が書かれていない'],
      [!!String(p.payment || '').trim(), p.payment ? '支払いの時期と方法が書いてある' : '支払いの時期と方法が書かれていない'],
      [p.remote || !!String(p.place || '').trim(), p.remote ? '在宅でできる' : p.place ? '場所：' + p.place : '場所が書かれていない'],
      [!/@|https?:\/\/|0\d{1,4}-\d{1,4}-\d{3,4}/.test(p.desc || ''), /@|https?:\/\/|0\d{1,4}-\d{1,4}-\d{3,4}/.test(p.desc || '') ? '本文に連絡先がある（やりとりは運営も見えるスレッドで）' : '本文に連絡先はない']
    ];
    var canApprove = p.status === 'review' && !hits.length;
    var foot = '<button type="button" class="btn btn-soft" data-close>閉じる</button>';
    if (p.status === 'review') foot = '<button type="button" class="btn btn-ghost" data-gg-reject="' + esc(p.id) + '"' + dis() + '>差し戻す</button>' +
      '<button type="button" class="btn btn-primary" data-gg-approve="' + esc(p.id) + '"' + (canApprove && canC() ? '' : ' disabled') + '>掲載する</button>';
    else if (p.status === 'open') foot = '<button type="button" class="btn btn-soft" data-close>閉じる</button><button type="button" class="btn btn-ghost" data-gg-endpeer="' + esc(p.id) + '"' + dis() + '>掲載を終える</button>';
    var dw = AU.drawer(
      '<div class="a-gg__who">' + AU.who(p.no, { size: 's' }) + (p.live ? '<span class="a-gg__live">デモ会員</span>' : '') + '</div>' +
      '<h3 class="a-gg__ptitle">' + cms().marks(p.title) + '</h3>' +
      '<p class="a-gg__desc">' + cms().marks(p.desc || '', { br: true }) + '</p>' +
      AU.kv([
        ['報酬（目安）', cms().marks(p.reward || '―'), true], ['支払い', p.payment], ['時間の目安', p.time], ['場所', p.remote ? '在宅' : p.place],
        ['人数', p.slots], ['応募できるLv', 'Lv' + (p.level || 1) + 'から'], ['締切', p.closesAt ? U.fmtDate(p.closesAt) : ''],
        ['届いた', U.fmtShort(p.submittedAt, true)], ['状態', AU.status('review', p.status), true],
        p.rejectReason ? ['差し戻しの理由', p.rejectReason] : null
      ]) +
      '<h3 class="a-gg__h">確認すること</h3><ul class="a-checks">' + checks.map(function (c) {
        return '<li class="' + (c[0] ? 'is-ok' : 'is-ng') + '">' + icon(c[0] ? 'check' : 'alert', 'ico-s') + '<span>' + esc(c[1]) + '</span></li>';
      }).join('') + '</ul>' +
      (p.status === 'review' && !canApprove ? '<p class="a-gg__why">載せられない言葉があるので、このままでは掲載できません。</p>' : ''),
      { title: '会員どうしの募集', cls: 'a-gigs', foot: foot });
    dw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gg-approve],[data-gg-reject],[data-gg-endpeer]'); if (!b || b.disabled) return;
      dw.close(false);
      if (b.hasAttribute('data-gg-approve')) review(p, 'approve');
      else if (b.hasAttribute('data-gg-reject')) review(p, 'reject');
      else endPeer(p);
    });
  }
  function review(p, decision) {
    var name = cms().personName(p.no);
    function apply(reason) {
      if (p.live) {
        var r = R.reviewGig(p.id, decision, reason);
        if (!r || r.ok === false) return r || { ok: false, error: 'できませんでした' };
      } else {
        AD.db.update(function (s) {
          var x = (s.peerGigs || []).filter(function (y) { return y.id === p.id; })[0]; if (!x) return;
          x.status = decision === 'approve' ? 'open' : 'rejected'; x.reviewedAt = nowIso(); x.reviewedBy = me();
          if (decision !== 'approve') x.rejectReason = reason;
        });
      }
      return { ok: true };
    }
    if (decision === 'approve') {
      var r = apply('');
      if (r.ok === false) { U.toast(r.error || '掲載できませんでした', 'error'); return; }
      AD.db.audit({ action: 'gig_approve', label: '会員の募集を掲載した', target: { type: 'gig', id: p.id, name: p.title }, detail: name });
      U.toast('「' + p.title + '」を掲載しました' + (p.live ? '。' + name + 'さんの画面で「掲載中」になります' : ''), 'ok');
      cur.refresh();
      return;
    }
    AU.act({
      title: '差し戻す', ok: '差し戻す', danger: true,
      text: name + 'さんの「' + p.title + '」を差し戻します。理由は本人に届きます。',
      reasonLabel: '本人に届く理由',
      reasons: ['「月◯万円」など収入を約束・連想させる書き方は載せられません。仕事の中身と報酬（目安）を書いて出し直してください。',
        '報酬の目安と支払いの時期を書いて、出し直してください。',
        '投資・ローン・勧誘にあたる内容は、会員どうしの案件では扱えません。',
        '本文に連絡先があります。やりとりは運営も見えるスレッドでお願いします。'],
      run: function (reason) { return apply(reason); },
      audit: { action: 'gig_reject', label: '会員の募集を差し戻した', target: { type: 'gig', id: p.id, name: p.title }, detail: name },
      done: '差し戻しました'
    }).then(function (res) { if (res) cur.refresh(); });
  }
  function endPeer(p) {
    U.confirmBox('掲載を終えますか', '「' + p.title + '」を会員の一覧から下げます。', '掲載を終える', true).then(function (ok) {
      if (!ok) return;
      if (p.live) R.closeGig(p.id);
      else AD.db.update(function (s) { var x = (s.peerGigs || []).filter(function (y) { return y.id === p.id; })[0]; if (x) { x.status = 'closed'; x.closedAt = nowIso(); } });
      AD.db.audit({ action: 'gig_close', label: '会員の募集の掲載を終えた', target: { type: 'gig', id: p.id, name: p.title } });
      U.toast('掲載を終えました', 'ok'); cur.refresh();
    });
  }

  /* ---------- 案件を作る・直す ---------- */
  function gigForm(g) {
    var isNew = !g;
    g = g || { type: 'small', title: '', desc: '', reward: '', rewardType: 'shot', level: 1, time: '', remote: true, place: '', slots: '', closesAt: null, requires: '', by: me() || 'staff2', steps: [] };
    if (g.remote === false && !g.place) { var tp0 = timePlace(g); g = Object.assign({}, g, { time: tp0.time, place: tp0.place }); }
    var o = ownerOf(g) || { company: '', name: '', email: '' };
    cms().formDrawer({
      title: isNew ? '案件を作る' : '案件を直す', ok: isNew ? '掲載する' : '保存する', cls: 'a-gigs', wide: true,
      body: '<div class="a-cms__row2">' +
          cms().field({ name: 'type', label: '種類', type: 'select', value: g.type, options: DATA.GIG_TYPES.filter(function (t) { return t.id !== 'peer'; }).map(function (t) { return [t.id, t.name]; }) }) +
          cms().field({ name: 'by', label: '担当', type: 'select', value: g.by, options: cms().staffOptions(/運営|講師|代表/) }) +
        '</div>' +
        cms().field({ name: 'title', label: '案件の名前', value: g.title, required: true, maxlength: 40 }) +
        cms().field({ name: 'desc', label: '内容', type: 'textarea', value: g.desc, rows: 4, required: true, maxlength: 1000 }) +
        '<div class="a-cms__row2">' +
          cms().field({ name: 'reward', label: '報酬（目安）', value: g.reward, required: true, maxlength: 40, placeholder: '1件 800円', hint: '会員ページでは「（目安）」を付けて出します' }) +
          cms().radios({ name: 'rewardType', label: '報酬の形', value: g.rewardType || 'shot', options: [['shot', '1回ごと'], ['stock', '続くあいだ毎月']] }) +
        '</div><div class="a-cms__row3">' +
          cms().field({ name: 'level', label: '応募できるLv', type: 'select', value: String(g.level || 1), options: DATA.LEVELS.map(function (l) { return [String(l.lv), 'Lv' + l.lv + 'から']; }) }) +
          cms().field({ name: 'time', label: '時間の目安', value: g.time, required: true, maxlength: 30, placeholder: '1件 15分' }) +
          cms().field({ name: 'slots', label: '人数', value: g.slots, required: true, maxlength: 20, placeholder: '3名・随時' }) +
        '</div><div class="a-cms__row2">' +
          cms().field({ name: 'closesAt', label: '締切', type: 'date', value: cms().localD(g.closesAt), opt: true, hint: '空なら随時' }) +
          cms().field({ name: 'requires', label: '条件の講座', type: 'select', value: g.requires || '', options: [['', 'なし']].concat(DATA.COURSES.map(function (c) { return [c.id, c.title + '（Lv' + c.level + '）']; })) }) +
        '</div>' +
        cms().check({ name: 'remote', label: '在宅でできる', value: g.remote !== false }) +
        cms().field({ name: 'place', label: '場所（市区町村まで）', value: g.place || '', hidden: g.remote !== false, required: true, maxlength: 40 }) +
        cms().field({ name: 'steps', label: '進め方', type: 'textarea', rows: 3, opt: true, hint: '1行に1つ', value: (g.steps || []).join('\n') }) +
        '<fieldset class="a-cms__sub" data-gg-owner' + (g.type === 'refer' ? '' : ' hidden') + '><legend>紹介先の担当者</legend><div class="a-cms__row3">' +
          cms().field({ name: 'oCompany', label: '紹介先', value: o.company, required: true, maxlength: 40 }) +
          cms().field({ name: 'oName', label: '担当者', value: o.name, maxlength: 20 }) +
          cms().field({ name: 'oEmail', label: 'メール', type: 'email', value: o.email, required: true, maxlength: 80 }) +
        '</div></fieldset>' +
        (isNew ? cms().check({ name: 'notify', label: '応募できる会員にお知らせを出す', value: true }) : ''),
      onMount: function (form) {
        form.addEventListener('change', function (e) {
          if (e.target.name === 'remote') form.querySelector('[name=place]').closest('.field').hidden = e.target.checked;
          if (e.target.name === 'type') form.querySelector('[data-gg-owner]').hidden = e.target.value !== 'refer';
        });
      },
      onSubmit: function (d) {
        var e = {}, title = String(d.title || '').trim(), desc = String(d.desc || '').trim(), reward = String(d.reward || '').trim();
        if (!title) e.title = '案件の名前を入れてください';
        if (!desc) e.desc = '内容を入れてください';
        if (!reward) e.reward = '報酬の目安を入れてください';
        if (!String(d.time || '').trim()) e.time = '時間の目安を入れてください';
        if (!String(d.slots || '').trim()) e.slots = '人数を入れてください（「随時」でも）';
        if (!d.remote && !String(d.place || '').trim()) e.place = '場所を入れてください';
        [['title', title], ['desc', desc], ['reward', reward]].forEach(function (x) {
          var hit = cms().flags(x[1]); if (hit.length && !e[x[0]]) e[x[0]] = 'この内容は掲載できません（' + hit.join('・') + '）';
        });
        var close = d.closesAt ? cms().parseDT(d.closesAt) : null;
        if (d.closesAt && !close) e.closesAt = '締切の日を選んでください';
        else if (close) { close.setHours(23, 59, 0, 0); if (close <= CLG.now()) e.closesAt = '締切は明日以降の日にしてください'; }
        if (d.type === 'refer') {
          if (!String(d.oCompany || '').trim()) e.oCompany = '紹介先を入れてください';
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.oEmail || '').trim())) e.oEmail = '担当者のメールアドレスを入れてください';
        }
        if (Object.keys(e).length) return { ok: false, errors: e };
        var patch = { type: d.type, by: d.by, title: title, desc: desc, reward: reward, rewardType: d.rewardType || 'shot', level: +d.level, time: String(d.time).trim(),
          slots: String(d.slots).trim(), remote: !!d.remote, place: d.remote ? '' : String(d.place).trim(), closesAt: close ? close.toISOString() : null,
          requires: d.requires || undefined, steps: String(d.steps || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean) };
        var id = g.id;
        save(function (b) {
          if (isNew) { id = cms().uid('ag'); b.created.push(Object.assign({ id: id, status: 'open', postedAt: nowIso(), isNew: true, createdBy: me() }, patch)); }
          else if ((b.created || []).some(function (x) { return x.id === g.id; })) b.created = b.created.map(function (x) { return x.id === g.id ? Object.assign({}, x, patch) : x; });
          else b.edits[g.id] = Object.assign({}, b.edits[g.id] || {}, patch);
          if (d.type === 'refer') b.owners[id] = { company: String(d.oCompany).trim(), name: String(d.oName || '').trim(), email: String(d.oEmail).trim() };
        });
        var pushed = syncGig(id);
        AD.db.audit({ action: isNew ? 'gig_add' : 'gig_edit', label: isNew ? '案件を掲載した' : '案件を直した', target: { type: 'gig', id: id, name: title }, detail: typeName(d.type) });
        if (isNew && d.notify && pushed) cms().notify({ target: 'lv>=' + patch.level, text: '新しい案件「' + title + '」（' + typeName(d.type) + '）', link: '#/gigs/' + encodeURIComponent(id), type: 'new_gig' });
        if (pushed) U.toast(isNew ? '案件を掲載しました。会員ページの案件にも出ています' : '案件を保存しました。会員ページにも出ています', 'ok');
        if (isNew) AD.app.go('#/gigs/' + encodeURIComponent(id)); else cur.refresh();
        return { ok: true };
      }
    });
  }
  function closeGigAct(g) {
    AU.act({
      title: '募集を締め切る', ok: '締め切る', danger: true,
      text: '「' + g.title + '」の募集を締め切ります。応募した人の進みはそのまま残ります。',
      reason: 'optional', reasons: ['人数が集まった', '先方の都合で止める', '内容を見直す'],
      run: function (reason) { save(function (b) { b.closed[g.id] = { at: nowIso(), by: me(), reason: reason }; }); syncGig(g.id); return { ok: true }; },
      audit: { action: 'gig_close', label: '案件を締め切った', target: { type: 'gig', id: g.id, name: g.title } },
      done: '募集を締め切りました。会員ページでも「募集終了」になりました'
    }).then(function (r) { if (r) cur.refresh(); });
  }
  function reopen(g) {
    save(function (b) { delete b.closed[g.id]; });
    syncGig(g.id);
    AD.db.audit({ action: 'gig_reopen', label: '案件の募集を再開した', target: { type: 'gig', id: g.id, name: g.title } });
    U.toast('募集を再開しました', 'ok'); cur.refresh();
  }

  /* ---------- 表 ---------- */
  function openBtn(attr, id, html) { return '<button type="button" class="a-linkbtn" ' + attr + '="' + esc(id) + '">' + html + '</button>'; }
  function listView(ctx, list, appsAll) {
    var count = {}; appsAll.forEach(function (a) { count[a.gig] = (count[a.gig] || 0) + 1; });
    var rows = list.filter(function (g) { return g.status !== 'closed'; }).map(function (g) {
      var peer = g.type === 'peer';
      return Object.assign({}, g, { apps: count[g.id] || 0, peerGig: peer, owner: peer ? cms().personName(g.no || g.by) : staffName(g.by) });
    });
    return AU.table({
      id: 'gigs', rows: rows, query: ctx.query, sort: '-postedAt', label: '募集中の案件',
      filters: [{ key: 'type', label: '種類', chips: true, options: [['', 'すべて']].concat(DATA.GIG_TYPES.map(function (t) { return [t.id, t.name]; })) }],
      search: { placeholder: '案件・担当', keys: ['title', 'owner'] },
      columns: [
        { key: 'title', label: '案件', main: true, html: function (g) {
          return '<a class="a-gg__ttl" href="#/gigs/' + esc(encodeURIComponent(g.id)) + '">' + esc(g.title) + '</a><span class="a-gg__sub">' + esc(g.peerGig ? '出した会員：' + g.owner : '担当：' + g.owner) + '</span>';
        } },
        { key: 'type', label: '種類', value: function (g) { return typeName(g.type); }, hide: 'sm' },
        { key: 'reward', label: '報酬（目安）', hide: 'md' },
        { key: 'level', label: 'レベル', nowrap: true, html: function (g) { return '<span class="num">Lv' + esc(g.level || 1) + '</span>から'; }, csv: function (g) { return 'Lv' + (g.level || 1) + 'から'; } },
        { key: 'apps', label: '応募', align: 'r', dir: 'desc', html: function (g) { return g.apps ? '<span class="num">' + g.apps + '</span>件' : '<span class="muted">0</span>'; } },
        AU.col.date('postedAt', '掲載', { hide: 'md' }),
        { key: 'closesAt', label: '締切', dir: 'asc', nowrap: true, html: function (g) {
          if (!g.closesAt) return '随時';
          var left = (new Date(g.closesAt) - CLG.now()) / DAY;
          return '<span class="num' + (left < 3 ? ' a-gg__soon' : '') + '">' + esc(U.fmtShort(g.closesAt)) + '</span>' + (left < 3 ? '<span class="sr-only">（あと3日以内）</span>' : '');
        }, csv: function (g) { return g.closesAt ? AU.ymd(g.closesAt) : '随時'; } }
      ],
      rowHref: function (g) { return '#/gigs/' + encodeURIComponent(g.id); },
      csv: { name: '案件' }, empty: 'いま募集している案件はありません。'
    });
  }
  function appsView(ctx, list) {
    return AU.table({
      id: 'gigApps', rows: list, query: ctx.query, sort: '-at', label: '案件への応募',
      filters: [{ key: 'status', label: '進み', chips: true, options: [['', 'すべて'], ['applied', '応募'], ['meeting', '面談・引き継ぎ'], ['active', '稼働中・商談中'], ['done', '完了・成約'], ['rewarded', '報酬確定'], ['declined', '見送り']] },
        { key: 'gig', label: '案件', options: [['', 'すべて']].concat(uniq(list.map(function (a) { return [a.gig, a.gigTitle]; }))) }],
      search: { placeholder: '案件・会員', keys: ['gigTitle', 'name', 'no'] },
      columns: [
        AU.col.when('at', '応募', { hide: 'sm' }),
        { key: 'name', label: '会員', main: true, value: function (a) { return cms().personName(a.no); }, html: function (a) {
          return AU.who(a.no) + (a.live ? '<span class="a-gg__live">デモ会員</span>' : '');
        }, csv: function (a) { return cms().personName(a.no) + ' ' + a.no; } },
        { key: 'gigTitle', label: '案件', html: function (a) { return openBtn('data-gg-app', a.id, esc(a.gigTitle)) + '<span class="a-gg__sub">' + esc(typeName(a.gigType)) + '</span>'; } },
        { key: 'note', label: 'ひとこと', sort: false, hide: 'md', html: function (a) { return a.note ? '<span class="a-gg__note">' + esc(a.note) + '</span>' : '<span class="muted">―</span>'; } },
        { key: 'status', label: '進み', value: function (a) { return ORDER.indexOf(a.status); }, html: function (a) { return appStatus(a); }, csv: function (a) { return appLabel(a); } },
        AU.col.rel('updatedAt', '更新', { hide: 'md' }),
        { key: 'act', label: '次にすること', sort: false, csv: false, cls: 'a-tdact', html: function (a) {
          var nx = nextLabel(a);
          return nx && a.status !== 'declined' ? '<button type="button" class="btn btn-ghost btn-s" data-gg-next="' + esc(a.id) + '"' + dis() + '>' + esc(nx) + '</button>' : '<span class="muted">―</span>';
        } }
      ],
      rowClass: function (a) { return 'is-link' + (a.status === 'declined' || a.status === 'rewarded' ? ' is-quiet' : ''); },
      rowLabel: function (a) { return cms().personName(a.no) + '・' + a.gigTitle; },
      select: canC(),
      bulk: [{ id: 'next', label: '次に進める', icon: 'arrow', run: function (rows, t) {
        var ok = rows.filter(function (a) { return a.status !== 'declined' && ORDER.indexOf(a.status) >= 0 && ORDER.indexOf(a.status) < 3 && !(a.refer && a.status === 'applied'); });
        var skip = rows.length - ok.length;
        if (!ok.length) { U.toast('まとめて進められる応募がありません。報酬の確定と紹介の引き継ぎは1件ずつです', 'error'); return; }
        U.confirmBox(ok.length + '件を次に進めますか', skip ? '報酬の確定・紹介の引き継ぎ・見送りの ' + skip + '件はそのままにします。' : '選んだ応募を、それぞれ1つ先に進めます。', '進める', false, { kind: 'ink' }).then(function (y) {
          if (!y) return;
          var done = ok.filter(function (a) { return advance(a, nextOf(a.status)); }).length;
          t.clear(); U.toast(done + '件を進めました', done === ok.length ? 'ok' : 'error'); cur.refresh();
        });
      } }],
      csv: { name: '案件の応募' }, empty: 'まだ応募はありません。'
    });
  }
  function uniq(pairs) { var s = {}, out = []; pairs.forEach(function (p) { if (!s[p[0]]) { s[p[0]] = 1; out.push(p); } }); return out; }
  function reviewView(ctx, q) {
    return AU.table({
      id: 'peerGigs', rows: q.peerGigs.map(function (p) { return Object.assign({}, p, { hits: cms().flags(p.title + '\n' + (p.desc || '') + '\n' + (p.reward || '')) }); }),
      query: ctx.query, sort: '-submittedAt', label: '会員どうしの募集',
      filters: [{ key: 'status', label: '状態', chips: true, value: 'review', options: [['review', '確認待ち'], ['open', '掲載中'], ['rejected', '差し戻し'], ['closed', '掲載終了'], ['', 'すべて']] }],
      search: { placeholder: '募集・会員', keys: ['title', 'name', 'no'] },
      columns: [
        AU.col.when('submittedAt', '届いた', { hide: 'sm' }),
        { key: 'title', label: '募集', main: true, html: function (p) {
          return openBtn('data-gg-review', p.id, esc(p.title)) +
            (p.hits.length ? '<span class="a-gg__flag">' + icon('alert', 'ico-s') + '載せられない言葉：' + esc(p.hits.join('・')) + '</span>' : '');
        } },
        { key: 'name', label: '出した会員', value: function (p) { return cms().personName(p.no); }, html: function (p) { return AU.who(p.no) + (p.live ? '<span class="a-gg__live">デモ会員</span>' : ''); } },
        { key: 'reward', label: '報酬（目安）', hide: 'md' },
        { key: 'place', label: '場所', hide: 'md', value: function (p) { return p.remote ? '在宅' : p.place; } },
        AU.col.status('status', '状態', 'review')
      ],
      rowClass: function (p) { return 'is-link' + (p.status === 'review' && p.hits.length ? ' is-alert' : ''); },
      csv: { name: '会員どうしの募集' }, empty: '会員どうしの募集はまだありません。'
    });
  }
  function closedView(ctx) {
    return AU.table({
      id: 'gigsClosed', rows: closedGigs(), query: ctx.query, sort: '-closedAt', label: '終わった案件',
      filters: [{ key: 'type', label: '種類', options: [['', 'すべて']].concat(DATA.GIG_TYPES.map(function (t) { return [t.id, t.name]; })) }],
      search: { placeholder: '案件', keys: ['title'] },
      columns: [
        { key: 'title', label: '案件', main: true, html: function (g) { return '<a class="a-gg__ttl" href="#/gigs/' + esc(encodeURIComponent(g.id)) + '">' + esc(g.title) + '</a>'; } },
        { key: 'type', label: '種類', value: function (g) { return typeName(g.type); } },
        { key: 'reward', label: '報酬（目安）', hide: 'md' },
        AU.col.date('closedAt', '終えた日'),
        { key: 'filled', label: '採用', align: 'r', html: function (g) { return g.filled != null ? '<span class="num">' + esc(g.filled) + '</span>名' : '<span class="muted">―</span>'; } },
        { key: 'why', label: '終えた理由', hide: 'md', value: function (g) { return g.closedBy ? (g.closedBy.reason || '運営が締め切った') : '締切の日が来た'; } }
      ],
      rowHref: function (g) { return '#/gigs/' + encodeURIComponent(g.id); },
      csv: { name: '終わった案件' }, empty: '終わった案件はまだありません。'
    });
  }

  /* ---------- 案件1件 ---------- */
  function detail(ctx, g) {
    var list = apps().filter(function (a) { return a.gig === g.id; });
    var closed = g.status === 'closed' || g.archived;
    var o = isRefer(g) ? ownerOf(g) : null;
    // 会員の募集で、まだ確認していないもの・差し戻したものは、掲載していない（応募も受けていない）ことを見出しと条件に書く
    var pending = g.peer && (g.peerStatus === 'review' || g.peerStatus === 'rejected');
    var acts = (g.peer ? '' : '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/gigs/' + encodeURIComponent(g.id))) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>') +
      (g.peer ? (g.peerStatus === 'review' ? '<button type="button" class="btn btn-ink btn-s" data-gg-review="' + esc(g.id) + '">確認する</button>' :
        '<button type="button" class="btn btn-ghost btn-s" data-gg-review="' + esc(g.id) + '">募集の中身を見る</button>') :
        g.archived ? '' :
        (closed && g.closedBy ? '<button type="button" class="btn btn-ghost btn-s" data-gg-reopen="' + esc(g.id) + '"' + dis() + '>募集を再開する</button>' : '') +
        (!closed ? '<button type="button" class="btn btn-ghost btn-s" data-gg-close="' + esc(g.id) + '"' + dis() + '>締め切る</button>' : '') +
        // 会員が出した募集は、中身を直すのは本人（運営は締め切るだけ）
        (g.type === 'peer' ? '' : '<button type="button" class="btn btn-ink btn-s" data-gg-edit="' + esc(g.id) + '"' + dis() + '>案件を直す</button>'));
    var appsTable = list.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-cards" aria-labelledby="ggApps"><thead><tr><th scope="col">会員</th><th scope="col" class="ad-hide-sm">応募</th><th scope="col" class="ad-hide-md">ひとこと</th><th scope="col">進み</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>' +
      list.sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).map(function (a) {
        var nx = nextLabel(a);
        return '<tr class="is-link" data-tb-row="' + esc(a.id) + '"><td class="is-main">' + AU.who(a.no) + (a.live ? '<span class="a-gg__live">デモ会員</span>' : '') + '</td>' +
          '<td data-label="応募" class="nw ad-hide-sm"><span class="num">' + esc(U.fmtShort(a.at, true)) + '</span></td>' +
          '<td data-label="ひとこと" class="ad-hide-md">' + (a.note ? esc(a.note) : '<span class="muted">―</span>') + '</td>' +
          '<td data-label="進み" class="nw">' + openBtn('data-gg-app', a.id, appStatus(a)) + '</td>' +
          '<td class="r nw a-tdact">' + (nx && a.status !== 'declined' ? '<button type="button" class="btn btn-ghost btn-s" data-gg-next="' + esc(a.id) + '"' + dis() + '>' + esc(nx) + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : AU.empty(g.archived ? '記録が残っていない案件です。' : pending ? 'まだ掲載していないので、応募はありません。' : 'まだ応募はありません。');
    var cond = AU.kv([
      ['種類', typeName(g.type)],
      ['報酬（目安）', g.reward],
      ['報酬の形', g.rewardType === 'stock' ? '続くあいだ毎月' : '1回ごと'],
      ['応募できるLv', 'Lv' + (g.level || 1) + 'から'],
      ['時間の目安', timePlace(g).time],
      ['場所', g.remote ? '在宅' : (timePlace(g).place || '')],
      ['人数', g.slots],
      ['締切', g.closesAt ? U.fmtDate(g.closesAt) : '随時'],
      g.requires ? ['条件の講座', courseTitle(g.requires)] : null,
      [g.type === 'peer' ? '出した会員' : '担当', g.type === 'peer' ? cms().personName(g.no || g.by) : staffName(g.by)],
      pending ? ['状態', AU.status('review', g.peerStatus) + '<span class="a-gg__sub">届いた ' + esc(U.fmtShort(g.submittedAt || g.postedAt, true)) + '</span>', true] : ['掲載', g.postedAt ? U.fmtDate(g.postedAt) : ''],
      closed ? ['状態', g.closedBy ? '締め切った（' + U.fmtShort(g.closedBy.at) + '・' + AD.db.staffName(g.closedBy.by) + '）' + (g.closedBy.reason ? '：' + g.closedBy.reason : '') : '募集を終えた'] : null
    ]);
    var ownerP = o ? AU.panel({ title: '紹介先の担当者', body: AU.kv([['紹介先', o.company], ['担当者', o.name ? o.name + 'さん' : ''], ['メール', o.email]]) }) : '';
    return '<div class="a-gigs">' +
      AU.head({ title: g.title, crumb: [['#/gigs' + (closed ? '?tab=closed' : ''), '案件']], actions: acts,
        sub: typeName(g.type) + (pending ? '・' + (g.peerStatus === 'review' ? '確認待ち（まだ掲載していません）' : '差し戻し') : '') + '・Lv' + (g.level || 1) + 'から・' + (g.closesAt ? '締切 ' + U.fmtShort(g.closesAt) : '随時') + (closed ? '・募集は終わっています' : '') }) +
      AU.roleNote('content', '案件の掲載と応募の対応', { strict: true }) +
      '<div class="a-gg__grid"><div class="a-gg__main">' +
        AU.panel({ title: '内容', body: '<p class="a-gg__desc">' + U.jp(g.desc || '', { br: true }) + '</p>' +
          ((g.steps || []).length ? '<h3 class="a-gg__h">進め方</h3><ol class="a-gg__steps">' + g.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') }) +
        AU.panel({ title: '応募', id: 'ggApps', count: list.length + '件', flush: true, body: appsTable }) +
      '</div><div class="a-gg__side">' + AU.panel({ title: '募集の条件', body: cond }) + ownerP + '</div></div>' +
    '</div>';
  }

  AD.screens.gigs = {
    title: function (ctx) {
      if (!ctx.params[0]) return '案件';
      var g = findGig(ctx.params[0]); return g ? g.title : 'ページが見つかりません';
    },
    render: function (ctx) {
      if (ctx.params[0]) {
        var g = findGig(ctx.params[0]);
        if (!g) return '<div class="a-gigs">' + AU.head({ title: 'ページが見つかりません', crumb: [['#/gigs', '案件']], sub: 'この案件はありません。' }) + '<a class="btn btn-ink" href="#/gigs">案件の一覧へ</a></div>';
        return detail(ctx, g);
      }
      var tab = ctx.query.tab || 'list', q = ctx.data.queues(), m = ctx.data.metrics();
      var list = allGigs(), appsAll = apps();
      var tabs = AU.tabs([
        { id: 'list', label: '募集中', href: '#/gigs', n: list.filter(function (g) { return g.status !== 'closed'; }).length },
        { id: 'apps', label: '応募', href: '#/gigs?tab=apps', n: appsAll.filter(function (a) { return a.status === 'applied'; }).length || '' },
        { id: 'review', label: '会員どうしの募集の確認', href: '#/gigs?tab=review', n: m.peerGigs || '', alert: m.peerGigs > 0 },
        { id: 'closed', label: '終わった案件', href: '#/gigs?tab=closed' }
      ], tab, '案件の表示');
      var body = tab === 'apps' ? appsView(ctx, appsAll) : tab === 'review' ? reviewView(ctx, q) : tab === 'closed' ? closedView(ctx) : listView(ctx, list, appsAll);
      var sub = '募集中 ' + list.filter(function (g) { return g.status !== 'closed'; }).length + '件・応募 ' + appsAll.length + '件（うち返事待ち ' + appsAll.filter(function (a) { return a.status === 'applied'; }).length + '件）';
      return '<div class="a-gigs">' + AU.head({ title: '案件', sub: sub, actions: '<button type="button" class="btn btn-ink btn-s" data-gg-new' + dis() + '>' + icon('plus', 'ico-s') + '案件を作る</button>' }) +
        AU.roleNote('content', '案件の掲載と応募の対応', { strict: true }) + tabs + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      if (root.__boundGigs) return;
      root.__boundGigs = true;
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-gigs')) return;
        function app(id) { return apps().filter(function (a) { return a.id === id; })[0]; }
        function peer(id) { return AD.data.queues().peerGigs.filter(function (p) { return p.id === id; })[0]; }
        if ((b = t.closest('[data-gg-new]'))) { if (AU.need('content')) gigForm(null); return; }
        if ((b = t.closest('[data-gg-edit]'))) { var g = findGig(b.getAttribute('data-gg-edit')); if (g && AU.need('content')) gigForm(g); return; }
        if ((b = t.closest('[data-gg-close]'))) { var g2 = findGig(b.getAttribute('data-gg-close')); if (g2 && AU.need('content')) closeGigAct(g2); return; }
        if ((b = t.closest('[data-gg-reopen]'))) { var g3 = findGig(b.getAttribute('data-gg-reopen')); if (g3 && AU.need('content')) reopen(g3); return; }
        if ((b = t.closest('[data-gg-next]'))) { var a = app(b.getAttribute('data-gg-next')); if (a && AU.need('content')) stepApp(a); return; }
        if ((b = t.closest('[data-gg-app]'))) { var a2 = app(b.getAttribute('data-gg-app')); if (a2) appDrawer(a2); return; }
        if ((b = t.closest('[data-gg-review]'))) { var p = peer(b.getAttribute('data-gg-review')); if (p) reviewDrawer(p); return; }
        // 行を押したら、その行の題のボタンと同じ（引き出しを開く）
        var tr = t.closest('tr[data-tb-row]');
        if (tr && !tr.hasAttribute('data-tb-href') && !t.closest('a,button,input,select,textarea,label') && !String(window.getSelection ? window.getSelection() : '')) {
          var ob = tr.querySelector('[data-gg-app],[data-gg-review]');
          if (ob) { ob.focus(); ob.click(); }
        }
      });
    }
  };
})();
