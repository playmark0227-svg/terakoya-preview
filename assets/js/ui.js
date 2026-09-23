/* ============================================================
   画面まわりの共通部品（公開サイト・会員ページで共通）
   HTMLは文字列で組む。外から来た文字は必ず esc() を通す。
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- 数と日付 ---------- */
  function yen(n) { return '¥' + Math.round(n || 0).toLocaleString('ja-JP'); }
  function num(n) { return Math.round(n || 0).toLocaleString('ja-JP'); }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function toDate(d) { return d instanceof Date ? d : new Date(d); }
  /** 2026年9月23日(水) */
  function fmtDate(d, opt) {
    d = toDate(d); opt = opt || {};
    var s = (opt.noYear ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (opt.wd !== false) s += '(' + WD[d.getDay()] + ')';
    if (opt.time) s += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return s;
  }
  /** 9/23(水) */
  function fmtShort(d, time) {
    d = toDate(d);
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')' + (time ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** 「3時間前」「昨日」など。基準は CLG.now()（検証用に動かせる） */
  function relTime(d) {
    var now = CLG.now ? CLG.now() : new Date(), t = toDate(d);
    var diff = (now - t) / 1000;
    if (diff < 0) return fmtShort(d, true);
    if (diff < 60) return 'たった今';
    if (diff < 3600) return Math.floor(diff / 60) + '分前';
    // 日をまたいだら暦の日数で数える（おとといの夜を「昨日」と言わないため）
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    var b = new Date(t); b.setHours(0, 0, 0, 0);
    var days = Math.round((a - b) / 86400000);
    if (days === 0) return Math.floor(diff / 3600) + '時間前';
    if (days === 1) return '昨日';
    if (days < 7) return days + '日前';
    return fmtShort(d);
  }

  /* ---------- 一言の知らせ ---------- */
  function toast(msg, kind) {
    var host = $('#toast');
    if (!host) { host = document.createElement('div'); host.id = 'toast'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'ok' ? ' is-ok' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* ---------- 重ねる窓 ----------
     modal(html, {wide, sticky, onClose}) → 窓の要素（.close() で閉じる）
     中の [data-close] を押すと閉じる。 */
  function modal(html, opts) {
    opts = opts || {};
    var bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' + html + '</div>';
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    function isTop() { var all = $$('.modal-bg'); return all[all.length - 1] === bg; }
    function close() {
      if (!bg.parentNode) return;
      bg.remove();
      // 下にまだ窓が残っていれば、背景のスクロールは止めたままにする
      if (!$('.modal-bg')) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape' && !opts.sticky && isTop()) close(); }
    document.addEventListener('keydown', onKey);
    // 戻るボタンなどで画面が変わったら閉じる（窓が新しい画面に残らないように）
    window.addEventListener('hashchange', close);
    bg.addEventListener('click', function (e) { if (e.target === bg && !opts.sticky) close(); });
    $$('[data-close]', bg).forEach(function (b) { b.addEventListener('click', close); });
    bg.close = close;
    // 焦点：opts.focus の要素 → パソコンなら最初の入力欄 → それ以外は窓そのもの
    // （スマホで開いた瞬間にキーボードが出ないようにする）
    setTimeout(function () {
      var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
      var el = (opts.focus && $(opts.focus, bg)) || (fine && $('input:not([type=checkbox]):not([type=radio]),textarea,select', bg)) || $('.modal', bg);
      try { el.focus({ preventScroll: true }); } catch (e) {}
    }, 30);
    return bg;
  }

  function confirmBox(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = modal(
        '<h3 class="modal__ttl">' + esc(title) + '</h3>' +
        '<p class="sub">' + nl2br(message) + '</p>' +
        '<div class="modal__foot">' +
        '<button class="btn btn-soft" data-no>やめる</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-ink') + '" data-yes>' + esc(okLabel || 'OK') + '</button></div>',
        { sticky: true });
      $('[data-no]', m).addEventListener('click', function () { m.close(); resolve(false); });
      $('[data-yes]', m).addEventListener('click', function () { m.close(); resolve(true); });
    });
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    try {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    } catch (e) {}
    fallback();
    return Promise.resolve();
  }

  /** 保存させる。BOM は Excel で CSV を開くため。.ics など BOM を嫌う形式は opts.bom=false */
  function download(name, text, mime, opts) {
    var bom = !(opts && opts.bom === false);
    var blob = new Blob([(bom ? '\ufeff' : '') + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- 顔 ----------
     写真は使わず、名前の頭文字と色で見分ける。運営・講師は朱の輪を付ける。 */
  function initials(name) {
    var s = String(name || '').replace(/\s+/g, ' ').trim();
    if (!s) return '?';
    var p = s.split(' ');
    return p[0].slice(0, 2);
  }
  function avatar(person, size) {
    person = person || {};
    var cls = 'avatar' + (size === 's' ? ' avatar-s' : size === 'l' ? ' avatar-l' : '') + (person.staff ? ' is-staff' : '');
    return '<span class="' + cls + '" style="--c:' + esc(person.color || '#8b867d') + '" aria-hidden="true">' + esc(initials(person.name)) + '</span>';
  }

  function progressBar(pct, kind) {
    pct = Math.max(0, Math.min(100, pct || 0));
    return '<div class="bar' + (kind ? ' bar-' + kind : '') + '" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>';
  }
  /** 丸い進み。kind: 'ok' / 'ink' / 'gold'（省略すると朱） */
  function ring(pct, label, size, kind) {
    return '<div class="ring' + (kind ? ' ring-' + kind : '') + '" style="--p:' + Math.round(pct) + (size ? ';--size:' + size + 'px' : '') + '"><span>' + esc(label == null ? Math.round(pct) + '%' : label) + '</span></div>';
  }
  function lvBadge(lv, name) {
    return '<span class="lv"><b>Lv' + esc(lv) + '</b>' + esc(name || '') + '</span>';
  }
  function empty(iconName, text) {
    return '<div class="empty">' + icon(iconName || 'sparkle') + '<p>' + esc(text) + '</p></div>';
  }

  /* ---------- 記号 ----------
     線だけの20pxの記号。外部ファイルにせず埋め込み。
     名前 → 用途：ナビの各項目、一覧の先頭、ボタンの前 */
  var ICONS = {
    home:     '<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/>',
    flag:     '<path d="M4.5 17.5V3.2M4.5 3.8h9.2l-1.8 3.3 1.8 3.3H4.5"/>',
    play:     '<rect x="2.5" y="4.5" width="15" height="11" rx="2.2"/><path d="M8.5 7.9v4.2l3.6-2.1z"/>',
    feed:     '<path d="M4 4.5h12M4 8.5h12M4 12.5h7.5M4 16.5h5"/>',
    briefcase:'<rect x="2.6" y="6" width="14.8" height="10.4" rx="2"/><path d="M7.2 6V4.6A1.1 1.1 0 0 1 8.3 3.5h3.4a1.1 1.1 0 0 1 1.1 1.1V6M2.6 10.6h14.8"/>',
    calendar: '<rect x="3" y="4.2" width="14" height="12.8" rx="2"/><path d="M3 8.2h14M7 2.8v2.8M13 2.8v2.8"/>',
    gift:     '<rect x="3" y="7.2" width="14" height="3.4" rx=".8"/><path d="M4.2 10.6v5.6a.8.8 0 0 0 .8.8h10a.8.8 0 0 0 .8-.8v-5.6M10 7.2V17M10 7.2S8.8 3.4 6.8 3.8c-1.6.3-1.3 3.4 3.2 3.4zM10 7.2s1.2-3.8 3.2-3.4c1.6.3 1.3 3.4-3.2 3.4z"/>',
    trophy:   '<path d="M6.2 3.5h7.6v4.2a3.8 3.8 0 0 1-7.6 0zM10 11.5v3M7 17h6M6.2 5H3.6c0 2.4 1 3.6 2.8 3.8M13.8 5h2.6c0 2.4-1 3.6-2.8 3.8"/>',
    ticket:   '<path d="M3 6.2A1.2 1.2 0 0 1 4.2 5h11.6A1.2 1.2 0 0 1 17 6.2v2a2 2 0 0 0 0 3.6v2A1.2 1.2 0 0 1 15.8 15H4.2A1.2 1.2 0 0 1 3 13.8v-2a2 2 0 0 0 0-3.6z"/><path d="M12 5.4v1.4M12 9.3v1.4M12 13.2v1.4"/>',
    card:     '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><circle cx="7.3" cy="9.4" r="1.7"/><path d="M4.8 13.2c.4-1.2 1.3-1.8 2.5-1.8s2.1.6 2.5 1.8M11.5 8.5h3.6M11.5 11.2h2.6"/>',
    message:  '<path d="M17 12.2a1.6 1.6 0 0 1-1.6 1.6H7l-3.4 2.8v-2.8a1.6 1.6 0 0 1-.6-1.6V5.4A1.6 1.6 0 0 1 4.6 3.8h10.8A1.6 1.6 0 0 1 17 5.4z"/>',
    user:     '<circle cx="10" cy="7" r="3.2"/><path d="M4 17c.6-3 3-4.6 6-4.6s5.4 1.6 6 4.6"/>',
    users:    '<circle cx="7.6" cy="7.4" r="2.8"/><path d="M2.6 16.4c.5-2.6 2.5-4 5-4s4.5 1.4 5 4"/><path d="M13.4 5.2a2.6 2.6 0 0 1 0 5M14.4 12.8c1.8.4 2.8 1.7 3.1 3.6"/>',
    bell:     '<path d="M10 3.2a4.6 4.6 0 0 1 4.6 4.6c0 3.4 1.2 4.4 1.6 4.8H3.8c.4-.4 1.6-1.4 1.6-4.8A4.6 4.6 0 0 1 10 3.2z"/><path d="M8.4 15.2a1.7 1.7 0 0 0 3.2 0"/>',
    lock:     '<rect x="4.2" y="8.8" width="11.6" height="8.2" rx="1.8"/><path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.4 0v2.2"/>',
    unlock:   '<rect x="4.2" y="8.8" width="11.6" height="8.2" rx="1.8"/><path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.2-1.1"/>',
    check:    '<path d="M4.5 10.4 8.2 14l7.3-8"/>',
    checkc:   '<circle cx="10" cy="10" r="7.4"/><path d="M6.8 10.2 9 12.4l4.3-4.6"/>',
    circle:   '<circle cx="10" cy="10" r="7.4"/>',
    search:   '<circle cx="8.8" cy="8.8" r="5.3"/><path d="m12.8 12.8 4 4"/>',
    heart:    '<path d="M10 16.4S3.2 12.4 3.2 7.8A3.6 3.6 0 0 1 10 6.1a3.6 3.6 0 0 1 6.8 1.7c0 4.6-6.8 8.6-6.8 8.6z"/>',
    comment:  '<path d="M16.8 9.6c0 3.4-3 6-6.8 6-.9 0-1.8-.2-2.6-.4L3.6 16.4l1.1-3A5.6 5.6 0 0 1 3.2 9.6c0-3.4 3-6 6.8-6s6.8 2.6 6.8 6z"/>',
    share:    '<path d="M10 12.4V3.2M6.6 6.4 10 3l3.4 3.4M5.4 9.2H4.6a.9.9 0 0 0-.9.9v6.2a.9.9 0 0 0 .9.9h10.8a.9.9 0 0 0 .9-.9v-6.2a.9.9 0 0 0-.9-.9h-.8"/>',
    copy:     '<rect x="6.6" y="6.6" width="10" height="10" rx="1.8"/><path d="M13.4 6.6V4.8a1.4 1.4 0 0 0-1.4-1.4H4.8a1.4 1.4 0 0 0-1.4 1.4V12a1.4 1.4 0 0 0 1.4 1.4h1.8"/>',
    qr:       '<rect x="3" y="3" width="5.4" height="5.4" rx=".8"/><rect x="11.6" y="3" width="5.4" height="5.4" rx=".8"/><rect x="3" y="11.6" width="5.4" height="5.4" rx=".8"/><path d="M11.6 11.6h2.2v2.2h-2.2zM14.8 14.8H17V17h-2.2zM14.8 11.6H17M11.6 17h1.2"/>',
    download: '<path d="M10 3.4v9.4M6.4 9.4 10 13l3.6-3.6M3.6 16.6h12.8"/>',
    external: '<path d="M11.4 3.6h5v5M16.4 3.6 9.2 10.8M14.4 11.8v3.6a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1h3.6"/>',
    arrow:    '<path d="M3.8 10h12.4M11.6 5.4 16.2 10l-4.6 4.6"/>',
    back:     '<path d="M16.2 10H3.8M8.4 5.4 3.8 10l4.6 4.6"/>',
    plus:     '<path d="M10 4v12M4 10h12"/>',
    close:    '<path d="m5 5 10 10M15 5 5 15"/>',
    menu:     '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>',
    grid:     '<rect x="3" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="3" y="11.4" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.3"/>',
    clock:    '<circle cx="10" cy="10" r="7.4"/><path d="M10 5.8V10l2.8 1.8"/>',
    pin:      '<path d="M10 17.4s5.4-5 5.4-9.2a5.4 5.4 0 0 0-10.8 0c0 4.2 5.4 9.2 5.4 9.2z"/><circle cx="10" cy="8.2" r="2"/>',
    yen:      '<path d="M6.2 3.8 10 9.2l3.8-5.4M10 9.2v7M6.8 10.6h6.4M6.8 13.2h6.4"/>',
    star:     '<path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.8L10 13.8l-4.3 2.3.9-4.8L3.1 8l4.8-.6z"/>',
    fire:     '<path d="M10 17.2c-3 0-5.2-2-5.2-4.8 0-3.4 3.2-4.6 3.4-8.6 2.2 1.2 3.4 3.2 3.4 5 .8-.4 1.3-1.2 1.4-2.2 1.4 1.2 2.2 3 2.2 5.2 0 3.2-2.2 5.4-5.2 5.4z"/>',
    sparkle:  '<path d="M10 2.8c.5 3.6 1.6 4.7 5.2 5.2-3.6.5-4.7 1.6-5.2 5.2-.5-3.6-1.6-4.7-5.2-5.2 3.6-.5 4.7-1.6 5.2-5.2zM15.4 12.6c.2 1.5.7 2 2.2 2.2-1.5.2-2 .7-2.2 2.2-.2-1.5-.7-2-2.2-2.2 1.5-.2 2-.7 2.2-2.2z"/>',
    logout:   '<path d="M8 16.6H4.6a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1H8M12.4 13.6 16 10l-3.6-3.6M16 10H7.6"/>',
    receipt:  '<path d="M4.6 2.8h10.8v14.4l-2.2-1.4-2 1.4-1.2-.9-1.2.9-2-1.4-2.2 1.4z"/><path d="M7.4 6.6h5.2M7.4 9.4h5.2M7.4 12.2h3"/>',
    shield:   '<path d="M10 2.8 16 5v4.6c0 3.8-2.6 6.4-6 7.6-3.4-1.2-6-3.8-6-7.6V5z"/><path d="m7.4 10 1.8 1.8 3.6-3.8"/>',
    link:     '<path d="M8.6 11.4a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-1 1M11.4 8.6a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l1-1"/>',
    book:     '<path d="M10 5.4C8.4 4.2 6 3.8 3.4 4v11.4c2.6-.2 5 .2 6.6 1.4 1.6-1.2 4-1.6 6.6-1.4V4c-2.6-.2-5 .2-6.6 1.4zM10 5.4v11.4"/>',
    pen:      '<path d="M4.2 15.8 3.4 17l1.2-.8 9.1-9.1-1.7-1.7z"/><path d="M12 4.4 13.7 2.7a1 1 0 0 1 1.4 0l.9.9a1 1 0 0 1 0 1.4L14.3 6.7z"/>',
    chat:     '<path d="M3.4 5a1.6 1.6 0 0 1 1.6-1.6h7.4A1.6 1.6 0 0 1 14 5v4.8a1.6 1.6 0 0 1-1.6 1.6H7.6l-3 2.4v-2.4A1.6 1.6 0 0 1 3.4 9.8z"/><path d="M14 7.4h1.4A1.6 1.6 0 0 1 17 9v4.4a1.6 1.6 0 0 1-1.4 1.6v2l-2.6-2h-3a1.6 1.6 0 0 1-1.6-1.6v-.6"/>',
    line:     '<path d="M10 3.6c-4 0-7 2.5-7 5.6 0 2.8 2.4 5.1 5.7 5.5l-.4 2.2c-.1.3.3.6.6.4l3.4-2.7c2.8-.8 4.7-2.9 4.7-5.4 0-3.1-3-5.6-7-5.6z"/>',
    settings: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8"/>',
    info:     '<circle cx="10" cy="10" r="7.4"/><path d="M10 9v4.6M10 6.4v.2"/>',
    bolt:     '<path d="M11 2.8 4.6 11h4.8l-.8 6.2L15 9h-4.8z"/>',
    target:   '<circle cx="10" cy="10" r="7.2"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r=".9" fill="currentColor"/>',
    chart:    '<path d="M3.6 16.4h12.8M5.6 13.4v-3M9 13.4V6.6M12.4 13.4V9M15.8 13.4V4.6"/>',
    upload:   '<path d="M10 13V3.6M6.4 7.2 10 3.6l3.6 3.6M3.6 16.4h12.8"/>',
    camera:   '<path d="M3 7a1.4 1.4 0 0 1 1.4-1.4h2l1.2-1.8h4.8l1.2 1.8h2A1.4 1.4 0 0 1 17 7v7.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 14.6z"/><circle cx="10" cy="10.6" r="3"/>'
  };

  function icon(name, cls) {
    if (!ICONS[name]) return '';
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 20 20" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      ICONS[name] + '</svg>';
  }
  function chevron() {
    return '<svg class="ico chev" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7.8 4.5 13 10l-5.2 5.5"/></svg>';
  }

  /** 屋号の判子。サイト名の頭の1文字を朱の角印にする */
  function brandmark(site, sub) {
    return '<span class="brandmark"><span class="brandmark__seal">' + esc(site.seal) + '</span>' +
      '<span><span class="brandmark__name">' + esc(site.name) + '</span>' +
      (sub ? '<span class="brandmark__sub">' + esc(sub) + '</span>' : '') + '</span></span>';
  }

  CLG.ui = {
    esc: esc, nl2br: nl2br, $: $, $$: $$,
    yen: yen, num: num, fmtDate: fmtDate, fmtShort: fmtShort, relTime: relTime, pad: pad,
    toast: toast, modal: modal, confirmBox: confirmBox, copyText: copyText, download: download,
    initials: initials, avatar: avatar, progressBar: progressBar, ring: ring, lvBadge: lvBadge, empty: empty,
    icon: icon, chevron: chevron, brandmark: brandmark, ICONS: ICONS
  };
})(window);
