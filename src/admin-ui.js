/* Admin UI pro /admin/files - HTML rendrované Workerem až po ověření session.
   Veškerá klientská data se do DOM vkládají přes textContent (žádné innerHTML
   s uživatelským obsahem). ZIP "Stáhnout vše" se skládá v prohlížeči admina
   (STORE, bez komprese) - server jen autorizovaně streamuje soubory. */

const BASE_CSS = `
  :root { --paper:#f2f0ea; --paper2:#e9e6de; --ink:#141412; --muted:#5f5e57; --line:#d8d5cc; --accent:#2431e8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--paper); color:var(--ink); font-family:"Archivo",system-ui,sans-serif; font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1100px; margin-inline:auto; padding:2rem clamp(1rem,4vw,3rem) 5rem; }
  header.bar { display:flex; align-items:center; gap:1.5rem; padding-block:1.1rem; border-bottom:1px solid var(--line); margin-bottom:2rem; }
  .logo { font-weight:800; text-transform:uppercase; font-stretch:120%; font-size:1.1rem; letter-spacing:.01em; color:var(--ink); text-decoration:none; }
  .logo sup { font-size:.5em; }
  h1 { font-weight:800; text-transform:uppercase; font-stretch:115%; letter-spacing:-.01em; font-size:clamp(1.6rem,4vw,2.6rem); line-height:1; margin-bottom:1.5rem; }
  button, .btn { font:inherit; font-weight:600; border:2px solid var(--ink); background:var(--ink); color:var(--paper); padding:.55rem 1.2rem; cursor:pointer; border-radius:0; text-decoration:none; display:inline-block; }
  button:hover, .btn:hover { background:var(--accent); border-color:var(--accent); }
  button.ghost { background:transparent; color:var(--ink); }
  button.ghost:hover { background:var(--ink); color:var(--paper); }
  button.danger { background:transparent; border-color:#b3261e; color:#b3261e; }
  button.danger:hover { background:#b3261e; color:var(--paper); }
  input[type=text], input[type=password], input[type=search] { font:inherit; width:100%; padding:.6rem .9rem; border:2px solid var(--ink); background:var(--paper); color:var(--ink); border-radius:0; }
  input:focus-visible, button:focus-visible, a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .mono { font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; }
  .muted { color:var(--muted); }
  .error { color:#b3261e; margin-top:.75rem; min-height:1.4em; }
`;

