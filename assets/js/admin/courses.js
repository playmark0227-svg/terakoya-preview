/* ============================================================
   運営画面：講座（#/courses ?tab=tree|archive|stats、#/courses/<講座id>）
   ------------------------------------------------------------
   - 講座：学部 → 講座 → 回 の木。学部・講座・回を足す・直す・並べ替える（上へ／下へ）。
     講座は 題・学部・開くLv・講師・写真・説明・状態（下書き／予約公開／公開）、
     回は 題・分・動画ID・説明・この回でわかること（3つ）・資料・状態、確認テストは3問。
   - 勉強会の録画：ジャンル（学部）ごとの一覧と登録。イベントの画面の「録画に載せる」もここに入る。
   - 視聴：講座ごとの見始めた人・修了した人と、止まる人が多い回。
   直したものは運営画面の保存（AD.db の cmsCourses）に書き、同じものを R.cmsUpsert で会員ページにも出す（下の「会員ページとのつながり」）。
   一覧の元は data.js の元の中身（cms.base）。DATA.COURSES は会員に見えるものだけなので、下書きにした講座も並べるためにこちらを使う。
   役割：直せるのは代表・運営。講師は自分の講座（講師が自分）の中身・回・確認テスト・自分の録画だけ。経理は見るだけ。

   ■ AD.cms（A2 の5画面 courses / gigs / events / feed / perks で共通の小さな道具）
     admin.html でこのファイルがいちばん先に読まれるので、ここで作る。ほかの4つは描くとき（DOMContentLoaded の後）に使う。
     box(name, make)            AD.db.state[name]（無ければ make() の空の形。読むだけ）
     save(name, make, fn)       AD.db.update で state[name] を（無ければ作って）書き換える
     field(o) / check(o) / radios(o)   入力欄の HTML（label.field > span + 欄 + small）。必須の札は U.fieldErrors が付ける
     read(form)                 欄の値（checkbox は true/false）
     formDrawer(o)              右から出る入力の引き出し（保存・やめる・書きかけの確認・欄ごとの誤り）
     flags(text) / marks(text)  載せられない言葉の種類（R.checkBanned ＋「月◯万円」）／当たった言葉に印を付けた HTML
     personWho(id, o)           'me'・PEOPLE の id・会員番号 → 顔と名前（AU.who の形）
     targets / countTarget(t) / targetLabel(t)   お知らせの届け先（R.publishNotice と同じ書き方）と、届く人数
     targetFields(pre, value) / targetOf(data, pre) / checkTarget(data, pre) / bindTarget(form, pre, { count, unit })  届け先の欄
     archiveForm(pre?, onSaved?) / archiveRows()   勉強会の録画の登録（イベントの画面の「録画に載せる」も使う）
     staffOptions() / localDT(iso) / localD(iso) / parseDT(v) / uid(prefix) / hash(s)
     notify({ id?, target, text, link?, type?, at?（予約）, log? }) → { ok, id, count, hit }
                                会員にお知らせを出す（R.cmsUpsert('notice')。会員ページの鈴に届け先が合う人だけ出る。見る人を切り替えても残る）。
                                log が false でなければ運営のお知らせの記録（db.notices）にも足す。liveHit(target) デモ会員に届くか
     push(kind, obj, what) → true|false   運営の直しを会員ページにも出す（AD.ops.cms）。断られたら一言で知らせて false
     base(kind)                 data.js の元の中身（CLG.store.cmsBase。DATA.* は会員に見えるものだけなので、下書きにした data.js の分も並べるため）

   ■ 会員ページとのつながり（2回目）
     講座・回・確認テスト・録画・並べ替えは、運営の記録（cmsCourses）に書いたあと cms.push で会員ページにも出す（R.cmsUpsert / cmsReorder / cmsRemove）。
     公開の状態（下書き・予約公開・公開）もそのまま渡すので、会員ページには公開したものだけが出る。
     学部は会員ページの記録が正本（R.cmsList('faculty')。足す・直す cmsUpsert('faculty')・消す cmsRemove・並べ替え cmsReorder('faculty')）。
     運営が足した学部の講座も会員ページに出る（講座が1本もない学部は、会員ページ・公開サイトには出ない）。
     前の版で運営画面だけに持っていた学部（cmsCourses.faculties・facultyOrder）は、開いたときに会員ページの記録へ1回だけ移す（migrateFaculties）。
   ============================================================ */
