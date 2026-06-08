/* ============================================================
   BuildTimesheet — Save/Load Integration
   Connects the timesheet form to BuildAuth for persistence.
   
   Requires: build-ecosystem-auth.js loaded first
   Reads all form values from DOM (no IIFE access needed)
   Doc type: 'timesheet'
   Prefix: bts-
   ============================================================ */
(function () {
  "use strict";

  function waitForAuth(cb) {
    if (window.BuildAuth) { cb(); return; }
    var t = setInterval(function () {
      if (window.BuildAuth) { clearInterval(t); cb(); }
    }, 200);
  }

  waitForAuth(function () { init(); });

  /* ── Read form state from DOM ─────────────────────────────── */

  function readFormData() {
    // Read projects from the global state
    var projectData = [];
    if (window.projects) {
      window.projects.forEach(function (p) {
        projectData.push({
          name: p.name || "",
          hours: p.hours.slice(),
        });
      });
    }

    return {
      worker_name:     v("workerName"),
      worker_email:    v("workerEmail"),
      worker_title:    v("workerTitle"),
      worker_phone:    v("workerPhone"),
      company_name:    v("companyName"),
      supervisor_name: v("supervisorName"),
      department:      v("department"),
      week_starting:   v("weekStarting"),
      week_ending:     v("weekEnding"),
      hourly_rate:     parseFloat(v("hourlyRate")) || 0,
      currency:        v("currency"),
      notes:           v("notes"),
      projects:        projectData,
    };
  }

  function v(id) { var el = document.getElementById(id); return el ? el.value : ""; }

  /* ── Write form state to DOM ──────────────────────────────── */

  function loadFormData(data) {
    setVal("workerName",     data.worker_name);
    setVal("workerEmail",    data.worker_email);
    setVal("workerTitle",    data.worker_title);
    setVal("workerPhone",    data.worker_phone);
    setVal("companyName",    data.company_name);
    setVal("supervisorName", data.supervisor_name);
    setVal("department",     data.department);
    setVal("weekStarting",   data.week_starting);
    setVal("weekEnding",     data.week_ending);
    setVal("hourlyRate",     data.hourly_rate);
    setVal("currency",       data.currency);
    setVal("notes",          data.notes);

    // Restore projects
    if (data.projects && data.projects.length > 0 && window.projects !== undefined) {
      window.projects = data.projects.map(function (p) {
        return { name: p.name || "", hours: (p.hours || [0,0,0,0,0,0,0]).slice() };
      });

      // Re-render the grid if the function exists
      if (typeof window.renderTimesheetGrid === "function") {
        window.renderTimesheetGrid();
      }
      if (typeof window.calcTotals === "function") {
        window.calcTotals();
      }
      if (typeof window.updatePreview === "function") {
        window.updatePreview();
      }
    }
  }

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el && val !== undefined && val !== null) {
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /* ── Build title from form data ───────────────────────────── */

  function buildTitle(data) {
    var parts = [];
    if (data.week_starting) {
      var d = new Date(data.week_starting + "T00:00:00");
      var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      parts.push("Week of " + monthNames[d.getMonth()] + " " + d.getDate());
    }
    if (data.worker_name) parts.push("— " + data.worker_name);
    return parts.join(" ") || "Untitled Timesheet";
  }

  function computeTotalHours(data) {
    var total = 0;
    (data.projects || []).forEach(function (p) {
      (p.hours || []).forEach(function (h) { total += (h || 0); });
    });
    return total;
  }

  /* ── Inject UI ────────────────────────────────────────────── */

  function init() {
    injectSaveButton();
    injectSavedPanel();

    BuildAuth.onAuthChange(function (user) {
      var panel = document.getElementById("bts-saved-panel");
      var saveBtn = document.getElementById("bts-save-btn");
      var hint = document.getElementById("bts-save-hint");

      if (user) {
        if (saveBtn) saveBtn.style.display = "";
        if (hint) hint.style.display = "none";
        if (panel) { panel.style.display = ""; loadSavedTimesheets(); }
      } else {
        if (saveBtn) saveBtn.style.display = "none";
        if (hint) hint.style.display = "";
        if (panel) panel.style.display = "none";
      }
    });
  }

  function injectSaveButton() {
    var btnRow = document.getElementById("btnDownload")?.parentElement;
    if (!btnRow) return;

    // Wrap download button in a flex row
    var wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;gap:0.75rem;margin-top:1.5rem;";
    var dlBtn = document.getElementById("btnDownload");
    dlBtn.style.marginTop = "0";
    dlBtn.style.flex = "1";
    btnRow.insertBefore(wrapper, dlBtn);
    wrapper.appendChild(dlBtn);

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.id = "bts-save-btn";
    saveBtn.style.cssText = "display:none;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;padding:0.75rem 1.25rem;border-radius:12px;font-weight:600;font-size:0.95rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;font-family:inherit;";
    saveBtn.textContent = "💾 Save";
    saveBtn.title = "Save this timesheet to your account";
    saveBtn.addEventListener("mouseenter", function () { saveBtn.style.background = "rgba(6,182,212,0.25)"; });
    saveBtn.addEventListener("mouseleave", function () { saveBtn.style.background = "rgba(6,182,212,0.15)"; });
    saveBtn.addEventListener("click", handleSave);
    wrapper.appendChild(saveBtn);

    var hint = document.createElement("button");
    hint.type = "button";
    hint.id = "bts-save-hint";
    hint.className = "bea-save-hint";
    hint.textContent = "💾 Sign in to save your timesheets";
    hint.style.marginTop = "0.75rem";
    hint.addEventListener("click", function () { BuildAuth.showSignIn(); });
    btnRow.appendChild(hint);
  }

  async function handleSave() {
    var btn = document.getElementById("bts-save-btn");
    btn.textContent = "Saving...";
    btn.disabled = true;

    var data = readFormData();
    var title = buildTitle(data);
    var totalHours = computeTotalHours(data);

    var docId = await BuildAuth.saveDocument("timesheet", title, data, {
      totalHours: totalHours,
      status: "draft",
    });

    if (docId) {
      btn.textContent = "✓ Saved";
      setTimeout(function () { btn.textContent = "💾 Save"; btn.disabled = false; }, 2000);
      loadSavedTimesheets();
    } else {
      btn.textContent = "✗ Error";
      setTimeout(function () { btn.textContent = "💾 Save"; btn.disabled = false; }, 2000);
    }
  }

  /* ── Saved Timesheets Panel ──────────────────────────────── */

  function injectSavedPanel() {
    var form = document.querySelector("main") || document.querySelector(".container");
    if (!form) return;

    var panel = document.createElement("div");
    panel.id = "bts-saved-panel";
    panel.style.cssText = "display:none;margin-bottom:2rem;background:rgba(6,182,212,0.04);border:1px solid rgba(6,182,212,0.12);border-radius:16px;padding:1.5rem;max-width:1400px;margin-left:auto;margin-right:auto;";
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">' +
        '<h3 style="margin:0;font-size:1rem;font-weight:700;color:rgba(255,255,255,0.85);">⏰ Your Saved Timesheets</h3>' +
        '<button id="bts-refresh" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:0.85rem;">↻ Refresh</button>' +
      '</div>' +
      '<div id="bts-list" style="display:flex;flex-direction:column;gap:0.5rem;"></div>';

    form.parentElement.insertBefore(panel, form);

    document.getElementById("bts-refresh")?.addEventListener("click", loadSavedTimesheets);
  }

  async function loadSavedTimesheets() {
    var list = document.getElementById("bts-list");
    if (!list) return;

    list.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.85rem;">Loading...</div>';

    var docs = await BuildAuth.loadDocuments("timesheet");

    if (docs.length === 0) {
      list.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.85rem;">No saved timesheets yet. Create a timesheet and click 💾 Save.</div>';
      return;
    }

    list.innerHTML = "";
    docs.forEach(function (doc) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;cursor:pointer;transition:all 0.15s;";
      row.addEventListener("mouseenter", function () { row.style.background = "rgba(255,255,255,0.06)"; });
      row.addEventListener("mouseleave", function () { row.style.background = "rgba(255,255,255,0.03)"; });

      var info = document.createElement("div");
      info.innerHTML =
        '<div style="font-size:0.9rem;font-weight:600;color:rgba(255,255,255,0.8);">' + escHtml(doc.title) + '</div>' +
        '<div style="font-size:0.75rem;color:rgba(255,255,255,0.35);margin-top:2px;">' +
          (doc.totalHours ? doc.totalHours + " hrs · " : "") +
          formatDate(doc.createdAt) +
        '</div>';

      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;flex-shrink:0;";

      var loadBtn = document.createElement("button");
      loadBtn.style.cssText = "background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.25);color:#22d3ee;padding:5px 12px;border-radius:8px;font-size:0.8rem;cursor:pointer;font-family:inherit;";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", function (e) { e.stopPropagation(); loadTimesheet(doc.id); });

      var delBtn = document.createElement("button");
      delBtn.style.cssText = "background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:5px 10px;border-radius:8px;font-size:0.8rem;cursor:pointer;font-family:inherit;";
      delBtn.textContent = "✕";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Delete this saved timesheet?")) {
          BuildAuth.deleteDocument(doc.id).then(function () { loadSavedTimesheets(); });
        }
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  async function loadTimesheet(docId) {
    var doc = await BuildAuth.getDocument(docId);
    if (!doc || !doc.formData) { alert("Could not load timesheet."); return; }
    loadFormData(doc.formData);
    var form = document.querySelector("main");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function escHtml(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
})();
