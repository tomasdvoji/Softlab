/* Softlab klientský portál
   /files          - veřejná stránka pro klienty (statický asset)
   /api/*          - upload + admin API
   /admin/files    - zabezpečená administrace (HTML rendruje Worker)

   Storage: R2 (soubory, klíč submissions/{id}/{storageName})
   Metadata: D1 (submissions, files) + kopie metadata.json v R2 složce zakázky */

import { adminAppHtml, adminLoginHtml } from "./admin-ui.js";

const SESSION_COOKIE = "sl_admin";
const SESSION_HOURS = 8;
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bez záměnných znaků
const SUBMISSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // okno pro dokončení uploadu

/* ─── util ─── */

function json(data, status = 0, extra = {}) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...secHeaders(), ...extra },
  });
}

function err(status, message) {
  return json({ error: message }, status);
}

function secHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  };
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
      ...secHeaders(),
    },
  });
}

function randomId(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function publicReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return "FILES-" + out;
}

function friendlyPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

/* jméno klienta porovnáváme bez ohledu na velikost písmen a diakritiku */
function normName(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

async function inviteHash(env, token, name, password) {
  return hmacHex(env.SESSION_SECRET, "invite:" + token + ":" + normName(name) + ":" + password);
}

async function checkInvite(env, token, name, password) {
  if (!/^[a-z0-9]{20}$/.test(token || "")) return null;
  const invite = await env.DB.prepare("SELECT * FROM invites WHERE id = ?").bind(token).first();
  if (!invite) return null;
  const expected = await inviteHash(env, token, name, password);
  return (await timingSafeEq(invite.password_hash, expected)) ? invite : null;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

/* původní název jen jako metadata: ořez řídicích znaků, délky, path separátorů */
function sanitizeName(name) {
  return (name || "soubor")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 180) || "soubor";
}

function extOf(name) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

const INLINE_TYPES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

/* ─── rate limiting (fixed window v D1) ─── */

async function rateLimit(env, bucket, ip, limit, windowSec) {
  const key = bucket + ":" + ip;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key).first();
  if (!row || row.window_start !== windowStart) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) " +
      "ON CONFLICT(key) DO UPDATE SET count = 1, window_start = ?"
    ).bind(key, windowStart, windowStart).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

/* ─── admin session (HMAC podepsaná cookie) ─── */

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function timingSafeEq(a, b) {
  const ha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a));
  const hb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function makeSession(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const nonce = randomId(16);
  const sig = await hmacHex(env.SESSION_SECRET, exp + "." + nonce);
  return exp + "." + nonce + "." + sig;
}

async function isAuthed(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE + "=([^;]+)"));
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return false;
  const expected = await hmacHex(env.SESSION_SECRET, exp + "." + nonce);
  return timingSafeEq(sig, expected);
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/* CSRF: mutace vyžadují vlastní hlavičku (cross-site formulář ji poslat nemůže)
   + session cookie je SameSite=Strict */
function hasCsrfHeader(request) {
  return request.headers.get("X-Requested-With") === "fetch";
}

/* ─── config ─── */

function cfg(env) {
  return {
    maxFileBytes: (parseInt(env.MAX_FILE_MB, 10) || 500) * 1024 * 1024,
    maxSubmissionBytes: (parseInt(env.MAX_SUBMISSION_MB, 10) || 2000) * 1024 * 1024,
    allowed: new Set(
      (env.ALLOWED_EXTENSIONS || "pdf,zip,txt,csv,xls,xlsx,doc,docx,jpg,jpeg,png")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    ),
  };
}

/* ─── klientské API ─── */

