/* Klientský portál: výběr souborů, drag & drop, sekvenční upload s progresem.
   Submission vzniká až po kliknutí na Odeslat; refresh stránky tedy nikdy
   nevytvoří duplicitní zakázku. Při chybě formulář i soubory zůstávají a
   tlačítko nabídne "Zkusit znovu" (doběhnou jen nenahrané soubory). */

(function () {
  "use strict";

  var DEFAULT_MAX_FILE = 500 * 1024 * 1024;
  var form = document.getElementById("portalForm");
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var fileListEl = document.getElementById("fileList");
  var formError = document.getElementById("formError");
  var submitBtn = document.getElementById("submitBtn");
  var progressBox = document.getElementById("progressBox");
  var progressLabel = document.getElementById("progressLabel");
  var progressBar = document.getElementById("progressBar");
  var progressFill = document.getElementById("progressFill");

  /* stav: {file, status: 'pending'|'uploading'|'done'|'failed', error} */
  var items = [];
  var submission = null; // {id, publicReference, maxFileBytes, allowedExtensions}
  var running = false;

  document.getElementById("year").textContent = String(new Date().getFullYear());

  /* ─── výběr souborů ─── */

  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  function extOf(name) {
    var m = /\.([A-Za-z0-9]{1,10})$/.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function addFiles(list) {
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var dup = items.some(function (it) {
        return it.file.name === f.name && it.file.size === f.size;
      });
      if (dup) continue;
      var item = { file: f, status: "pending", error: "" };
      if (f.size === 0) { item.status = "failed"; item.error = "Prázdný soubor."; }
      else if (f.size > DEFAULT_MAX_FILE) {
        item.status = "failed";
        item.error = "Soubor je příliš velký (max " + Math.floor(DEFAULT_MAX_FILE / 1024 / 1024) + " MB).";
      }
      items.push(item);
    }
    renderFiles();
  }

  function fmtSize(b) {
    if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
    if (b >= 1024) return Math.round(b / 1024) + " kB";
    return b + " B";
  }

  function renderFiles() {
    fileListEl.textContent = "";
    items.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "file-row";

      var ext = document.createElement("span");
      ext.className = "file-ext";
      ext.textContent = extOf(item.file.name) || "?";

      var info = document.createElement("div");
      info.className = "file-info";
      var name = document.createElement("div");
      name.className = "file-name";
      name.textContent = item.file.name;
      var meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = fmtSize(item.file.size) + (item.file.type ? " · " + item.file.type : "");
      info.appendChild(name);
      info.appendChild(meta);

      var state = document.createElement("span");
      state.className = "file-state";
      if (item.status === "done") { state.textContent = "Nahráno"; state.classList.add("ok"); }
      else if (item.status === "uploading") { state.textContent = "Nahrávám…"; }
      else if (item.status === "failed") { state.textContent = item.error; state.classList.add("fail"); }

      li.appendChild(ext);
      li.appendChild(info);
      li.appendChild(state);

      if (!running && item.status !== "done") {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "file-remove";
        remove.setAttribute("aria-label", "Odstranit soubor " + item.file.name);
        remove.textContent = "×";
        remove.addEventListener("click", function () {
          items.splice(idx, 1);
          renderFiles();
        });
        li.appendChild(remove);
      }
      fileListEl.appendChild(li);
    });
  }

  /* ─── validace ─── */

  function fieldValue(id) { return document.getElementById(id).value.trim(); }

  function validateForm() {
    var problems = [];
    if (!fieldValue("fName")) problems.push("Vyplňte prosím jméno nebo název firmy.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue("fEmail"))) problems.push("Vyplňte prosím platný e-mail.");
    if (!fieldValue("fProject")) problems.push("Vyplňte prosím název projektu.");
    var usable = items.filter(function (it) { return it.status !== "failed" || it.error.indexOf("podporovaný") === -1; });
    if (!items.some(function (it) { return it.status === "pending" || it.status === "done"; })) {
      problems.push("Přidejte prosím alespoň jeden soubor.");
    }
    return problems;
  }

  /* ─── upload ─── */

  function apiJson(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Chyba " + res.status);
        return data;
      });
    });
  }

  function uploadOne(item, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/submissions/" + submission.id + "/files");
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Requested-With", "fetch");
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(item.file.name));
      if (item.file.type) xhr.setRequestHeader("X-File-Type", item.file.type);
      xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable) onProgress(e.loaded);
      });
      xhr.addEventListener("load", function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          var msg = "Upload se nezdařil.";
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
          reject(new Error(msg));
        }
      });
      xhr.addEventListener("error", function () { reject(new Error("Připojení bylo přerušeno.")); });
      xhr.addEventListener("abort", function () { reject(new Error("Upload byl přerušen.")); });
      xhr.send(item.file);
    });
  }

  function setProgress(pct) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    progressFill.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", String(pct));
    progressLabel.textContent = "Nahrávání podkladů – " + pct + " %";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (running) return;
    formError.textContent = "";

    var problems = validateForm();
    if (problems.length) {
      formError.textContent = problems[0];
      return;
    }

    running = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Odesílám…";
    progressBox.hidden = false;
    renderFiles();

    try {
      /* 1. založit zakázku (jen pokud ještě není z předchozího pokusu) */
      if (!submission) {
        submission = await apiJson("/api/submissions", {
          clientName: fieldValue("fName"),
          companyName: fieldValue("fCompany"),
          email: fieldValue("fEmail"),
          phone: fieldValue("fPhone"),
          projectName: fieldValue("fProject"),
          instructions: fieldValue("fInstructions"),
        });
        document.getElementById("maxFileLabel").textContent = String(Math.floor(submission.maxFileBytes / 1024 / 1024));
      }

      /* 2. nahrát soubory postupně */
      var pending = items.filter(function (it) { return it.status === "pending" || it.status === "failed"; });
      pending.forEach(function (it) {
        if (it.status === "failed") { it.status = "pending"; it.error = ""; }
      });
      var totalBytes = 0, doneBytes = 0;
      items.forEach(function (it) {
        if (it.status !== "done") totalBytes += it.file.size;
      });

      var failures = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.status === "done") continue;

        if (extAllowed(item) === false) {
          item.status = "failed";
          item.error = "Tento typ souboru není podporovaný.";
          failures++;
          doneBytes += item.file.size;
          renderFiles();
          continue;
        }
        if (item.file.size > submission.maxFileBytes) {
          item.status = "failed";
          item.error = "Soubor je příliš velký (max " + Math.floor(submission.maxFileBytes / 1024 / 1024) + " MB).";
          failures++;
          doneBytes += item.file.size;
          renderFiles();
          continue;
        }

        item.status = "uploading";
        renderFiles();
        var base = doneBytes;
        try {
          await uploadOne(item, function (loaded) {
            setProgress(((base + loaded) / totalBytes) * 100);
          });
          item.status = "done";
        } catch (upErr) {
          item.status = "failed";
          item.error = upErr.message;
          failures++;
        }
        doneBytes += item.file.size;
        setProgress((doneBytes / totalBytes) * 100);
        renderFiles();
      }

      var uploaded = items.filter(function (it) { return it.status === "done"; }).length;
      if (uploaded === 0) throw new Error("Žádný soubor se nepodařilo nahrát. Zkuste to prosím znovu.");

      if (failures > 0) {
        formError.textContent = "Některé soubory se nepodařilo nahrát (" + failures + "). Odstraňte je, nebo klikněte na Zkusit znovu.";
        submitBtn.textContent = "Zkusit znovu";
        submitBtn.disabled = false;
        running = false;
        renderFiles();
        return;
      }

      /* 3. dokončit */
      setProgress(100);
      var result = await apiJson("/api/submissions/" + submission.id + "/complete");
      document.getElementById("successRef").textContent = result.publicReference;
      document.getElementById("formView").hidden = true;
      document.getElementById("successView").hidden = false;
      window.scrollTo(0, 0);
      submission = null;
    } catch (errAll) {
      formError.textContent = errAll.message || "Odeslání se nezdařilo. Zkuste to prosím znovu.";
      submitBtn.textContent = "Zkusit znovu";
      submitBtn.disabled = false;
      running = false;
      renderFiles();
      return;
    }
    running = false;
  });

  function extAllowed(item) {
    if (!submission || !submission.allowedExtensions) return true;
    var ext = extOf(item.file.name);
    return submission.allowedExtensions.indexOf(ext) > -1;
  }

  /* ─── reset po úspěchu ─── */
  document.getElementById("resetBtn").addEventListener("click", function () {
    items = [];
    submission = null;
    form.reset();
    renderFiles();
    setProgress(0);
    progressBox.hidden = true;
    submitBtn.disabled = false;
    submitBtn.textContent = "Odeslat podklady";
    document.getElementById("successView").hidden = true;
    document.getElementById("formView").hidden = false;
    window.scrollTo(0, 0);
  });
})();