(function () {
  'use strict';
  var CLG = window.CLG, AD = CLG.admin, AU = AD.ui, U = CLG.ui, R = CLG.rules, DATA = CLG.DATA;
  var esc = U.esc, icon = U.icon;
  var cur = null;
  var MIN = 60000;

  /* ============================================================
     AD.cms（共通の道具）
     ============================================================ */
  var cms = AD.cms = AD.cms || {};
  /* 入れ物に後から足した欄が、前に保存した入れ物に無くても動くように、空の形を下に敷く */
  function fill(o, make) { var d = make(); Object.keys(d).forEach(function (k) { if (o[k] === undefined) o[k] = d[k]; }); return o; }
  cms.box = function (name, make) { var s = AD.db.state[name]; return s ? fill(Object.assign({}, s), make) : make(); };
  cms.save = function (name, make, fn) {
    return AD.db.update(function (s) { s[name] = s[name] ? fill(s[name], make) : make(); return fn(s[name], s); });
  };
  cms.uid = function (p) { return (p || 'x') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); };
  cms.hash = function (s) { var h = 7; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647; return h; };
  /** <input type="datetime-local"> の値（ローカルの時刻） */
  cms.localDT = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) + 'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };
  cms.localD = function (iso) { return iso ? cms.localDT(iso).slice(0, 10) : ''; };
  cms.parseDT = function (v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(v || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
    return isNaN(d) ? null : d;
  };

  /* 入力欄。o: { name, label, type, value, options[[値, 名前]], required, opt, hint, max, min, maxlength, rows, placeholder, cls, attrs, id } */
  cms.field = function (o) {
    var type = o.type || 'text', v = o.value == null ? '' : o.value, ctl;
    var common = ' name="' + esc(o.name) + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.required ? ' required' : '') +
      (o.maxlength ? ' maxlength="' + esc(o.maxlength) + '"' : '') + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.attrs || '');
    if (type === 'select') {
      ctl = '<select class="select"' + common + '>' + (o.options || []).map(function (op) {
        return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? ' selected' : '') + '>' + esc(op[1]) + '</option>';
      }).join('') + '</select>';
    } else if (type === 'textarea') {
      ctl = '<textarea class="textarea" rows="' + (o.rows || 4) + '"' + common + '>' + esc(v) + '</textarea>';
    } else {
      ctl = '<input class="input" type="' + esc(type) + '"' + common + ' value="' + esc(v) + '"' +
        (o.min != null ? ' min="' + esc(o.min) + '"' : '') + (o.max != null ? ' max="' + esc(o.max) + '"' : '') +
        (type === 'number' ? ' inputmode="numeric"' : '') + (o.step ? ' step="' + esc(o.step) + '"' : '') + ' autocomplete="off">';
    }
    return '<label class="field' + (o.cls ? ' ' + esc(o.cls) : '') + '"' + (o.hidden ? ' hidden' : '') + '><span>' + esc(o.label) + (o.opt ? '<span class="opt">任意</span>' : '') + '</span>' + ctl +
      (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</label>';
  };
  cms.check = function (o) {
    return '<div class="field a-cms__check' + (o.cls ? ' ' + esc(o.cls) : '') + '"><label class="check"><input type="checkbox" name="' + esc(o.name) + '"' + (o.value ? ' checked' : '') + (o.attrs || '') + '><span>' + esc(o.label) + '</span></label>' +
      (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</div>';
  };
  cms.radios = function (o) {
    return '<fieldset class="field a-cms__radios' + (o.cls ? ' ' + esc(o.cls) : '') + '"><legend class="field__label">' + esc(o.label) + '</legend><div class="a-cms__radiorow">' +
      o.options.map(function (op) {
        return '<label class="check"><input type="radio" name="' + esc(o.name) + '" value="' + esc(op[0]) + '"' + (String(op[0]) === String(o.value) ? ' checked' : '') + (o.attrs || '') + '><span>' + esc(op[1]) + '</span></label>';
      }).join('') + '</div>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</fieldset>';
  };
  cms.read = function (form) {
    var d = {};
    U.$$('input,select,textarea', form).forEach(function (el) {
      if (!el.name || el.type === 'file') return;
      if (el.type === 'checkbox') d[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; else if (!(el.name in d)) d[el.name] = ''; }
      else d[el.name] = el.value;
    });
    return d;
  };
  var fseq = 0;
  /* 入力の引き出し。o: { title, body, ok, cls, wide, danger, lead, onSubmit(data, form, dw) → { ok } | { ok:false, errors|error }, onMount(form, dw) } */
  cms.formDrawer = function (o) {
    var fid = 'cmsf' + (++fseq);
    var dw = AU.drawer((o.lead || '') + '<form class="a-cms__form" id="' + fid + '" novalidate>' + o.body + '<p class="form-err" role="alert" data-cms-err></p></form>', {
      title: o.title, cls: 'a-cms' + (o.cls ? ' ' + o.cls : ''), wide: !!o.wide, dirty: true, focus: o.focus,
      foot: (o.foot || '') + '<button type="button" class="btn btn-soft" data-close>やめる</button>' +
        '<button type="submit" form="' + fid + '" class="btn ' + (o.danger ? 'btn-danger' : o.kind === 'ink' ? 'btn-ink' : 'btn-primary') + '">' + esc(o.ok || '保存する') + '</button>'
    });
    var form = dw.querySelector('#' + fid);
    U.fieldErrors(form, {}, { focus: false });
    // 誤りの出た欄は、直し始めたら文を消す（送り直すまで赤いままにしない）
    form.addEventListener('input', function (e) {
      var t = e.target; if (!t.name || t.getAttribute('aria-invalid') !== 'true') return;
      var x = {}; x[t.name] = ''; U.fieldErrors(form, x, { focus: false });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = form.querySelector('[data-cms-err]'); err.innerHTML = '';
      var res = o.onSubmit(cms.read(form), form, dw);
      if (!res || res.ok === false) {
        if (res && res.errors) U.fieldErrors(form, res.errors);
        else if (res && res.error) err.innerHTML = icon('info', 'ico-s') + '<span>' + esc(res.error) + '</span>';
        return;
      }
      dw.close();
    });
    if (o.onMount) o.onMount(form, dw);
    return dw;
  };

  /* 載せられない言葉：R.checkBanned（案件の掲載の約束と同じ）に、金額で収入をうたう書き方（「月◯万円」）を足す。
     「情報商」の後ろの1字は domain.js と同じく \u で書く（使わない言葉をソースに残さない） */
  var INCOME_RE = /月\s*[0-9０-９一二三四五六七八九十百]+(?:[,，][0-9]{3})*\s*万/;
  var MARK_RE = new RegExp([
    '投資', '株式の売買', '仮想通貨', '暗号資産', 'ビットコイン', 'FX', '為替取引', 'バイナリー', '自動売買', '先物',
    'ローン', '借入', '借り入れ', 'キャッシング', '融資', '貸金', '情報商\\u6750', '高額塾', '稼げるノウハウ', '教材を販売', '自己アフィリ',
    '必ず稼[がぎぐげ]?[るまけ]?', '確実に稼[がぎぐげ]?', '誰でも稼[がぎぐげ]?', '簡単に稼[がぎぐげ]?', '不労所得', '放置で稼[がぎぐげ]?', '元本保証', '絶対に(?:儲|稼)',
    '月\\s*[0-9０-９一二三四五六七八九十百]+(?:[,，][0-9]{3})*\\s*万円?', 'マルチ', 'ネットワークビジネス', 'MLM', '権利収入', '紹介するだけで'
  ].join('|'), 'gi');
  cms.flags = function (text) {
    text = String(text || '');
    var out = (R.checkBanned ? R.checkBanned(text) : []).slice();
    if (INCOME_RE.test(text) && out.indexOf('収入の保証') < 0) out.push('収入の金額');
    return out;
  };
  cms.marks = function (text, o) {
    text = String(text || '');
    var h = '', last = 0, m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(text))) {
      if (!m[0]) { MARK_RE.lastIndex++; continue; }
      h += esc(text.slice(last, m.index)) + '<mark class="a-mark">' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    h += esc(text.slice(last));
    return o && o.br ? h.replace(/\n/g, '<br>') : h;
  };

  /* 人：'me'（いま会員ページにいるデモ会員）・PEOPLE の id・会員番号 */
  cms.personWho = function (id, o) {
    o = o || {};
    var lv = AD.data.live();
    if (id === 'me' || id === lv.no) return AU.who(lv.no, o);
    if (DATA.ROSTER_INDEX[id]) return AU.who(id, o);
    var p = DATA.PEOPLE[id];
    if (!p) return '<span class="muted">―</span>';
    if (p.no && !p.staff && DATA.ROSTER_INDEX[p.no]) {
      if (CLG.store.state.me && CLG.store.state.me.personId === id) return AU.who(lv.no, o);
      return AU.who(p.no, o);
    }
    return AU.who({ name: p.name, person: id }, { link: false, sub: o.sub || p.role || '運営', size: o.size });
  };
  cms.personName = function (id) {
    var lv = AD.data.live();
    if (id === 'me' || id === lv.no) return lv.name;
    if (DATA.ROSTER_INDEX[id]) return DATA.ROSTER_INDEX[id].name;
    return DATA.PEOPLE[id] ? DATA.PEOPLE[id].name : '';
  };
  /* 会員ページにも出す（R.cms*）。断られたら一言で知らせる */
  cms.base = function (kind) { return CLG.store && CLG.store.cmsBase ? CLG.store.cmsBase(kind) : []; };
  cms.push = function (kind, obj, what) {
    var r = AD.ops.cms(kind, obj);
    if (r && r.ok !== false) return true;
    U.toast((what || '') + '会員ページには出せませんでした（' + AD.ops.cmsError(r) + '）', 'error');
    return false;
  };
  cms.liveHit = function (t) { var live = AD.data.live(); return !!live.row && cms.matchTarget(live.row, t); };
  cms.notify = function (o) {
    o = o || {};
    var later = !!o.at && new Date(o.at) > CLG.now();
    var obj = { id: o.id || cms.uid('nt'), text: String(o.text || '').slice(0, 120), link: o.link || '', target: o.target || 'all', type: o.type || 'system', publish: later ? 'scheduled' : 'published' };
    if (later) obj.publishAt = new Date(o.at).toISOString();
    var r = AD.ops.cms('notice', obj);
    if (!r || r.ok === false) return r || { ok: false, error: 'お知らせを出せませんでした' };
    var n = cms.countTarget(obj.target), hit = !later && cms.liveHit(obj.target);
    if (o.log !== false && !later) AD.db.update(function (s) {
      s.notices.unshift({ id: obj.id, at: CLG.now().toISOString(), by: (AD.db.staff() || {}).id, target: obj.target, targetLabel: cms.targetLabel(obj.target), text: obj.text, link: obj.link, delivered: n });
    });
    return { ok: true, id: r.id || obj.id, count: n, hit: hit };
  };
  cms.staffOptions = function (kinds) {
    return Object.keys(DATA.PEOPLE).filter(function (k) {
      var p = DATA.PEOPLE[k]; return p.staff && (!kinds || kinds.test(p.role || ''));
    }).map(function (k) { return [k, DATA.PEOPLE[k].name + '（' + DATA.PEOPLE[k].role + '）']; });
  };

  /* お知らせの届け先（R.publishNotice の target と同じ書き方） */
  cms.targetLabel = function (t) {
    t = String(t || 'all'); var m;
    if (t === 'all') return '全員';
    if (t === 'new30') return '入会30日以内';
    if ((m = /^cohort:(\d{4})-(\d{2})$/.exec(t))) return (+m[2]) + '月入会' + (String(CLG.now().getFullYear()) === m[1] ? '' : '（' + m[1] + '年）');
    if ((m = /^lv(>=)?:?(\d)$/.exec(t))) return 'Lv' + m[2] + (m[1] ? '以上' : '');
    if ((m = /^member:(.+)$/.exec(t))) { var r = AD.data.member(m[1]); return r ? r.name + '（' + r.no + '）' : m[1]; }
    return t;
  };
  cms.matchTarget = function (row, t) {
    t = String(t || 'all'); var m;
    if (t === 'all') return true;
    if (t === 'new30') return row.day <= 30;
    if ((m = /^cohort:(\d{4}-\d{2})$/.exec(t))) return row.cohortKey === m[1];
    if ((m = /^lv(>=)?:?(\d)$/.exec(t))) return m[1] ? row.level >= +m[2] : row.level === +m[2];
    if ((m = /^member:(.+)$/.exec(t))) return row.no === m[1];
    return false;
  };
  cms.countTarget = function (t, rows) {
    return (rows || AD.data.members()).filter(function (r) { return r.status !== 'left' && cms.matchTarget(r, t); }).length;
  };
  /* 届け先を選ぶ欄（お知らせ・LINE・案件の知らせで同じ形）。data-cms-target の中の change で人数を数え直す */
  cms.targetFields = function (pre, value) {
    value = value || 'all';
    var kind = value === 'all' || value === 'new30' ? value : /^cohort:/.test(value) ? 'cohort' : /^lv/.test(value) ? 'lv' : /^member:/.test(value) ? 'member' : 'all';
    var rows = AD.data.members().filter(function (r) { return r.status !== 'left'; });
    var cohorts = {};
    rows.forEach(function (r) { cohorts[r.cohortKey] = (cohorts[r.cohortKey] || 0) + 1; });
    var ck = Object.keys(cohorts).sort().reverse().slice(0, 12);
    var mCo = /^cohort:(.+)$/.exec(value), mLv = /^lv(>=)?:?(\d)$/.exec(value), mMb = /^member:(.+)$/.exec(value);
    return '<div class="a-cms__target" data-cms-target="' + esc(pre) + '">' +
      cms.field({ name: pre + 'Kind', label: '届け先', type: 'select', value: kind, options: [['all', '全員'], ['new30', '入会30日以内'], ['cohort', '入会した月'], ['lv', 'レベル'], ['member', '会員1人']] }) +
      '<div class="a-cms__row2">' +
        cms.field({ name: pre + 'Cohort', label: '入会した月', type: 'select', value: mCo ? mCo[1] : ck[0], hidden: kind !== 'cohort',
          options: ck.map(function (k) { return [k, cms.targetLabel('cohort:' + k) + '（' + cohorts[k] + '人）']; }) }) +
        cms.field({ name: pre + 'Lv', label: 'レベル', type: 'select', value: mLv ? mLv[2] : '3', hidden: kind !== 'lv',
          options: DATA.LEVELS.map(function (l) { return [String(l.lv), 'Lv' + l.lv + ' ' + l.name]; }) }) +
        cms.field({ name: pre + 'LvOp', label: '範囲', type: 'select', value: mLv && !mLv[1] ? 'eq' : 'ge', hidden: kind !== 'lv', options: [['ge', 'このレベル以上'], ['eq', 'このレベルだけ']] }) +
        cms.field({ name: pre + 'No', label: '会員番号', value: mMb ? mMb[1] : '', hidden: kind !== 'member', placeholder: 'TS-000271' }) +
      '</div>' +
      '<p class="a-cms__reach" aria-live="polite" data-cms-reach></p></div>';
  };
  cms.targetOf = function (d, pre) {
    var k = d[pre + 'Kind'];
    if (k === 'cohort') return 'cohort:' + d[pre + 'Cohort'];
    if (k === 'lv') return 'lv' + (d[pre + 'LvOp'] === 'eq' ? ':' : '>=') + d[pre + 'Lv'];
    if (k === 'member') {
      var v = String(d[pre + 'No'] || '').trim().replace(/\s+/g, ''), m = /^(?:t[sk])?-?0*(\d{1,6})$/i.exec(v);
      return 'member:' + (m ? 'TS-' + ('000000' + m[1]).slice(-6) : v);
    }
    return k === 'new30' ? 'new30' : 'all';
  };
  cms.checkTarget = function (d, pre) {
    if (d[pre + 'Kind'] !== 'member') return null;
    var t = cms.targetOf(d, pre), no = t.slice(7);
    if (!String(d[pre + 'No'] || '').trim()) { var e = {}; e[pre + 'No'] = '会員番号を入れてください'; return e; }
    if (!AD.data.member(no)) { var e2 = {}; e2[pre + 'No'] = 'この会員番号の会員はいません'; return e2; }
    return null;
  };
  /* 届け先の欄の動き（出し分けと人数）。formDrawer の onMount から呼ぶ。
     o.count(target) で数え方を変えられる（LINE は友だちだけ）。o.unit は人数のあとの文字 */
  cms.bindTarget = function (form, pre, o) {
    o = o || {};
    var box = form.querySelector('[data-cms-target="' + pre + '"]'); if (!box) return;
    function sync() {
      var d = cms.read(form), k = d[pre + 'Kind'];
      [['Cohort', 'cohort'], ['Lv', 'lv'], ['LvOp', 'lv'], ['No', 'member']].forEach(function (x) {
        var el = form.querySelector('[name="' + pre + x[0] + '"]'); if (el) el.closest('.field').hidden = k !== x[1];
      });
      var t = cms.targetOf(d, pre), n = /^member:/.test(t) && !AD.data.member(t.slice(7)) ? 0 : (o.count ? o.count(t) : cms.countTarget(t));
      var live = AD.data.live(), hit = !!live.row && cms.matchTarget(live.row, t) && !o.count;
      box.querySelector('[data-cms-reach]').innerHTML = '届く人：<b class="num">' + U.num(n) + '</b>' + esc(o.unit || '人') +
        (hit ? '<span class="a-cms__live">（デモ会員の' + esc(live.name) + 'さんを含む）</span>' : '');
    }
    form.addEventListener('change', function (e) { if (e.target.closest('[data-cms-target="' + pre + '"]')) sync(); });
    form.addEventListener('input', function (e) { if (e.target.name === pre + 'No') sync(); });
    sync();
  };

  /* ============================================================
     講座の画面
     ============================================================ */
  var K = 'cmsCourses';
  function empty() {
    return { faculties: [], facultyOrder: [], courses: {}, added: [], courseOrder: {}, lessons: {}, addedLessons: {}, lessonOrder: {}, quiz: {}, archive: [], archiveEdits: {} };
  }
  function box() { return cms.box(K, empty); }
  function save(fn) { return cms.save(K, empty, fn); }

  var STATUS = { draft: '下書き', scheduled: '予約公開', published: '公開' };
  function statusOf(x) {
    var st = x.status || 'published';
    if (st === 'scheduled' && x.publishAt && new Date(x.publishAt) <= CLG.now()) st = 'published';
    return st;
  }
  function statusHtml(x) {
    var st = statusOf(x);
    if (st === 'published') return '<span class="ad-st">公開</span>';
    if (st === 'scheduled') return U.statusTag('scheduled', '予約 ' + U.fmtShort(x.publishAt, true));
    return U.statusTag('closed', '下書き');
  }
  function statusText(x) { var st = statusOf(x); return st === 'scheduled' ? '予約公開（' + U.fmtShort(x.publishAt, true) + '）' : STATUS[st]; }

  /* ---------- 会員ページにも出す（R.cmsUpsert など） ---------- */
  /* 会員ページに出せる学部か（data.js の学部と、運営が足した学部＝R.cmsList('faculty')。下書きの学部も講座は送れる） */
  function facultyOk(fid) { return faculties().some(function (f) { return f.id === fid; }); }
  function pubOf(x) {
    var st = x.status || 'published';
    if (st === 'scheduled' && x.publishAt && new Date(x.publishAt) > CLG.now()) return { publish: 'scheduled', publishAt: x.publishAt };
    return { publish: st === 'draft' ? 'draft' : 'published' };
  }
  function clean(o) { Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; }); return o; }
  /** 講座を会員ページにも出す（学部が見つからないときは false） */
  function syncCourse(id) {
    var c = findCourse(id); if (!c || !facultyOk(c.faculty)) return false;
    var obj = clean(Object.assign({ id: c.id, title: c.title, faculty: c.faculty, level: +c.level, teacher: c.teacher, summary: c.summary || '', img: c.img || undefined }, pubOf(c)));
    var qz = (box().quiz || {})[c.id]; if (qz && qz.length) obj.quiz = qz;
    return cms.push('course', obj, '講座を');
  }
  function syncLesson(c, lid) {
    if (!c || !facultyOk(c.faculty)) return false;
    var l = lessonsOf(c).filter(function (x) { return x.id === lid; })[0]; if (!l) return false;
    var obj = clean(Object.assign({ id: l.id, course: c.id, title: l.title, min: +l.min, desc: l.desc || '', points: l.points || [], material: l.material || null,
      video: l.video ? String(l.video) : undefined }, pubOf(l)));
    return cms.push('lesson', obj, '回を');
  }
  function syncArchive(id) {
    var a = archiveRows().filter(function (x) { return x.id === id; })[0];
    if (!a || !(facultyOk(a.faculty) || a.faculty === 'showcase')) return false;
    var obj = clean({ id: a.id, title: a.title, faculty: a.faculty, date: a.date, min: +a.min, teacher: a.teacher, desc: a.desc || '', chapters: a.chapters || [], files: a.files || [],
      course: a.course || undefined, publish: a.status === 'draft' ? 'draft' : 'published' });
    return cms.push('archive', obj, '録画を');
  }
  /* 役割：直せるのは代表・運営。講師は自分の講座・録画だけ（AU.can('content', { owner })） */
  function canAll() { return AU.can('content'); }
  function canEdit(x) { return AU.can('content', { owner: x && x.teacher }); }
  function dis(ok) { return ok ? '' : ' disabled'; }

  /* 学部（data.js ＋ 運営が足したもの）を会員ページと同じ並びで。publish：published・draft（下書きの学部の講座は会員に出ない） */
  function faculties() {
    var list = R.cmsList ? R.cmsList('faculty') : DATA.FACULTIES;
    return list.map(function (f) {
      var c = f.cms || {};
      return { id: f.id, name: f.name, desc: f.desc || '', img: f.img || '', alt: f.alt || '', added: !!c.added, edited: !!c.edited,
        publish: c.publish === 'draft' || c.publish === 'hidden' ? 'draft' : 'published' };
    });
  }
  /* 前の版は、運営が足した学部と学部の並びを運営画面の記録だけに持っていた（会員ページに出せなかった）。会員ページの記録へ1回だけ移す */
  function migrateFaculties() {
    var st = AD.db.state && AD.db.state[K];
    if (!st || !AD.db.state.session || (!(st.faculties || []).length && !(st.facultyOrder || []).length)) return false;
    var have = {}, moved = {};
    faculties().forEach(function (f) { have[f.id] = 1; });
    (st.faculties || []).forEach(function (f) {
      if (have[f.id] || !f.name) return;
      var r = AD.ops.cms('faculty', { id: f.id, name: String(f.name).slice(0, 20), desc: String(f.desc || '').slice(0, 60), publish: 'published' });
      if (r && r.ok !== false) moved[f.id] = 1;
    });
    if ((st.facultyOrder || []).length) AD.ops.cmsReorder('faculty', st.facultyOrder.filter(function (id) { return have[id] || moved[id]; }));
    save(function (b) { b.faculties = []; b.facultyOrder = []; });
    // 移した学部の講座と回も会員ページへ（前は出せなかった）
    allCourses().forEach(function (c) {
      if (!moved[c.faculty]) return;
      if (syncCourse(c.id)) lessonsOf(c).forEach(function (l) { syncLesson(c, l.id); });
    });
    return true;
  }
  function facultyName(id) { var f = faculties().filter(function (x) { return x.id === id; })[0]; return f ? f.name : ''; }
  function facultyDraft(id) { var f = faculties().filter(function (x) { return x.id === id; })[0]; return !!f && f.publish === 'draft'; }

  /* 講座（data.js に運営の直しを重ねたもの ＋ 足したもの） */
  function allCourses() {
    var b = box();
    var base = cms.base('course').map(function (c) {
      return Object.assign({ status: 'published', added: false }, c, b.courses[c.id] || {}, { id: c.id, baseLessons: c.lessons });
    });
    (b.added || []).forEach(function (c) { base.push(Object.assign({ added: true, baseLessons: [] }, c, b.courses[c.id] || {})); });
    return base;
  }
  function coursesOf(fid, list) {
    var ord = (box().courseOrder || {})[fid] || [];
    return (list || allCourses()).filter(function (c) { return c.faculty === fid; })
      .map(function (c, i) { var k = ord.indexOf(c.id); return { c: c, k: k < 0 ? 1000 + i : k }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.c; });
  }
  function findCourse(id) { return allCourses().filter(function (c) { return c.id === id; })[0] || null; }

  /* 回（data.js の回 ＋ 足した回。直しと並べ替えを重ねる） */
  function lessonsOf(c) {
    var b = box();
    var list = (c.baseLessons || []).map(function (l) { return Object.assign({ status: 'published', added: false }, l, b.lessons[l.id] || {}, { id: l.id }); })
      .concat(((b.addedLessons || {})[c.id] || []).map(function (l) { return Object.assign({ added: true }, l, b.lessons[l.id] || {}); }));
    var ord = (b.lessonOrder || {})[c.id] || [];
    return list.map(function (l, i) { var k = ord.indexOf(l.id); return { l: l, k: k < 0 ? 1000 + i : k }; })
      .sort(function (a, x) { return a.k - x.k; }).map(function (x) { return x.l; });
  }
  function quizOf(c) { var b = box(); return (b.quiz || {})[c.id] || c.quiz || []; }
  /* 動画ID：data.js には無いので、回の id から決まった9桁を作る（Vimeo の番号の形） */
  function videoId(l) { return l.video || String(800000000 + Math.floor(DATA.rng(cms.hash('v' + l.id))() * 99999999)); }
  function minutesOf(ls) { return ls.reduce(function (a, l) { return a + (+l.min || 0); }, 0); }

  /* 視聴：名簿のレベルから「開いている人」を数え、見始めた人と回ごとに残った人を決まった乱数で作る（試作版のデータ）。
     止まる人が多い回＝前の回からいちばん減った回 */
  function lvCounts() {
    var c = {}, rows = AD.data.members().filter(function (r) { return r.status !== 'left'; });
    DATA.LEVELS.forEach(function (l) { c[l.lv] = rows.filter(function (r) { return r.level >= l.lv; }).length; });
    return c;
  }
  function stats(c, lvc) {
    var ls = lessonsOf(c).filter(function (l) { return statusOf(l) === 'published'; });
    var open = lvc[c.level] || 0;
    if (statusOf(c) !== 'published' || !ls.length || c.added) return { open: statusOf(c) === 'published' ? open : 0, started: 0, done: 0, reach: ls.map(function () { return 0; }), lessons: ls, drop: -1, dropPct: 0, views: 0, rate: 0 };
    var r = DATA.rng(cms.hash(c.id) + 11);
    var started = Math.round(open * (0.58 + r() * 0.32));
    var dropAt = ls.length > 2 ? 1 + Math.floor(r() * (ls.length - 1)) : -1;
    var reach = [], x = started;
    ls.forEach(function (l, i) { if (i > 0) x = Math.round(x * (i === dropAt ? 0.56 + r() * 0.1 : 0.86 + r() * 0.1)); reach.push(x); });
    var drop = -1, dropPct = 0;
    reach.forEach(function (v, i) { if (!i || !reach[i - 1]) return; var p = (reach[i - 1] - v) / reach[i - 1]; if (p > dropPct) { dropPct = p; drop = i; } });
    var views = Math.round(reach.reduce(function (a, v) { return a + v; }, 0) * (0.2 + r() * 0.12));
    var done = reach[reach.length - 1];
    return { open: open, started: started, done: done, reach: reach, lessons: ls, drop: drop, dropPct: dropPct, views: views, rate: started ? done / started : 0 };
  }
  function pct(v) { return Math.round(v * 100) + '%'; }

  function teacherName(id) { return DATA.PEOPLE[id] ? DATA.PEOPLE[id].name : (id || ''); }
  var IMGS = ['course-orientation', 'course-business-basic', 'course-okozukai', 'course-ai', 'course-writing', 'course-instagram', 'course-video', 'course-design',
    'course-marketing', 'course-affiliate', 'course-freelance', 'course-shortvideo', 'course-nocode', 'course-coaching', 'course-teacher',
    'fac-basic', 'fac-sns', 'fac-skill', 'fac-sales', 'fac-biz'];

  /* ---------- 講座の木 ---------- */
  function moveBtns(kind, id, i, n, label) {
    return '<span class="a-cs__move">' +
      '<button type="button" class="iconbtn a-cs__mv" data-cs-move="' + esc(kind) + '" data-id="' + esc(id) + '" data-dir="up"' + (i === 0 ? ' disabled' : '') + ' aria-label="' + esc(label) + 'を上へ">' + icon('chevdown', 'ico-s a-cs__up') + '</button>' +
      '<button type="button" class="iconbtn a-cs__mv" data-cs-move="' + esc(kind) + '" data-id="' + esc(id) + '" data-dir="down"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="' + esc(label) + 'を下へ">' + icon('chevdown', 'ico-s') + '</button>' +
    '</span>';
  }
  function treeView(ctx) {
    var all = allCourses(), facs = faculties(), lvc = lvCounts();
    var q = String(ctx.query.q || '').trim();
    function hit(c) { if (!q) return true; var s = (c.title + ' ' + teacherName(c.teacher)).toLowerCase(); return s.indexOf(q.toLowerCase()) >= 0; }
    var st = String(ctx.query.status || '');
    var filtered = !!(q || st);
    var hits = filtered ? all.filter(function (c) { return hit(c) && (!st || statusOf(c) === st); }).length : all.length;
    var bar = '<div class="ad-tb__bar a-cs__bar">' +
      '<form class="ad-tb__search" role="search" data-cs-search><label class="sr-only" for="csQ">講座を探す</label>' + icon('search', 'ico-s') +
        '<input class="input" type="search" id="csQ" name="q" value="' + esc(q) + '" placeholder="講座・講師" autocomplete="off" enterkeyhint="search"></form>' +
      '<div class="ad-tb__filter"><label class="sr-only" for="csSt">状態</label><select class="select ad-tb__select' + (st ? ' is-on' : '') + '" id="csSt" data-cs-status>' +
        [['', '状態：すべて'], ['published', '公開'], ['scheduled', '予約公開'], ['draft', '下書き']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select></div>' +
      '<span class="ad-tb__count"><b class="num">' + hits + '</b>本' + (hits !== all.length ? '<span class="ad-tb__of">（' + all.length + '本中）</span>' : '') + '</span>' +
      '<span class="ad-tb__tools"><button type="button" class="btn btn-ghost btn-s" data-cs-fac-new' + dis(canAll()) + '>' + icon('plus', 'ico-s') + '学部を足す</button>' +
        '<button type="button" class="btn btn-ghost btn-s" data-cs-csv>' + icon('download', 'ico-s') + 'CSVを書き出す</button></span>' +
    '</div>';
    var groups = facs.map(function (f, fi) {
      var list = coursesOf(f.id, all).filter(function (c) { return hit(c) && (!st || statusOf(c) === st); });
      if (filtered && !list.length) return '';
      var full = coursesOf(f.id, all);
      var rows = list.map(function (c) {
        var ls = lessonsOf(c), s = stats(c, lvc), i = full.indexOf(c);
        return '<tr class="is-link' + (statusOf(c) === 'draft' ? ' is-quiet' : '') + '" data-tb-href="#/courses/' + esc(encodeURIComponent(c.id)) + '">' +
          '<td class="a-cs__ord" data-label="順">' + (filtered || !canAll() ? '<span class="num">' + (i + 1) + '</span>' : moveBtns('course', c.id, i, full.length, c.title)) + '</td>' +
          '<td class="is-main"><a class="a-cs__ttl" href="#/courses/' + esc(encodeURIComponent(c.id)) + '">' + esc(c.title) + '</a>' +
            '<span class="a-cs__sub"><span class="num">' + ls.length + '</span>回・<span class="num">' + minutesOf(ls) + '</span>分</span></td>' +
          '<td data-label="開く" class="nw"><span class="num">Lv' + esc(c.level) + '</span></td>' +
          '<td data-label="講師">' + esc(teacherName(c.teacher)) + '</td>' +
          '<td data-label="見始めた" class="r ad-hide-sm"><span class="num">' + U.num(s.started) + '</span>人</td>' +
          '<td data-label="修了" class="r ad-hide-md"><span class="num">' + U.num(s.done) + '</span>人</td>' +
          '<td data-label="状態" class="nw">' + statusHtml(c) + '</td>' +
          '<td class="a-cs__go" aria-hidden="true">' + U.chevron() + '</td></tr>';
      }).join('');
      var head = '<div class="a-cs__fhead">' + (filtered || !canAll() ? '' : moveBtns('faculty', f.id, fi, facs.length, f.name)) +
        '<h2 class="a-cs__fname" id="csf-' + esc(f.id) + '">' + esc(f.name) + '<span class="ad-panel__n num">' + (filtered ? list.length + '/' : '') + full.length + '本</span>' +
          (f.publish === 'draft' ? U.statusTag('closed', '下書き') : '') + '</h2>' +
        (canAll() ? '<button type="button" class="btn btn-text btn-s" data-cs-fac-edit="' + esc(f.id) + '">学部を直す</button>' : '') +
        // 運営が足した学部は、講座が1本も無いうちだけ消せる（data.js の学部は消さない）
        (f.added && !full.length && !filtered && canAll() ? '<button type="button" class="btn btn-text btn-s a-cs__facdel" data-cs-fac-del="' + esc(f.id) + '">学部を消す</button>' : '') +
        (canAll() ? '<button type="button" class="btn btn-text btn-s" data-cs-new="' + esc(f.id) + '">' + icon('plus', 'ico-s') + 'この学部に講座を足す</button>' : '') + '</div>';
      return '<section class="ad-panel is-flush a-cs__fac" aria-labelledby="csf-' + esc(f.id) + '">' + head +
        (rows ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-cards a-cs__tbl is-tree" aria-labelledby="csf-' + esc(f.id) + '"><thead><tr>' +
          '<th scope="col" class="a-cs__ord">順</th><th scope="col">講座</th><th scope="col" class="a-cs__c-lv">開く</th><th scope="col" class="a-cs__c-tch">講師</th>' +
          '<th scope="col" class="a-cs__c-n r ad-hide-sm">見始めた</th><th scope="col" class="a-cs__c-n r ad-hide-md">修了</th><th scope="col" class="a-cs__c-st">状態</th><th scope="col" class="a-cs__go"><span class="sr-only">開く</span></th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>' : AU.empty('この学部にはまだ講座がありません。')) +
      '</section>';
    }).join('');
    if (!groups) groups = '<div class="ad-panel">' + AU.empty('条件に合う講座はありません。', '<button type="button" class="btn btn-ghost btn-s" data-cs-clear>絞り込みを外す</button>') + '</div>';
    return '<div class="ad-tb a-cs__barbox">' + bar + '</div>' + groups;
  }

  /* ---------- 講座1本 ---------- */
  function detail(ctx, c) {
    var ls = lessonsOf(c), s = stats(c, lvCounts()), qz = quizOf(c), edit = canEdit(c);
    // デモ会員の進み：会員ページに出ている講座だけ（下書きにした講座は会員ページに無い）
    var live = ctx.live, st = !c.added && R.course(c.id) ? R.courseState(c.id) : null;
    var reachOf = {}; s.lessons.forEach(function (l, i) { reachOf[l.id] = s.reach[i]; });
    var lessonRows = ls.map(function (l, i) {
      var reach = reachOf[l.id];
      return '<tr class="a-cs__lrow' + (statusOf(l) === 'draft' ? ' is-quiet' : '') + '">' +
        '<td class="a-cs__ord" data-label="順">' + (edit ? moveBtns('lesson', l.id, i, ls.length, l.title) : '<span class="num">' + (i + 1) + '</span>') + '</td>' +
        '<td class="is-main"><span class="a-cs__no num">第' + (i + 1) + '回</span><b class="a-cs__lt">' + esc(l.title) + '</b>' +
          (l.material ? '<span class="a-cs__sub">資料：' + esc(l.material.name) + '</span>' : '') + '</td>' +
        '<td data-label="長さ" class="r nw"><span class="num">' + esc(l.min) + '</span>分</td>' +
        '<td data-label="動画ID" class="ad-hide-md"><span class="mono">' + esc(videoId(l)) + '</span></td>' +
        '<td data-label="見た人" class="r nw ad-hide-sm">' + (reach != null ? '<span class="num">' + U.num(reach) + '</span>人' : '<span class="muted">―</span>') + '</td>' +
        '<td data-label="状態" class="nw">' + statusHtml(l) + '</td>' +
        '<td class="r nw a-tdact"><button type="button" class="btn btn-ghost btn-s" data-cs-lesson="' + esc(l.id) + '"' + dis(edit) + '>直す</button></td></tr>';
    }).join('');
    var lessonsPanel = AU.panel({ title: '回', count: ls.length + '回・' + minutesOf(ls) + '分', flush: true, id: 'csLessons',
      actions: '<button type="button" class="btn btn-ghost btn-s" data-cs-lesson-new="' + esc(c.id) + '"' + dis(edit) + '>' + icon('plus', 'ico-s') + '回を足す</button>',
      body: ls.length ? '<div class="ad-tbl-wrap"><table class="ad-tbl is-cards a-cs__tbl" aria-labelledby="csLessons"><thead><tr>' +
        '<th scope="col" class="a-cs__ord">順</th><th scope="col">回</th><th scope="col" class="r">長さ</th><th scope="col" class="ad-hide-md">動画ID</th>' +
        '<th scope="col" class="r ad-hide-sm">見た人</th><th scope="col">状態</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>' + lessonRows + '</tbody></table></div>'
        : AU.empty('まだ回がありません。', edit ? '<button type="button" class="btn btn-ink btn-s" data-cs-lesson-new="' + esc(c.id) + '">回を足す</button>' : '') });

    var quizPanel = AU.panel({ title: '確認テスト', count: qz.length ? qz.length + '問' : '', id: 'csQuiz',
      actions: '<button type="button" class="btn btn-ghost btn-s" data-cs-quiz="' + esc(c.id) + '"' + dis(edit) + '>' + (qz.length ? '問題を直す' : '問題を作る') + '</button>',
      body: qz.length ? '<ol class="a-cs__quiz">' + qz.map(function (x) {
        return '<li><p class="a-cs__q">' + esc(x.q) + '</p><ul class="a-cs__choices">' + (x.choices || []).map(function (ch, i) {
          return '<li' + (i === x.answer ? ' class="is-ans"' : '') + '>' + (i === x.answer ? icon('check', 'ico-s') + '<span class="sr-only">正解：</span>' : '') + esc(ch) + '</li>';
        }).join('') + '</ul></li>';
      }).join('') + '</ol><p class="a-cs__note">' + DATA.QUIZ_PASS + '問以上で合格・' + DATA.XP.quiz + ' XP（修了の条件ではない）</p>'
        : AU.empty('確認テストはまだありません。') });

    var kv = AU.kv([
      ['状態', statusText(c)],
      ['学部', facultyName(c.faculty)],
      ['開くレベル', 'Lv' + c.level + ' ' + (R.levelName(c.level) || '')],
      ['講師', teacherName(c.teacher)],
      ['回', ls.length + '回・' + minutesOf(ls) + '分'],
      ['XP', '1回見終えると ' + DATA.XP.lesson + ' XP'],
      ['講座のid', '<span class="mono">' + esc(c.id) + '</span>', true]
    ]);
    var info = AU.panel({ title: '講座の情報', id: 'csInfo', body: (c.img || c.summary ? '<div class="a-cs__intro">' + (c.img ? '<img class="a-cs__img" src="' + esc(c.img) + '" alt="" loading="lazy">' : '') +
      (c.summary ? '<p class="a-cs__summary">' + U.jp(c.summary) + '</p>' : '') + '</div>' : '') + kv });

    var maxR = Math.max.apply(null, s.reach.concat([1]));
    var viewBody = s.started ? '<dl class="a-cs__nums">' +
        '<div><dt>開いている</dt><dd><b class="num">' + U.num(s.open) + '</b>人</dd></div>' +
        '<div><dt>見始めた</dt><dd><b class="num">' + U.num(s.started) + '</b>人</dd></div>' +
        '<div><dt>修了</dt><dd><b class="num">' + U.num(s.done) + '</b>人</dd></div>' +
        '<div><dt>30日の再生</dt><dd><b class="num">' + U.num(s.views) + '</b>回</dd></div></dl>' +
      '<ol class="a-reach" aria-label="回ごとに見た人">' + s.lessons.map(function (l, i) {
        var v = s.reach[i], w = Math.round(v / maxR * 100), isDrop = i === s.drop;
        return '<li class="a-reach__row' + (isDrop ? ' is-drop' : '') + '"><span class="a-reach__lbl">第' + (i + 1) + '回</span>' +
          '<span class="a-reach__bar" aria-hidden="true"><i style="width:' + w + '%"></i></span>' +
          '<span class="a-reach__n num">' + U.num(v) + '</span></li>';
      }).join('') + '</ol>' +
      (s.drop > 0 ? '<p class="a-cs__drop">止まる人が多い回：<b>第' + (s.drop + 1) + '回「' + esc(s.lessons[s.drop].title) + '」</b>（前の回から <span class="num">−' + pct(s.dropPct) + '</span>）</p>' : '')
      : AU.empty(statusOf(c) === 'published' ? 'まだ見た人はいません。' : '公開すると数え始めます。');
    var views = AU.panel({ title: '視聴', id: 'csViews', body: viewBody });
    var liveP = st ? AU.panel({ title: 'デモ会員', id: 'csLive', body: '<p class="a-cs__livep">' + AU.who(live.no) + '</p><p class="a-cs__livest">' +
      (st.locked ? esc(st.lockReason) : st.completed ? '修了しています' : st.started ? '<span class="num">' + st.done + '/' + st.total + '</span>回を見ました' + (st.next ? '（次は「' + esc(st.next.title) + '」）' : '') : 'まだ見ていません') + '</p>' }) : '';

    var acts = (!R.course(c.id) ? '' : '<a class="btn btn-ghost btn-s" href="' + esc(AD.data.memberHref('#/courses/' + encodeURIComponent(c.id))) + '" target="_blank" rel="noopener">' + icon('external', 'ico-s') + '会員ページで見る</a>') +
      '<button type="button" class="btn btn-ink btn-s" data-cs-edit="' + esc(c.id) + '"' + dis(edit) + '>講座を直す</button>';
    return '<div class="a-courses">' +
      AU.head({ title: c.title, crumb: [['#/courses', '講座'], ['#/courses', facultyName(c.faculty)]], actions: acts,
        sub: 'Lv' + c.level + 'で開く・' + ls.length + '回・' + minutesOf(ls) + '分・講師 ' + teacherName(c.teacher) }) +
      (edit ? '' : AU.roleNote('content', '講座の編集')) +
      (facultyDraft(c.faculty) ? '<div class="notice a-cs__note">' + icon('info') + '<div>学部「' + esc(facultyName(c.faculty)) + '」が下書きなので、この講座は会員ページに出ていません。</div></div>' : '') +
      '<div class="a-cs__grid"><div class="a-cs__main">' + lessonsPanel + quizPanel + '</div><div class="a-cs__side">' + info + views + liveP + '</div></div>' +
    '</div>';
  }

  /* ---------- 勉強会の録画 ---------- */
  function archiveRows() {
    var b = box();
    var list = cms.base('archive').map(function (a) { return Object.assign({ status: 'published', added: false }, a, (b.archiveEdits || {})[a.id] || {}); })
      .concat((b.archive || []).map(function (a) { return Object.assign({ added: true }, a, (b.archiveEdits || {})[a.id] || {}); }));
    var rows = AD.data.members().filter(function (r) { return r.status !== 'left'; }).length;
    return list.map(function (a) {
      var r = DATA.rng(cms.hash(a.id) + 3);
      var seen = statusOf(a) === 'published' && !a.added ? Math.round(rows * (0.12 + r() * 0.3)) : 0;
      return Object.assign(a, { seen: seen, genreName: a.genre || facultyName(a.faculty) || '成果発表会' });
    });
  }
  function archiveView(ctx) {
    var rows = archiveRows();
    var genres = {}; rows.forEach(function (a) { genres[a.genreName] = 1; });
    return AU.table({
      id: 'archive', rows: rows, query: ctx.query, sort: '-date', label: '勉強会の録画',
      search: { placeholder: '録画・講師', keys: ['title', 'teacherName'] },
      filters: [{ key: 'genre', label: 'ジャンル', chips: true, options: [['', 'すべて']].concat(Object.keys(genres).map(function (g) { return [g, g.replace(/の学部$/, '')]; })),
        match: function (a, v) { return a.genreName === v; } }],
      columns: [
        AU.col.date('date', '開催日'),
        { key: 'title', label: '録画', main: true, html: function (a) {
          // 直せない役割（講師のほかの人の録画・経理）には、押しても何も開かないボタンを出さず、題を文字で出す
          return (AU.can('content', { owner: a.teacher }) ? '<button type="button" class="a-linkbtn a-cs__ttl" data-cs-arc="' + esc(a.id) + '">' + esc(a.title) + '</button>' : '<span class="a-cs__ttl">' + esc(a.title) + '</span>') +
            ((a.chapters || []).length ? '<span class="a-cs__sub">章 ' + a.chapters.length + '・資料 ' + (a.files || []).length + '</span>' : '');
        } },
        { key: 'genreName', label: 'ジャンル', hide: 'sm' },
        { key: 'min', label: '長さ', align: 'r', html: function (a) { return '<span class="num">' + esc(a.min) + '</span>分'; } },
        { key: 'teacherName', label: '講師', hide: 'md', value: function (a) { return teacherName(a.teacher); } },
        { key: 'seen', label: '見た人', align: 'r', dir: 'desc', hide: 'md', html: function (a) { return '<span class="num">' + U.num(a.seen) + '</span>人'; } },
        { key: 'status', label: '状態', value: function (a) { return statusText(a); }, html: function (a) { return statusHtml(a); } }
      ],
      rowClass: function (a) { return (AU.can('content', { owner: a.teacher }) ? 'is-link' : '') + (statusOf(a) === 'draft' ? ' is-quiet' : ''); },
      csv: { name: '勉強会の録画' }, empty: 'まだ録画はありません。'
    });
  }

  /* ---------- 視聴 ---------- */
  function statsView(ctx) {
    var lvc = lvCounts();
    var rows = allCourses().filter(function (c) { return statusOf(c) === 'published'; }).map(function (c) {
      var s = stats(c, lvc);
      return { id: c.id, title: c.title, faculty: facultyName(c.faculty), level: c.level, open: s.open, started: s.started, done: s.done, rate: s.rate, views: s.views,
        drop: s.drop > 0 ? s.drop + 1 : null, dropTitle: s.drop > 0 ? s.lessons[s.drop].title : '', dropPct: s.dropPct };
    });
    return AU.table({
      id: 'cstats', rows: rows, query: ctx.query, sort: 'rate', label: '講座ごとの視聴',
      search: { placeholder: '講座', keys: ['title'] },
      filters: [{ key: 'faculty', label: '学部', options: [['', 'すべて']].concat(faculties().map(function (f) { return [f.name, f.name]; })) }],
      columns: [
        { key: 'title', label: '講座', main: true, html: function (r) { return '<a class="a-cs__ttl" href="#/courses/' + esc(encodeURIComponent(r.id)) + '">' + esc(r.title) + '</a><span class="a-cs__sub">' + esc(r.faculty) + '・Lv' + esc(r.level) + '</span>'; } },
        { key: 'open', label: '開いている', align: 'r', dir: 'desc', hide: 'md', html: function (r) { return '<span class="num">' + U.num(r.open) + '</span>'; } },
        { key: 'started', label: '見始めた', align: 'r', dir: 'desc', html: function (r) { return '<span class="num">' + U.num(r.started) + '</span>'; } },
        { key: 'done', label: '修了', align: 'r', dir: 'desc', html: function (r) { return '<span class="num">' + U.num(r.done) + '</span>'; } },
        { key: 'rate', label: '修了の割合', dir: 'desc', html: function (r) {
          return '<span class="a-rate"><span class="a-rate__bar" aria-hidden="true"><i style="width:' + Math.round(r.rate * 100) + '%"></i></span><span class="num">' + pct(r.rate) + '</span></span>';
        }, csv: function (r) { return pct(r.rate); } },
        { key: 'drop', label: '止まる人が多い回', html: function (r) {
          return r.drop ? '<span class="a-cs__dropc">第' + r.drop + '回<span class="a-cs__sub">' + esc(r.dropTitle) + '（<span class="num">−' + pct(r.dropPct) + '</span>）</span></span>' : '<span class="muted">―</span>';
        }, csv: function (r) { return r.drop ? '第' + r.drop + '回 ' + r.dropTitle + '（-' + pct(r.dropPct) + '）' : ''; } },
        { key: 'views', label: '30日の再生', align: 'r', dir: 'desc', hide: 'md', html: function (r) { return '<span class="num">' + U.num(r.views) + '</span>'; } }
      ],
      rowHref: function (r) { return '#/courses/' + encodeURIComponent(r.id); },
      csv: { name: '講座の視聴' }, empty: '公開している講座はまだありません。'
    });
  }

  /* ============================================================
     入力の引き出し
     ============================================================ */
  function levelOptions() { return DATA.LEVELS.map(function (l) { return [String(l.lv), 'Lv' + l.lv + ' ' + l.name]; }); }
  function statusFields(x) {
    var st = x.status || 'published';
    return cms.radios({ name: 'status', label: '状態', value: st, options: [['draft', '下書き'], ['scheduled', '予約公開'], ['published', '公開']] }) +
      cms.field({ name: 'publishAt', label: '公開する日時', type: 'datetime-local', value: cms.localDT(x.publishAt || new Date(CLG.now().getTime() + 24 * 60 * MIN).toISOString()), hidden: st !== 'scheduled', cls: 'a-cms__when' });
  }
  function bindStatus(form) {
    function sync() { var d = cms.read(form); form.querySelector('[name=publishAt]').closest('.field').hidden = d.status !== 'scheduled'; }
    form.addEventListener('change', function (e) { if (e.target.name === 'status') sync(); });
  }
  function checkStatus(d, e) {
    if (d.status === 'scheduled') {
      var at = cms.parseDT(d.publishAt);
      if (!at) e.publishAt = '公開する日時を選んでください';
      else if (at <= CLG.now()) e.publishAt = '公開する日時は、いまより後にしてください';
    }
  }
  function statusPatch(d) { return { status: d.status || 'published', publishAt: d.status === 'scheduled' ? cms.parseDT(d.publishAt).toISOString() : null }; }
  /* pushed：会員ページにも出したか（false なら運営画面だけ。理由は cms.push が知らせている） */
  function publishedToast(before, after, what, isNew, pushed, tail) {
    if (pushed === false) return;
    if (after === 'published' && before !== 'published') U.toast(what + 'を公開しました' + (tail || '。会員ページにも出ています'), 'ok');
    else if (isNew && after === 'draft') U.toast(what + 'を下書きで足しました。会員ページにはまだ出ません', 'ok');
    else if (after === 'scheduled') U.toast(what + 'の公開を予約しました。その時刻に会員ページに出ます', 'ok');
    else if (after === 'draft' && before !== 'draft') U.toast(what + 'を下書きに戻しました。会員ページから外れました', 'ok');
    else U.toast(what + 'を保存しました', 'ok');
  }

  /* 講座を足す・直す */
  function courseForm(c, fid) {
    var isNew = !c;
    c = c || { faculty: fid || (faculties()[0] || DATA.FACULTIES[0]).id, level: 1, teacher: 'staff2', img: '', summary: '', title: '', status: 'draft' };
    var imgs = IMGS.map(function (k) { return 'assets/img/' + k + '.webp'; });
    if (c.img && imgs.indexOf(c.img) < 0) imgs.unshift(c.img);
    var imgPick = '<fieldset class="field a-cms__imgs"><legend class="field__label">写真<span class="opt">任意</span></legend><div class="a-cms__imggrid">' +
      '<label class="a-cms__img is-none"><input type="radio" name="img" value=""' + (!c.img ? ' checked' : '') + '><span>なし</span></label>' +
      imgs.map(function (src, i) {
        return '<label class="a-cms__img"><input type="radio" name="img" value="' + esc(src) + '"' + (src === c.img ? ' checked' : '') + '><img src="' + esc(src) + '" alt="" loading="lazy"><span class="sr-only">写真' + (i + 1) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="btn btn-ghost btn-s a-cms__upload">' + icon('upload', 'ico-s') + '写真を上げる<input type="file" accept="image/*" data-cs-upload class="sr-only"></label>' +
      '<small>横長（16:9）で切り取ります。</small></fieldset>';
    cms.formDrawer({
      title: isNew ? '講座を足す' : '講座を直す', ok: isNew ? '講座を足す' : '保存する', cls: 'a-courses', wide: true,
      body: cms.field({ name: 'title', label: '講座の名前', value: c.title, required: true, maxlength: 40 }) +
        '<div class="a-cms__row2">' +
          cms.field({ name: 'faculty', label: '学部', type: 'select', value: c.faculty, options: faculties().map(function (f) { return [f.id, f.name]; }) }) +
          cms.field({ name: 'level', label: '開くレベル', type: 'select', value: String(c.level), options: levelOptions() }) +
        '</div>' +
        cms.field({ name: 'teacher', label: '講師', type: 'select', value: c.teacher, options: cms.staffOptions(/講師|運営|税理士/) }) +
        cms.field({ name: 'summary', label: '講座の説明', type: 'textarea', value: c.summary, rows: 3, maxlength: 200, opt: true }) +
        imgPick + statusFields(c),
      onMount: function (form) {
        bindStatus(form);
        var up = form.querySelector('[data-cs-upload]');
        up.addEventListener('change', function () {
          var f = up.files && up.files[0]; if (!f) return;
          if (!/^image\//.test(f.type)) { U.toast('写真のファイルを選んでください', 'error'); return; }
          shrink(f, function (url) {
            if (!url) { U.toast('写真を読み込めませんでした', 'error'); return; }
            var grid = form.querySelector('.a-cms__imggrid');
            grid.insertAdjacentHTML('afterbegin', '<label class="a-cms__img"><input type="radio" name="img" value="' + esc(url) + '" checked><img src="' + esc(url) + '" alt=""><span class="sr-only">上げた写真</span></label>');
            U.$$('input[name=img]', grid).forEach(function (r, i) { r.checked = i === 0; });
          });
        });
      },
      onSubmit: function (d) {
        var e = {};
        d.title = String(d.title || '').trim();
        if (!d.title) e.title = '講座の名前を入れてください';
        else if (allCourses().some(function (x) { return x.title === d.title && (!c.id || x.id !== c.id); })) e.title = '同じ名前の講座があります';
        checkStatus(d, e);
        if (Object.keys(e).length) return { ok: false, errors: e };
        var patch = Object.assign({ title: d.title, faculty: d.faculty, level: +d.level, teacher: d.teacher, summary: String(d.summary || '').trim(), img: d.img || '' }, statusPatch(d));
        var before = isNew ? 'draft' : statusOf(c), id = c.id;
        save(function (b) {
          if (isNew) {
            id = cms.uid('cs');
            b.added.push(Object.assign({ id: id, lessons: [], quiz: [], createdAt: CLG.now().toISOString(), createdBy: (AD.db.staff() || {}).id }, patch));
          } else {
            var moved = c.faculty !== patch.faculty;
            b.courses[c.id] = Object.assign({}, b.courses[c.id] || {}, patch);
            if (moved && b.courseOrder[c.faculty]) b.courseOrder[c.faculty] = b.courseOrder[c.faculty].filter(function (x) { return x !== c.id; });
          }
        });
        var pushed = syncCourse(id);
        AD.db.audit({ action: isNew ? 'course_add' : 'course_edit', label: isNew ? '講座を足した' : '講座を直した', target: { type: 'course', id: id, name: d.title }, detail: statusText(patch) });
        publishedToast(before, patch.status, '講座', isNew, pushed, facultyDraft(patch.faculty) && patch.status === 'published' ? '。学部が下書きのあいだは会員ページに出ません' : isNew && patch.status === 'published' ? '。公開した回ができると会員ページに出ます' : '');
        if (isNew) AD.app.go('#/courses/' + encodeURIComponent(id)); else cur.refresh();
        return { ok: true };
      }
    });
  }
  /* 写真を横長 640×360 の JPEG にして data URL で持つ（保存先が小さいため） */
  function shrink(file, done) {
    var fr = new FileReader();
    fr.onerror = function () { done(null); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { done(null); };
      img.onload = function () {
        try {
          var W = 640, H = 360, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
          cv.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
          done(cv.toDataURL('image/jpeg', 0.78));
        } catch (e) { done(null); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* 回を足す・直す */
  function lessonForm(c, l) {
    var isNew = !l;
    l = l || { title: '', min: 12, desc: '', points: [], material: null, status: 'draft' };
    var pts = (l.points || []).concat(['', '', '']).slice(0, 3);
    var mt = l.material || { name: '', type: 'pdf' };
    cms.formDrawer({
      title: isNew ? c.title + '：回を足す' : '第' + (lessonsOf(c).map(function (x) { return x.id; }).indexOf(l.id) + 1) + '回を直す', ok: isNew ? '回を足す' : '保存する', cls: 'a-courses', wide: true,
      body: cms.field({ name: 'title', label: '回の名前', value: l.title, required: true, maxlength: 40 }) +
        '<div class="a-cms__row2">' +
          cms.field({ name: 'min', label: '長さ（分）', type: 'number', value: l.min, required: true, min: 1, max: 60, hint: DATA.SITE.lessonLength }) +
          cms.field({ name: 'video', label: '動画ID', value: l.video || (isNew ? '' : videoId(l)), required: true, maxlength: 12, placeholder: '872314056', hint: 'Vimeo の動画の番号' }) +
        '</div>' +
        cms.field({ name: 'desc', label: 'この回の説明', type: 'textarea', value: l.desc, rows: 3, maxlength: 200, opt: true }) +
        '<fieldset class="field a-cms__pts"><legend class="field__label">この回でわかること<span class="opt">任意</span></legend>' +
          pts.map(function (p, i) { return '<label class="sr-only" for="csPt' + i + '">' + (i + 1) + 'つ目</label><input class="input" id="csPt' + i + '" name="pt' + i + '" value="' + esc(p) + '" maxlength="40" autocomplete="off">'; }).join('') +
        '</fieldset>' +
        '<div class="a-cms__row2">' +
          cms.field({ name: 'matName', label: '資料の名前', value: mt.name, opt: true, maxlength: 40, placeholder: '手順書（PDF・2ページ）' }) +
          cms.field({ name: 'matType', label: '資料の形', type: 'select', value: mt.type || 'pdf', options: [['pdf', 'PDF'], ['txt', 'テキスト'], ['sheet', '表計算'], ['zip', 'まとめたファイル']] }) +
        '</div>' +
        '<label class="btn btn-ghost btn-s a-cms__upload">' + icon('upload', 'ico-s') + '資料を上げる<input type="file" data-cs-mat class="sr-only"></label>' +
        statusFields(l) +
        '<p class="a-cms__xp">見終えると ' + DATA.XP.lesson + ' XP（学びの経験値）。</p>',
      foot: isNew || !l.added ? '' : '<button type="button" class="btn btn-text a-cms__del" data-cs-lesson-del="' + esc(l.id) + '">この回を消す</button>',
      onMount: function (form, dw) {
        bindStatus(form);
        var f = form.querySelector('[data-cs-mat]');
        f.addEventListener('change', function () {
          var file = f.files && f.files[0]; if (!file) return;
          var ext = (/\.(\w+)$/.exec(file.name) || [])[1] || '';
          form.matName.value = file.name.replace(/\.\w+$/, '') + '（' + (ext ? ext.toUpperCase() : 'ファイル') + '）';
          form.matType.value = /pdf/i.test(ext) ? 'pdf' : /txt|md/i.test(ext) ? 'txt' : /xlsx?|csv|numbers/i.test(ext) ? 'sheet' : 'zip';
          if (dw.setDirty) dw.setDirty(true);
          U.toast('本番では資料のファイルも保存します。試作版は名前だけ残します');
        });
        var del = dw.querySelector('[data-cs-lesson-del]');
        if (del) del.addEventListener('click', function () {
          U.confirmBox('この回を消しますか', '「' + l.title + '」を消します。元に戻せません。', '消す', true).then(function (ok) {
            if (!ok) return;
            save(function (b) {
              b.addedLessons[c.id] = (b.addedLessons[c.id] || []).filter(function (x) { return x.id !== l.id; });
              delete b.lessons[l.id];
              if (b.lessonOrder[c.id]) b.lessonOrder[c.id] = b.lessonOrder[c.id].filter(function (x) { return x !== l.id; });
            });
            if (facultyOk(c.faculty)) AD.ops.cmsRemove('lesson', l.id);
            AD.db.audit({ action: 'lesson_delete', label: '回を消した', target: { type: 'course', id: c.id, name: c.title }, detail: l.title });
            dw.close(); U.toast('回を消しました', 'ok'); cur.refresh();
          });
        });
      },
      onSubmit: function (d) {
        var e = {}, min = parseInt(d.min, 10), video = String(d.video || '').replace(/\s+/g, '');
        d.title = String(d.title || '').trim();
        if (!d.title) e.title = '回の名前を入れてください';
        if (!(min >= 1 && min <= 60)) e.min = '長さは1〜60分で入れてください';
        if (!video) e.video = '動画IDを入れてください';
        else if (!/^\d{6,12}$/.test(video)) e.video = '動画IDは6〜12桁の数字です';
        checkStatus(d, e);
        if (Object.keys(e).length) return { ok: false, errors: e };
        var patch = Object.assign({ title: d.title, min: min, video: video, desc: String(d.desc || '').trim(),
          points: [d.pt0, d.pt1, d.pt2].map(function (x) { return String(x || '').trim(); }).filter(Boolean),
          material: String(d.matName || '').trim() ? { name: String(d.matName).trim(), type: d.matType } : null }, statusPatch(d));
        var before = isNew ? 'draft' : statusOf(l), lid = isNew ? cms.uid('ls') : l.id;
        save(function (b) {
          if (isNew) {
            (b.addedLessons[c.id] = b.addedLessons[c.id] || []).push(Object.assign({ id: lid }, patch));
          } else b.lessons[l.id] = Object.assign({}, b.lessons[l.id] || {}, patch);
        });
        // 足した講座に、はじめての回を足したとき：講座の記録も会員ページに出しておく（回は講座がないと足せない）
        if (c.added && !R.cmsItem('course', c.id)) syncCourse(c.id);
        var pushed = facultyOk(c.faculty) ? syncLesson(findCourse(c.id), lid) : null;
        AD.db.audit({ action: isNew ? 'lesson_add' : 'lesson_edit', label: isNew ? '回を足した' : '回を直した', target: { type: 'course', id: c.id, name: c.title }, detail: d.title });
        publishedToast(before, patch.status, '回', isNew, pushed === null ? undefined : pushed, statusOf(c) !== 'published' ? '。講座が下書きのあいだは会員ページに出ません' : facultyDraft(c.faculty) ? '。学部が下書きのあいだは会員ページに出ません' : '');
        cur.refresh();
        return { ok: true };
      }
    });
  }

  /* 確認テスト（3問） */
  function quizForm(c) {
    var qz = quizOf(c).slice(0, 3);
    while (qz.length < 3) qz.push({ q: '', choices: ['', '', ''], answer: 0, why: '' });
    cms.formDrawer({
      title: c.title + '：確認テスト', ok: '保存する', cls: 'a-courses', wide: true,
      lead: '<p class="a-cms__lead">3問。' + DATA.QUIZ_PASS + '問以上で合格、' + DATA.XP.quiz + ' XP。</p>',
      body: qz.map(function (x, i) {
        var ch = (x.choices || []).concat(['', '', '']).slice(0, 3);
        return '<fieldset class="a-cms__qbox"><legend>' + (i + 1) + '問目</legend>' +
          cms.field({ name: 'q' + i, label: '問題', value: x.q, required: true, maxlength: 80 }) +
          '<div class="field a-cms__choices" data-field><span class="field__label">答え（正しいものを選ぶ）</span>' + ch.map(function (v, j) {
            return '<div class="a-cms__choice"><input type="radio" name="a' + i + '" value="' + j + '" id="csA' + i + j + '"' + (x.answer === j ? ' checked' : '') + ' aria-label="' + (j + 1) + 'つ目を正解にする">' +
              '<label class="sr-only" for="csC' + i + j + '">' + (i + 1) + '問目の' + (j + 1) + 'つ目の答え</label><input class="input" id="csC' + i + j + '" name="c' + i + '_' + j + '" value="' + esc(v) + '" maxlength="60" autocomplete="off"></div>';
          }).join('') + '</div>' +
          cms.field({ name: 'w' + i, label: '解説', value: x.why, opt: true, maxlength: 120 }) +
        '</fieldset>';
      }).join(''),
      onSubmit: function (d) {
        var e = {}, out = [];
        for (var i = 0; i < 3; i++) {
          var q = String(d['q' + i] || '').trim(), ch = [0, 1, 2].map(function (j) { return String(d['c' + i + '_' + j] || '').trim(); });
          if (!q) e['q' + i] = '問題を入れてください';
          if (ch.some(function (x) { return !x; })) e['c' + i + '_' + (ch.indexOf(''))] = '答えを3つとも入れてください';
          out.push({ q: q, choices: ch, answer: parseInt(d['a' + i], 10) || 0, why: String(d['w' + i] || '').trim() });
        }
        if (Object.keys(e).length) return { ok: false, errors: e };
        save(function (b) { b.quiz[c.id] = out; });
        var pushed = facultyOk(c.faculty) ? cms.push('course', { id: c.id, quiz: out }, '確認テストを') : false;
        AD.db.audit({ action: 'quiz_edit', label: '確認テストを直した', target: { type: 'course', id: c.id, name: c.title }, detail: '3問' });
        if (pushed || !facultyOk(c.faculty)) U.toast('確認テストを保存しました' + (pushed ? '。会員ページの講座にも出ています' : ''), 'ok');
        cur.refresh();
        return { ok: true };
      }
    });
  }

  /* 学部を足す・直す（会員ページの記録：R.cmsUpsert('faculty')。講座のある学部だけが会員ページ・公開サイトに出る） */
  function facultyForm(id) {
    var f = id ? faculties().filter(function (x) { return x.id === id; })[0] : null;
    if (id && !f) { U.toast('この学部は見つかりません', 'error'); return; }
    f = f || { name: '', desc: '', img: '', alt: '', publish: 'published' };
    // 写真は data.js の学部の写真から選ぶ（説明の文 alt も一緒に）
    var photos = cms.base('faculty').filter(function (x) { return x.img; });
    var imgOpts = [['', 'なし']].concat(photos.map(function (x) { return [x.img, x.name + 'の写真（' + x.alt + '）']; }));
    cms.formDrawer({
      title: id ? '学部を直す' : '学部を足す', ok: id ? '保存する' : '学部を足す', cls: 'a-courses',
      body: cms.field({ name: 'name', label: '学部の名前', value: f.name, required: true, maxlength: 20, placeholder: '◯◯の学部' }) +
        cms.field({ name: 'desc', label: '説明', type: 'textarea', value: f.desc, rows: 2, maxlength: 60, opt: true, placeholder: '副業の基礎、お金と税金' }) +
        cms.field({ name: 'img', label: '写真', type: 'select', value: f.img || '', options: imgOpts }) +
        cms.radios({ name: 'publish', label: '状態', value: f.publish, options: [['draft', '下書き'], ['published', '公開']],
          hint: '下書きの学部の講座は、会員ページに出ません' }),
      onSubmit: function (d) {
        var name = String(d.name || '').trim();
        if (!name) return { ok: false, errors: { name: '学部の名前を入れてください' } };
        if (faculties().some(function (x) { return x.name === name && x.id !== id; })) return { ok: false, errors: { name: '同じ名前の学部があります' } };
        var ph = photos.filter(function (x) { return x.img === d.img; })[0];
        var r = AD.ops.cms('faculty', { id: id || undefined, name: name, desc: String(d.desc || '').trim(), img: d.img || '', alt: ph ? ph.alt : '', publish: d.publish === 'draft' ? 'draft' : 'published' });
        if (!r || r.ok === false) {
          var e = (r && r.errors) || {};
          return e.name || e.desc ? { ok: false, errors: { name: e.name || '', desc: e.desc || '' } } : { ok: false, error: AD.ops.cmsError(r) };
        }
        AD.db.audit({ action: id ? 'faculty_edit' : 'faculty_add', label: id ? '学部を直した' : '学部を足した', target: { type: 'faculty', id: r.id || id, name: name } });
        U.toast(id ? '学部を直しました' : '学部を足しました。講座を足すと会員ページにも出ます', 'ok');
        cur.refresh(id ? undefined : { focus: '[data-cs-new="' + String(r.id || '').replace(/["\\]/g, '') + '"]' });
        return { ok: true };
      }
    });
  }

  function deleteFaculty(id) {
    var f = faculties().filter(function (x) { return x.id === id && x.added; })[0];
    if (!f || coursesOf(id).length) return;
    U.confirmBox('学部を消しますか', '「' + f.name + '」を消します。講座はまだありません。', '消す', true).then(function (ok) {
      if (!ok) return;
      var r = AD.ops.cmsRemove('faculty', id);
      if (!r || r.ok === false) { U.toast(AD.ops.cmsError(r) || '消せませんでした', 'error'); return; }
      AD.db.audit({ action: 'faculty_delete', label: '学部を消した', target: { type: 'faculty', id: id, name: f.name } });
      U.toast('学部を消しました', 'ok');
      cur.refresh({ focus: '[data-cs-fac-new]' });
    });
  }

  /* 録画を登録する・直す（イベントの画面からも呼ぶ：AD.cms.archiveForm(pre, onSaved)） */
  function archiveForm(a, onSaved) {
    var isNew = !a || !a.id;
    a = Object.assign({ title: '', faculty: 'skill', date: CLG.now().toISOString(), min: 60, teacher: 'staff3', desc: '', chapters: [['0:00', 'はじめに']], files: [], status: 'published' }, a || {});
    var genres = faculties().map(function (f) { return [f.id, f.name]; }).concat([['showcase', '成果発表会']]);
    cms.formDrawer({
      title: isNew ? '録画を登録する' : '録画を直す', ok: isNew ? '登録する' : '保存する', cls: 'a-courses', wide: true,
      body: cms.field({ name: 'title', label: '録画の名前', value: a.title, required: true, maxlength: 50 }) +
        '<div class="a-cms__row2">' +
          cms.field({ name: 'faculty', label: 'ジャンル', type: 'select', value: a.faculty, options: genres }) +
          cms.field({ name: 'teacher', label: '講師', type: 'select', value: a.teacher, options: cms.staffOptions() }) +
        '</div><div class="a-cms__row3">' +
          cms.field({ name: 'date', label: '開催日', type: 'date', value: cms.localD(a.date), required: true }) +
          cms.field({ name: 'min', label: '長さ（分）', type: 'number', value: a.min, required: true, min: 1, max: 300 }) +
          cms.field({ name: 'video', label: '動画ID', value: a.video || '', required: true, maxlength: 12, placeholder: '872314056' }) +
        '</div>' +
        cms.field({ name: 'desc', label: '内容', type: 'textarea', value: a.desc, rows: 3, maxlength: 300, opt: true }) +
        cms.field({ name: 'chapters', label: '章', type: 'textarea', rows: 4, opt: true, hint: '1行に1つ。「6:10 月次レポートの下書き」の形',
          value: (a.chapters || []).map(function (c) { return c[0] + ' ' + c[1]; }).join('\n') }) +
        cms.field({ name: 'files', label: '資料', type: 'textarea', rows: 2, opt: true, hint: '1行に1つ。「スライド（PDF・18ページ）」の形',
          value: (a.files || []).map(function (f) { return f.name; }).join('\n') }) +
        cms.radios({ name: 'status', label: '状態', value: a.status === 'draft' ? 'draft' : 'published', options: [['draft', '下書き'], ['published', '公開']] }) +
        (onSaved ? cms.check({ name: 'notify', label: '会員にお知らせを出す（全員）', value: true }) : ''),
      onSubmit: function (d) {
        var e = {}, min = parseInt(d.min, 10), video = String(d.video || '').replace(/\s+/g, ''), date = cms.parseDT(d.date);
        var title = String(d.title || '').trim();
        if (!title) e.title = '録画の名前を入れてください';
        if (!date) e.date = '開催日を選んでください'; else if (date > CLG.now()) e.date = '開催日は今日までの日にしてください';
        if (!(min >= 1 && min <= 300)) e.min = '長さは1〜300分で入れてください';
        if (!/^\d{6,12}$/.test(video)) e.video = '動画IDは6〜12桁の数字です';
        var chapters = [], bad = false;
        String(d.chapters || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (line) {
          var m = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(line.replace(/　/g, ' '));
          if (m) chapters.push([m[1], m[2]]); else bad = true;
        });
        if (bad) e.chapters = '「6:10 題」のように、時刻と題を空白で区切ってください';
        if (Object.keys(e).length) return { ok: false, errors: e };
        if (a.date) { var old = new Date(a.date); date.setHours(old.getHours(), old.getMinutes()); } else date.setHours(20, 0);
        var files = String(d.files || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (n) { return { name: n, type: /PDF/i.test(n) ? 'pdf' : 'txt' }; });
        var fac = d.faculty, genre = fac === 'showcase' ? '成果発表会' : facultyName(fac);
        var row = { title: title, faculty: fac, genre: genre, date: date.toISOString(), min: min, teacher: d.teacher, video: video, desc: String(d.desc || '').trim(), chapters: chapters, files: files, status: d.status || 'published' };
        var id = a.id;
        save(function (b) {
          if (isNew) { id = cms.uid('ar'); b.archive.push(Object.assign({ id: id, newAt: CLG.now().toISOString(), event: a.event || null, createdBy: (AD.db.staff() || {}).id }, row)); }
          else if (a.added) b.archive = b.archive.map(function (x) { return x.id === id ? Object.assign({}, x, row) : x; });
          else b.archiveEdits[id] = Object.assign({}, b.archiveEdits[id] || {}, row);
        });
        var pushed = syncArchive(id);
        AD.db.audit({ action: isNew ? 'archive_add' : 'archive_edit', label: isNew ? '録画を登録した' : '録画を直した', target: { type: 'archive', id: id, name: title }, detail: genre + '・' + min + '分' });
        if (d.notify && row.status === 'published' && pushed) cms.notify({ target: 'all', text: '勉強会の録画「' + title + '」を載せました', link: '#/courses/archive/' + encodeURIComponent(id) });
        if (pushed) U.toast(row.status === 'published' ? '録画を載せました。会員ページの「勉強会の録画」にも出ています' : '録画を下書きで保存しました', 'ok');
        if (onSaved) onSaved(id); else if (cur) cur.refresh();
        return { ok: true };
      }
    });
  }
  cms.archiveForm = archiveForm;
  cms.archiveRows = archiveRows;

  /* ---------- 並べ替え ---------- */
  function move(kind, id, dir) {
    var d = dir === 'up' ? -1 : 1, name = '', edge = false, facIds = null;
    save(function (b) {
      var ids, key;
      if (kind === 'faculty') { ids = faculties().map(function (f) { return f.id; }); }
      else if (kind === 'course') { var c = findCourse(id); key = c.faculty; ids = coursesOf(c.faculty).map(function (x) { return x.id; }); name = c.title; }
      else { var cc = allCourses().filter(function (x) { return lessonsOf(x).some(function (l) { return l.id === id; }); })[0]; key = cc.id; ids = lessonsOf(cc).map(function (l) { return l.id; }); }
      var i = ids.indexOf(id), j = i + d;
      if (i < 0 || j < 0 || j >= ids.length) return;
      ids.splice(j, 0, ids.splice(i, 1)[0]);
      edge = j === 0 || j === ids.length - 1;
      if (kind === 'faculty') facIds = ids;
      else if (kind === 'course') b.courseOrder[key] = ids;
      else b.lessonOrder[key] = ids;
    });
    // 会員ページの並びにも（学部の並びは会員ページの記録だけに持つ）
    if (kind === 'faculty' && facIds) AD.ops.cmsReorder('faculty', facIds);
    else if (kind === 'course') { var c2 = findCourse(id); if (c2 && facultyOk(c2.faculty)) AD.ops.cmsReorder('course', coursesOf(c2.faculty).map(function (x) { return x.id; }), c2.faculty); }
    else if (kind === 'lesson') { var c3 = allCourses().filter(function (x) { return lessonsOf(x).some(function (l) { return l.id === id; }); })[0]; if (c3 && facultyOk(c3.faculty)) AD.ops.cmsReorder('lesson', lessonsOf(c3).map(function (l) { return l.id; }), c3.id); }
    // いちばん上（下）まで来ると同じボタンは押せなくなるので、焦点は反対のボタンへ
    var to = edge ? (dir === 'up' ? 'down' : 'up') : dir;
    cur.refresh({ focus: '[data-cs-move="' + kind + '"][data-id="' + String(id).replace(/["\\]/g, '') + '"][data-dir="' + to + '"]' });
    cur.announce((dir === 'up' ? '上' : '下') + 'へ動かしました');
  }

  function csvCourses() {
    var lvc = lvCounts(), rows = [];
    faculties().forEach(function (f) { coursesOf(f.id).forEach(function (c, i) { var ls = lessonsOf(c), s = stats(c, lvc); rows.push({ f: f.name, i: i + 1, c: c, ls: ls, s: s }); }); });
    AU.downloadCsv('講座', rows, [
      { label: '学部', value: function (r) { return r.f; } }, { label: '順', value: function (r) { return r.i; } },
      { label: '講座', value: function (r) { return r.c.title; } }, { label: '講座のid', value: function (r) { return r.c.id; } },
      { label: '開くLv', value: function (r) { return r.c.level; } }, { label: '講師', value: function (r) { return teacherName(r.c.teacher); } },
      { label: '回', value: function (r) { return r.ls.length; } }, { label: '分', value: function (r) { return minutesOf(r.ls); } },
      { label: '見始めた', value: function (r) { return r.s.started; } }, { label: '修了', value: function (r) { return r.s.done; } },
      { label: '状態', value: function (r) { return statusText(r.c); } }
    ]);
  }

  AD.screens.courses = {
    title: function (ctx) {
      if (!ctx.params[0]) return '講座';
      var c = findCourse(ctx.params[0]); return c ? c.title : 'ページが見つかりません';
    },
    render: function (ctx) {
      if (ctx.params[0]) {
        var c = findCourse(ctx.params[0]);
        if (!c) return '<div class="a-courses">' + AU.head({ title: 'ページが見つかりません', crumb: [['#/courses', '講座']], sub: 'この講座はありません。' }) +
          '<a class="btn btn-ink" href="#/courses">講座の一覧へ</a></div>';
        return detail(ctx, c);
      }
      var tab = ctx.query.tab || 'tree';
      var all = allCourses(), lessons = all.reduce(function (a, c) { return a + lessonsOf(c).length; }, 0);
      var arc = archiveRows();
      var tabs = AU.tabs([
        { id: 'tree', label: '講座', href: '#/courses', n: all.length },
        { id: 'archive', label: '勉強会の録画', href: '#/courses?tab=archive', n: arc.length },
        { id: 'stats', label: '視聴', href: '#/courses?tab=stats' }
      ], tab, '講座の表示');
      var body = tab === 'archive' ? archiveView(ctx) : tab === 'stats' ? statsView(ctx) : treeView(ctx);
      var acts = tab === 'tree' ? '<button type="button" class="btn btn-ink btn-s" data-cs-new=""' + dis(canAll()) + '>' + icon('plus', 'ico-s') + '講座を足す</button>' :
        tab === 'archive' ? '<button type="button" class="btn btn-ink btn-s" data-cs-arc-new' + dis(canAll()) + '>' + icon('plus', 'ico-s') + '録画を登録する</button>' : '';
      return '<div class="a-courses">' +
        AU.head({ title: '講座', sub: '講座 ' + all.length + '本・動画 ' + lessons + '本・勉強会の録画 ' + arc.length + '本', actions: acts }) +
        (tab === 'stats' ? '' : AU.roleNote('content', '講座と録画の編集')) +
        tabs + body + '</div>';
    },
    mount: function (root, ctx) {
      cur = ctx;
      setTimeout(function () { if (migrateFaculties() && cur) cur.refresh(); }, 0);
      if (root.__boundCourses) return;
      root.__boundCourses = true;
      root.addEventListener('click', function (e) {
        var t = e.target, b;
        if (!t.closest('.a-courses')) return;
        if ((b = t.closest('[data-cs-move]'))) { e.preventDefault(); if (!b.disabled && AU.need('content')) move(b.getAttribute('data-cs-move'), b.getAttribute('data-id'), b.getAttribute('data-dir')); return; }
        if ((b = t.closest('[data-cs-new]'))) { if (AU.need('content')) courseForm(null, b.getAttribute('data-cs-new') || null); return; }
        if ((b = t.closest('[data-cs-edit]'))) { var ce = findCourse(b.getAttribute('data-cs-edit')); if (ce && AU.need('content', { owner: ce.teacher })) courseForm(ce); return; }
        if ((b = t.closest('[data-cs-fac-new]'))) { if (AU.need('content')) facultyForm(); return; }
        if ((b = t.closest('[data-cs-fac-edit]'))) { if (AU.need('content')) facultyForm(b.getAttribute('data-cs-fac-edit')); return; }
        if ((b = t.closest('[data-cs-fac-del]'))) { if (AU.need('content')) deleteFaculty(b.getAttribute('data-cs-fac-del')); return; }
        if ((b = t.closest('[data-cs-csv]'))) { csvCourses(); return; }
        if ((b = t.closest('[data-cs-clear]'))) { cur.setQuery({ q: null, status: null }, { focus: '#csQ' }); return; }
        if ((b = t.closest('[data-cs-lesson-new]'))) { var cn = findCourse(b.getAttribute('data-cs-lesson-new')); if (cn && AU.need('content', { owner: cn.teacher })) lessonForm(cn); return; }
        if ((b = t.closest('[data-cs-lesson]'))) {
          var c = findCourse(cur.params[0]); if (!c || !AU.need('content', { owner: c.teacher })) return;
          lessonForm(c, lessonsOf(c).filter(function (l) { return l.id === b.getAttribute('data-cs-lesson'); })[0]);
          return;
        }
        if ((b = t.closest('[data-cs-quiz]'))) { var cq = findCourse(b.getAttribute('data-cs-quiz')); if (cq && AU.need('content', { owner: cq.teacher })) quizForm(cq); return; }
        if ((b = t.closest('[data-cs-arc-new]'))) { if (AU.need('content')) archiveForm(null); return; }
        if ((b = t.closest('[data-cs-arc]'))) {
          var a = archiveRows().filter(function (x) { return x.id === b.getAttribute('data-cs-arc'); })[0];
          if (a && AU.need('content', { owner: a.teacher })) archiveForm(a);
          return;
        }
        // 録画の行を押したら、題のボタンと同じ（直す引き出しを開く）
        var tr = t.closest('tr[data-tb-row]');
        if (tr && !tr.hasAttribute('data-tb-href') && !t.closest('a,button,input,select,textarea,label') && !String(window.getSelection ? window.getSelection() : '')) {
          var ob = tr.querySelector('[data-cs-arc]'); if (ob) { ob.focus(); ob.click(); }
        }
      });
      root.addEventListener('change', function (e) {
        var t = e.target;
        if (t.matches && t.matches('.a-courses [data-cs-status]')) cur.setQuery({ status: t.value || null }, { replace: true });
      });
      root.addEventListener('submit', function (e) {
        var f = e.target;
        if (!f.matches || !f.matches('.a-courses [data-cs-search]')) return;
        e.preventDefault();
        cur.setQuery({ q: String(f.q.value || '').trim() || null }, { replace: true, focus: '#csQ' });
      });
      var qt = null;
      root.addEventListener('input', function (e) {
        var t = e.target;
        if (!t.matches || !t.matches('.a-courses #csQ') || e.isComposing) return;
        clearTimeout(qt);
        qt = setTimeout(function () { cur.setQuery({ q: String(t.value || '').trim() || null }, { replace: true, focus: '#csQ' }); }, 300);
      });
    }
  };
})();