async function createSubmission(request, env) {
  if (!(await rateLimit(env, "create", clientIp(request), 10, 3600))) {
    return err(429, "Příliš mnoho pokusů. Zkuste to prosím později.");
  }
  let body;
  try { body = await request.json(); } catch { return err(400, "Neplatný požadavek."); }

  const clientName = String(body.clientName || "").trim().slice(0, 200);
  const companyName = String(body.companyName || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 50);
  const projectName = String(body.projectName || "").trim().slice(0, 200);
  const instructions = String(body.instructions || "").trim().slice(0, 20000);

  if (!clientName) return err(400, "Vyplňte prosím jméno nebo název firmy.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Vyplňte prosím platný e-mail.");
  if (!projectName) return err(400, "Vyplňte prosím název projektu.");

  /* zakázka přes klientský odkaz: přístup se ověřuje znovu i tady */
  let inviteId = null;
  if (body.inviteToken) {
    const invite = await checkInvite(env, String(body.inviteToken), String(body.inviteName || ""), String(body.invitePassword || ""));
    if (!invite) return err(403, "Přístup k odkazu vypršel. Obnovte prosím stránku a přihlaste se znovu.");
    inviteId = invite.id;
  }

  const date = new Date().toISOString();
  const id = "sub_" + date.slice(0, 10) + "_" + randomId(16);

  let ref = publicReference();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await env.DB.prepare(
        "INSERT INTO submissions (id, public_reference, client_name, company_name, email, phone, project_name, instructions, created_at, status, invite_id) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)"
      ).bind(id, ref, clientName, companyName || null, email, phone || null, projectName, instructions || null, date, inviteId).run();
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      ref = publicReference(); // kolize public_reference, zkusit jinou
    }
  }

  const c = cfg(env);
  return json({
    id,
    publicReference: ref,
    maxFileBytes: c.maxFileBytes,
    maxSubmissionBytes: c.maxSubmissionBytes,
    allowedExtensions: [...c.allowed],
  });
}

async function loadOpenSubmission(env, id) {
  if (!/^sub_[0-9-]{10}_[a-z0-9]{16}$/.test(id)) return null;
  const sub = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  if (!sub || sub.status !== "uploading") return null;
  if (Date.now() - Date.parse(sub.created_at) > SUBMISSION_MAX_AGE_MS) return null;
  return sub;
}

async function uploadFile(request, env, id) {
  /* odmítnutí PŘED přečtením těla musí tělo zrušit, jinak spojení
     zůstane viset (workerd čeká na dočtení requestu) */
  const reject = async (status, msg) => {
    try { if (request.body) await request.body.cancel(); } catch (_) {}
    return err(status, msg);
  };

  if (!(await rateLimit(env, "upload", clientIp(request), 300, 3600))) {
    return reject(429, "Příliš mnoho souborů za hodinu. Zkuste to prosím později.");
  }
  const sub = await loadOpenSubmission(env, id);
  if (!sub) return reject(404, "Zakázka nenalezena nebo už byla odeslána.");

  const c = cfg(env);
  const rawName = request.headers.get("X-File-Name") || "";
  let originalName;
  try { originalName = sanitizeName(decodeURIComponent(rawName)); }
  catch { return reject(400, "Neplatný název souboru."); }

  const ext = extOf(originalName);
  if (!ext || !c.allowed.has(ext)) {
    return reject(400, `Tento typ souboru není podporovaný (${ext ? "." + ext : "bez přípony"}).`);
  }

  const length = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (!length || length <= 0) return reject(400, "Prázdný soubor nelze nahrát.");
  if (length > c.maxFileBytes) {
    return reject(413, `Soubor je příliš velký. Maximum je ${Math.floor(c.maxFileBytes / 1024 / 1024)} MB.`);
  }
  if (sub.total_size + length > c.maxSubmissionBytes) {
    return reject(413, `Celková velikost podkladů přesáhla limit ${Math.floor(c.maxSubmissionBytes / 1024 / 1024)} MB.`);
  }
  if (sub.file_count >= 200) return reject(400, "Maximální počet souborů na zakázku je 200.");

  const fileId = randomId(20);
  const storageName = fileId + "." + ext;
  const storagePath = "submissions/" + id + "/" + storageName;

  const obj = await env.UPLOADS.put(storagePath, request.body, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { originalName },
  });
  if (!obj || obj.size !== length) {
    await env.UPLOADS.delete(storagePath);
    return err(400, "Upload se nezdařil, zkuste to prosím znovu.");
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO files (id, submission_id, original_name, storage_name, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(fileId, id, originalName, storageName, request.headers.get("X-File-Type") || null, length, storagePath, now),
    env.DB.prepare(
      "UPDATE submissions SET total_size = total_size + ?, file_count = file_count + 1 WHERE id = ?"
    ).bind(length, id),
  ]);

  return json({ fileId, originalName, size: length });
}