export function adminLoginHtml() {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Přihlášení · Softlab administrace</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${BASE_CSS}
  .login { max-width:380px; margin:14vh auto 0; }
  .login label { display:block; margin-bottom:.5rem; font-weight:600; }
  .login button { width:100%; margin-top:1rem; padding:.8rem; }
</style>
</head>
<body>
<div class="wrap">
  <div class="login">
    <a class="logo" href="/">Softlab<sup>®</sup></a>
    <h1 style="margin-top:2.5rem">Administrace<br>podkladů</h1>
    <form id="loginForm">
      <label for="pw">Heslo administrátora</label>
      <input type="password" id="pw" autocomplete="current-password" required autofocus>
      <button type="submit">Přihlásit se</button>
      <p class="error" id="loginError" role="alert"></p>
    </form>
  </div>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    var res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ password: document.getElementById('pw').value })
    });
    var data = await res.json();
    if (res.ok) { location.reload(); }
    else { errEl.textContent = data.error || 'Přihlášení se nezdařilo.'; }
  } catch (_) {
    errEl.textContent = 'Připojení selhalo. Zkuste to znovu.';
  }
});
</script>
</body>
</html>`;
}

export function adminAppHtml() {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Podklady klientů · Softlab administrace</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${BASE_CSS}
  header.bar .spacer { margin-left:auto; }
  .search { max-width:420px; margin-bottom:1.5rem; }
  table { width:100%; border-collapse:collapse; }
  .list-row { border-top:1px solid var(--line); cursor:pointer; }
  .list-row:hover { background:var(--paper2); }
  .list-row td { padding:.85rem .6rem; vertical-align:top; }
  .list-head th { text-align:left; padding:.4rem .6rem; font-weight:600; font-size:.85rem; color:var(--muted); }
  .nowrap { white-space:nowrap; }
  .detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem 2rem; margin-bottom:2rem; }
  .detail-grid dt { font-size:.8rem; color:var(--muted); }
  .detail-grid dd { font-weight:600; overflow-wrap:anywhere; }
  .instructions { background:var(--paper2); border:1px solid var(--line); padding:1.25rem; white-space:pre-wrap; overflow-wrap:anywhere; margin-bottom:2rem; max-height:320px; overflow:auto; }
  .file-row { border-top:1px solid var(--line); }
  .file-row td { padding:.7rem .6rem; vertical-align:middle; }
  .thumb { width:56px; height:42px; object-fit:cover; border:1px solid var(--line); background:var(--paper2); display:block; }
  .actions { display:flex; gap:.75rem; flex-wrap:wrap; margin:1.5rem 0 2rem; align-items:center; }
  .txt-preview { background:var(--ink); color:var(--paper); font-family:ui-monospace,monospace; font-size:.8rem; padding:1rem; white-space:pre-wrap; overflow-wrap:anywhere; max-height:260px; overflow:auto; }
  .status { min-height:1.4em; margin-top:.5rem; }
  @media (max-width:720px) { .hide-m { display:none; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="bar">
    <a class="logo" href="/">Softlab<sup>®</sup></a>
    <span class="mono muted">Administrace podkladů</span>
    <span class="spacer"></span>
    <button class="ghost" id="logoutBtn">Odhlásit</button>
  </header>
  <main id="app" aria-live="polite"></main>
</div>
<script>
'use strict';
var app = document.getElementById('app');

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'text') node.textContent = attrs[k];
    else if (k.slice(0,2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
    else node.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(function (c) { if (c) node.appendChild(c); });
  return node;
}
function fmtSize(b) {
  if (b >= 1024*1024*1024) return (b/1024/1024/1024).toFixed(2) + ' GB';
  if (b >= 1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b/1024) + ' kB';
  return b + ' B';
}
function fmtDate(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString('cs-CZ') + ' ' + d.toLocaleTimeString('cs-CZ', {hour:'2-digit',minute:'2-digit'});
}
async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'X-Requested-With': 'fetch' }, opts.headers || {});
  var res = await fetch(path, opts);
  if (res.status === 401) { location.reload(); throw new Error('unauthorized'); }
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || ('Chyba ' + res.status));
  return data;
}

document.getElementById('logoutBtn').addEventListener('click', async function () {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch (_) {}
  location.reload();
});

/* ── seznam ── */
async function renderList() {
  var q = '';
  app.textContent = '';
  var search = el('input', { type:'search', placeholder:'Hledat: klient, firma, e-mail, projekt, ID…', class:'search',
    oninput: debounce(function (e) { q = e.target.value; load(); }, 300) });
  var tableWrap = el('div');
  app.appendChild(el('h1', { text: 'Podklady klientů' }));
  app.appendChild(search);
  app.appendChild(tableWrap);

  async function load() {
    try {
      var data = await api('/api/admin/submissions' + (q ? '?q=' + encodeURIComponent(q) : ''));
      tableWrap.textContent = '';
      if (!data.submissions.length) {
        tableWrap.appendChild(el('p', { class:'muted', text: q ? 'Nic nenalezeno.' : 'Zatím žádné zakázky.' }));
        return;
      }
      var tbody = el('tbody');
      data.submissions.forEach(function (s) {
        var name = s.client_name + (s.company_name ? ' · ' + s.company_name : '');
        var row = el('tr', { class:'list-row', tabindex:'0', role:'link',
          onclick: function () { location.hash = '#/' + s.id; },
          onkeydown: function (e) { if (e.key === 'Enter') location.hash = '#/' + s.id; } }, [
          el('td', { class:'nowrap', text: fmtDate(s.created_at) }),
          el('td', {}, [ el('strong', { text: name }), el('div', { class:'muted hide-m', text: s.email }) ]),
          el('td', { text: s.project_name }),
          el('td', { class:'nowrap hide-m', text: s.file_count + ' souborů' }),
          el('td', { class:'nowrap hide-m', text: fmtSize(s.total_size) }),
          el('td', {}, [ el('span', { class:'mono', text: s.public_reference }),
            s.status !== 'complete' ? el('div', { class:'mono muted', text: 'nedokončeno' }) : null ]),
        ]);
        tbody.appendChild(row);
      });
      var table = el('table', {}, [
        el('thead', {}, [ el('tr', { class:'list-head' }, [
          el('th', { text:'Datum' }), el('th', { text:'Klient' }), el('th', { text:'Projekt' }),
          el('th', { class:'hide-m', text:'Soubory' }), el('th', { class:'hide-m', text:'Velikost' }), el('th', { text:'ID' }) ]) ]),
        tbody ]);
      tableWrap.appendChild(table);
    } catch (e) {
      tableWrap.textContent = '';
      tableWrap.appendChild(el('p', { class:'error', text: e.message }));
    }
  }
  load();
}
function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

/* ── detail ── */
async function renderDetail(id) {
  app.textContent = '';
  app.appendChild(el('p', {}, [ el('a', { href:'#', class:'mono', text:'← Zpět na seznam' }) ]));
  var box = el('div');
  app.appendChild(box);
  var data;
  try { data = await api('/api/admin/submissions/' + encodeURIComponent(id)); }
  catch (e) { box.appendChild(el('p', { class:'error', text: e.message })); return; }
  var s = data.submission;

  box.appendChild(el('h1', { text: s.project_name }));

  var dl = el('dl', { class:'detail-grid' });
  [['Klient', s.client_name], ['Firma', s.company_name || '–'], ['E-mail', s.email],
   ['Telefon', s.phone || '–'], ['Vytvořeno', fmtDate(s.created_at)],
   ['ID podkladů', s.public_reference], ['Souborů', s.file_count + ' (' + fmtSize(s.total_size) + ')'],
   ['Stav', s.status === 'complete' ? 'dokončeno' : 'nedokončený upload']]
  .forEach(function (pair) {
    dl.appendChild(el('div', {}, [ el('dt', { text: pair[0] }), el('dd', { text: String(pair[1]) }) ]));
  });
  box.appendChild(dl);

  box.appendChild(el('h2', { class:'mono muted', text:'Instrukce' }));
  box.appendChild(el('div', { class:'instructions', text: s.instructions || 'Bez instrukcí.' }));

  var status = el('p', { class:'status mono', 'aria-live':'polite' });
  var zipBtn = el('button', { text:'Stáhnout vše (ZIP)', onclick: function () { downloadAll(s, data.files, status, zipBtn); } });
  var delBtn = el('button', { class:'danger', text:'Smazat zakázku', onclick: async function () {
    if (!confirm('Opravdu chcete tuto zakázku a všechny její soubory nenávratně odstranit?')) return;
    delBtn.disabled = true;
    try { await api('/api/admin/submissions/' + encodeURIComponent(id), { method:'DELETE' }); location.hash = '#'; }
    catch (e) { status.textContent = e.message; delBtn.disabled = false; }
  } });
  box.appendChild(el('div', { class:'actions' }, [ zipBtn, delBtn ]));
  box.appendChild(status);

  var tbody = el('tbody');
  data.files.forEach(function (f) {
    var ext = (f.original_name.split('.').pop() || '').toLowerCase();
    var isImg = ['jpg','jpeg','png','gif','webp','avif'].indexOf(ext) > -1;
    var cells = [
      el('td', {}, [ isImg ? el('img', { class:'thumb', loading:'lazy', alt:'',
        src:'/api/admin/files/' + f.id + '/download?inline=1' }) : el('span', { class:'mono muted', text: ext || '?' }) ]),
      el('td', {}, [ el('strong', { text: f.original_name }),
        el('div', { class:'muted', text: fmtSize(f.size) }) ]),
      el('td', { class:'nowrap' }, [
        el('a', { class:'btn', href:'/api/admin/files/' + f.id + '/download', text:'Stáhnout' }),
      ]),
    ];
    var row = el('tr', { class:'file-row' }, cells);
    tbody.appendChild(row);
    if (ext === 'txt') {
      var previewBtn = el('button', { class:'ghost', text:'Zobrazit', style:'margin-left:.5rem' });
      cells[2].appendChild(previewBtn);
      previewBtn.addEventListener('click', async function () {
        var existing = tbody.querySelector('[data-preview="' + f.id + '"]');
        if (existing) { existing.remove(); previewBtn.textContent = 'Zobrazit'; return; }
        var res = await fetch('/api/admin/files/' + f.id + '/download?inline=1', { headers: { 'X-Requested-With':'fetch' } });
        var text = await res.text();
        var tr = el('tr', { 'data-preview': f.id }, [ el('td'), el('td', { colspan:'2' }, [ el('div', { class:'txt-preview', text: text.slice(0, 20000) }) ]) ]);
        row.after(tr);
        previewBtn.textContent = 'Skrýt';
      });
    }
  });
  box.appendChild(el('table', {}, [ tbody ]));
}

/* ── ZIP (STORE, bez komprese) sestavený v prohlížeči ── */
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  var enc = new TextEncoder();
  var chunks = [], central = [], offset = 0;
  function u16(v) { return new Uint8Array([v & 255, (v >> 8) & 255]); }
  function u32(v) { return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]); }
  entries.forEach(function (e) {
    var name = enc.encode(e.name);
    var data = new Uint8Array(e.data);
    var crc = crc32(data);
    var local = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    local.forEach(function (p) { chunks.push(p); });
    chunks.push(name, data);
    var localSize = 30 + name.length + data.length;
    central.push({ name: name, crc: crc, size: data.length, offset: offset });
    offset += localSize;
  });
  var cdStart = offset, cdSize = 0;
  central.forEach(function (c) {
    var rec = [u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(c.offset)];
    rec.forEach(function (p) { chunks.push(p); cdSize += p.length; });
    chunks.push(c.name);
    cdSize += c.name.length;
  });
  [u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
   u32(cdSize), u32(cdStart), u16(0)].forEach(function (p) { chunks.push(p); });
  return new Blob(chunks, { type: 'application/zip' });
}
function safeZipPart(s) {
  return (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\\s+/g, '-').slice(0, 40) || 'x';
}
async function downloadAll(sub, files, status, btn) {
  btn.disabled = true;
  try {
    var entries = [];
    entries.push({ name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({
      id: sub.id, publicReference: sub.public_reference, createdAt: sub.created_at,
      clientName: sub.client_name, companyName: sub.company_name, email: sub.email,
      phone: sub.phone, projectName: sub.project_name, instructions: sub.instructions,
      files: files.map(function (f) { return { originalName: f.original_name, size: f.size }; })
    }, null, 2)).buffer });
    if (sub.instructions) {
      entries.push({ name: 'instructions.txt', data: new TextEncoder().encode(sub.instructions).buffer });
    }
    var used = {};
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      status.textContent = 'Stahuji ' + (i + 1) + ' / ' + files.length + ': ' + f.original_name;
      var res = await fetch('/api/admin/files/' + f.id + '/download', { headers: { 'X-Requested-With':'fetch' } });
      if (!res.ok) throw new Error('Soubor ' + f.original_name + ' se nepodařilo stáhnout.');
      var name = f.original_name;
      if (used[name]) name = f.id.slice(0, 6) + '_' + name;
      used[name] = true;
      entries.push({ name: name, data: await res.arrayBuffer() });
    }
    status.textContent = 'Skládám ZIP…';
    var blob = zipStore(entries);
    var zipName = safeZipPart(sub.company_name || sub.client_name) + '-' + safeZipPart(sub.project_name) + '-' + sub.public_reference + '.zip';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
    status.textContent = 'Hotovo: ' + zipName;
  } catch (e) {
    status.textContent = e.message;
  }
  btn.disabled = false;
}

/* ── routing ── */
function route() {
  var h = location.hash.replace(/^#\\/?/, '');
  if (h) renderDetail(h); else renderList();
}
window.addEventListener('hashchange', route);
route();
</script>
</body>
</html>`;
}