async function completeSubmission(request, env, id) {
  const sub = await loadOpenSubmission(env, id);
  if (!sub) return err(404, "Zakázka nenalezena nebo už byla odeslána.");
  if (sub.file_count === 0) return err(400, "Nahrajte prosím alespoň jeden soubor.");

  const files = (await env.DB.prepare(
    "SELECT original_name, storage_name, size, mime_type, created_at FROM files WHERE submission_id = ? ORDER BY created_at"
  ).bind(id).all()).results;

  if (sub.instructions) {
    await env.UPLOADS.put("submissions/" + id + "/instructions.txt", sub.instructions, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
  }
  const metadata = {
    id: sub.id,
    publicReference: sub.public_reference,
    createdAt: sub.created_at,
    clientName: sub.client_name,
    companyName: sub.company_name,
    email: sub.email,
    phone: sub.phone,
    projectName: sub.project_name,
    instructions: sub.instructions,
    files: files.map((f) => ({ originalName: f.original_name, storageName: f.storage_name, size: f.size })),
  };
  await env.UPLOADS.put("submissions/" + id + "/metadata.json", JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  await env.DB.prepare("UPDATE submissions SET status = 'complete' WHERE id = ? AND status = 'uploading'")
    .bind(id).run();

  return json({ publicReference: sub.public_reference });
}

/* ─── klientské odkazy ─── */

async function verifyInvite(request, env, token) {
  if (!(await rateLimit(env, "invite", clientIp(request), 10, 900))) {
    return err(429, "Příliš mnoho pokusů. Zkuste to za 15 minut.");
  }
  let body;
  try { body = await request.json(); } catch { return err(400, "Neplatný požadavek."); }
  const invite = await checkInvite(env, token, String(body.name || ""), String(body.password || ""));
  if (!invite) return err(401, "Nesprávné jméno nebo heslo.");
  return json({ ok: true, clientName: invite.client_name });
}

async function createInvite(request, env, url) {
  let body;
  try { body = await request.json(); } catch { return err(400, "Neplatný požadavek."); }
  const clientName = String(body.clientName || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  if (!clientName) return err(400, "Vyplňte jméno klienta.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Neplatný e-mail.");

  const token = randomId(20);
  const password = friendlyPassword();
  const hash = await inviteHash(env, token, clientName, password);
  await env.DB.prepare(
    "INSERT INTO invites (id, client_name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(token, clientName, email || null, hash, new Date().toISOString()).run();

  return json({
    token,
    url: url.origin + "/files/?k=" + token,
    password,
    clientName,
    email: email || null,
  });
}

async function listInvites(env) {
  const rows = (await env.DB.prepare(
    "SELECT i.id, i.client_name, i.email, i.created_at, " +
    "(SELECT COUNT(*) FROM submissions s WHERE s.invite_id = i.id) AS submission_count " +
    "FROM invites i ORDER BY i.created_at DESC LIMIT 200"
  ).all()).results;
  return json({ invites: rows });
}

async function deleteInvite(env, id) {
  await env.DB.prepare("DELETE FROM invites WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

/* ─── admin API ─── */

async function adminLogin(request, env) {
  if (!hasCsrfHeader(request)) return err(403, "Chybí bezpečnostní hlavička.");
  if (!(await rateLimit(env, "login", clientIp(request), 5, 900))) {
    return err(429, "Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut.");
  }
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return err(500, "Administrace není nakonfigurovaná (ADMIN_PASSWORD / SESSION_SECRET).");
  }
  let body;
  try { body = await request.json(); } catch { return err(400, "Neplatný požadavek."); }
  const userOk = await timingSafeEq(String(body.username || ""), env.ADMIN_USER || "admin");
  const passOk = await timingSafeEq(String(body.password || ""), env.ADMIN_PASSWORD);
  if (!userOk || !passOk) return err(401, "Nesprávné přihlašovací údaje.");
  const token = await makeSession(env);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_HOURS * 3600) });
}

async function listSubmissions(env, url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  let rows;
  if (q) {
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    rows = (await env.DB.prepare(
      "SELECT id, public_reference, client_name, company_name, email, project_name, created_at, total_size, file_count, status FROM submissions " +
      "WHERE client_name LIKE ?1 OR company_name LIKE ?1 OR email LIKE ?1 OR project_name LIKE ?1 OR public_reference LIKE ?1 " +
      "ORDER BY created_at DESC LIMIT 200"
    ).bind(like).all()).results;
  } else {
    rows = (await env.DB.prepare(
      "SELECT id, public_reference, client_name, company_name, email, project_name, created_at, total_size, file_count, status FROM submissions " +
      "ORDER BY created_at DESC LIMIT 200"
    ).all()).results;
  }
  return json({ submissions: rows });
}

async function submissionDetail(env, id) {
  const sub = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  if (!sub) return err(404, "Zakázka nenalezena.");
  const files = (await env.DB.prepare(
    "SELECT id, original_name, size, mime_type, created_at FROM files WHERE submission_id = ? ORDER BY created_at"
  ).bind(id).all()).results;
  return json({ submission: sub, files });
}

async function downloadFile(env, fileId, inline) {
  const file = await env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(fileId).first();
  if (!file) return err(404, "Soubor nenalezen.");
  const obj = await env.UPLOADS.get(file.storage_path);
  if (!obj) return err(404, "Soubor ve storage chybí.");

  const ext = extOf(file.storage_name);
  const inlineType = inline ? INLINE_TYPES[ext] : null;
  const asciiName = file.original_name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const headers = {
    ...secHeaders(),
    "Content-Type": inlineType || "application/octet-stream",
    "Content-Length": String(file.size),
    "Content-Disposition":
      (inlineType ? "inline" : "attachment") +
      `; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
  };
  return new Response(obj.body, { headers });
}

async function deleteSubmission(env, id) {
  const sub = await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(id).first();
  if (!sub) return err(404, "Zakázka nenalezena.");

  // smazat všechny objekty pod prefixem zakázky (včetně metadata.json, instructions.txt)
  let cursor;
  do {
    const listed = await env.UPLOADS.list({ prefix: "submissions/" + id + "/", cursor });
    if (listed.objects.length) {
      await env.UPLOADS.delete(listed.objects.map((o) => o.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM files WHERE submission_id = ?").bind(id),
    env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

/* ─── router ─── */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      /* klientské API */
      if (path === "/api/submissions" && method === "POST") {
        return createSubmission(request, env);
      }
      let m = path.match(/^\/api\/submissions\/([^/]+)\/files$/);
      if (m && method === "POST") return uploadFile(request, env, m[1]);
      m = path.match(/^\/api\/submissions\/([^/]+)\/complete$/);
      if (m && method === "POST") return completeSubmission(request, env, m[1]);
      m = path.match(/^\/api\/invites\/([a-z0-9]{20})\/verify$/);
      if (m && method === "POST") return verifyInvite(request, env, m[1]);

      /* admin stránky */
      if (path === "/admin/files" || path === "/admin/files/") {
        return htmlResponse((await isAuthed(request, env)) ? adminAppHtml() : adminLoginHtml());
      }
      if (path.startsWith("/admin")) {
        return new Response("Not found", { status: 404, headers: secHeaders() });
      }

      /* admin API */
      if (path === "/api/admin/login" && method === "POST") return adminLogin(request, env);

      if (path.startsWith("/api/admin/")) {
        if (!(await isAuthed(request, env))) return err(401, "Nepřihlášen.");

        if (path === "/api/admin/logout" && method === "POST") {
          return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
        }
        if (path === "/api/admin/submissions" && method === "GET") {
          return listSubmissions(env, url);
        }
        m = path.match(/^\/api\/admin\/submissions\/([^/]+)$/);
        if (m && method === "GET") return submissionDetail(env, m[1]);
        if (m && method === "DELETE") {
          if (!hasCsrfHeader(request)) return err(403, "Chybí bezpečnostní hlavička.");
          return deleteSubmission(env, m[1]);
        }
        m = path.match(/^\/api\/admin\/files\/([a-z0-9]+)\/download$/);
        if (m && method === "GET") return downloadFile(env, m[1], url.searchParams.get("inline") === "1");

        if (path === "/api/admin/invites" && method === "GET") return listInvites(env);
        if (path === "/api/admin/invites" && method === "POST") {
          if (!hasCsrfHeader(request)) return err(403, "Chybí bezpečnostní hlavička.");
          return createInvite(request, env, url);
        }
        m = path.match(/^\/api\/admin\/invites\/([a-z0-9]{20})$/);
        if (m && method === "DELETE") {
          if (!hasCsrfHeader(request)) return err(403, "Chybí bezpečnostní hlavička.");
          return deleteInvite(env, m[1]);
        }

        return err(404, "Neznámý endpoint.");
      }

      if (path.startsWith("/api/")) return err(404, "Neznámý endpoint.");

      /* vše ostatní jsou statické assety (web + /files) */
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("worker error", path, e.message, e.stack);
      return err(500, "Došlo k chybě na serveru. Zkuste to prosím znovu.");
    }
  },
};
