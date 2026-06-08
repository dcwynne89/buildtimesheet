/* ============================================================
   timesheet-app.js — Consumer site logic for BuildTimesheet
   Manages form state, live preview, and PDF download
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let projects = [{ name: '', hours: [0,0,0,0,0,0,0] }];
let isGenerating = false;

// ── DOM refs ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Day names (updated from weekStarting) ─────────────────────
const DAY_NAMES_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_NAMES_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Set default week starting date (Monday of current week)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  $("weekStarting").value = formatDateISO(monday);

  updateWeekEnding();
  renderTimesheetGrid();
  bindEvents();
  updatePreview();
});

function bindEvents() {
  // Week starting changes → auto-calculate week ending + update day headers
  $("weekStarting").addEventListener("input", () => {
    updateWeekEnding();
    updateDayHeaders();
    updatePreview();
  });

  // Add project
  $("btnAddProject").addEventListener("click", () => {
    projects.push({ name: '', hours: [0,0,0,0,0,0,0] });
    renderTimesheetGrid();
    calcTotals();
    updatePreview();
  });

  // Download
  $("btnDownload").addEventListener("click", downloadTimesheet);

  // Listen to all form inputs for live preview
  document.querySelectorAll("#formPanel input:not([data-grid]), #formPanel textarea, #formPanel select").forEach((el) => {
    el.addEventListener("input", () => { calcTotals(); updatePreview(); });
  });

  // Toast close
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("toast")) e.target.classList.remove("show");
  });
}

// ── Week Ending Auto-calc ─────────────────────────────────────
function updateWeekEnding() {
  const startVal = $("weekStarting").value;
  if (!startVal) return;
  const start = new Date(startVal + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  $("weekEnding").value = formatDateISO(end);
}

// ── Update Day Column Headers ────────────────────────────────
function updateDayHeaders() {
  const startVal = $("weekStarting").value;
  if (!startVal) return;
  const start = new Date(startVal + 'T00:00:00');
  const headerRow = $("gridHeader").querySelector("tr");
  const ths = headerRow.querySelectorAll("th");
  // ths: [Project, Mon, Tue, Wed, Thu, Fri, Sat, Sun, Total, ""]
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayName = DAY_NAMES_SHORT[i];
    const dateNum = d.getDate();
    ths[i + 1].textContent = `${dayName} ${dateNum}`;
  }
}

// ── Render Timesheet Grid ────────────────────────────────────
function renderTimesheetGrid() {
  const tbody = $("timesheetGrid");
  tbody.innerHTML = "";

  projects.forEach((proj, pIdx) => {
    const tr = document.createElement("tr");

    // Project name cell
    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Project / Task name";
    nameInput.value = proj.name;
    nameInput.dataset.pidx = pIdx;
    nameInput.dataset.grid = "true";
    nameInput.addEventListener("input", (e) => {
      projects[pIdx].name = e.target.value;
      updatePreview();
    });
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    // 7 day columns
    for (let d = 0; d < 7; d++) {
      const td = document.createElement("td");
      td.className = "day-column";
      const hourInput = document.createElement("input");
      hourInput.type = "number";
      hourInput.min = "0";
      hourInput.max = "24";
      hourInput.step = "0.25";
      hourInput.value = proj.hours[d] || '';
      hourInput.placeholder = "0";
      hourInput.dataset.pidx = pIdx;
      hourInput.dataset.day = d;
      hourInput.dataset.grid = "true";
      hourInput.addEventListener("input", (e) => {
        projects[pIdx].hours[d] = parseFloat(e.target.value) || 0;
        updateRowTotal(pIdx);
        calcTotals();
        updatePreview();
      });
      // Select all on focus for easy editing
      hourInput.addEventListener("focus", (e) => e.target.select());
      td.appendChild(hourInput);
      tr.appendChild(td);
    }

    // Row total cell
    const tdTotal = document.createElement("td");
    tdTotal.className = "row-total";
    tdTotal.id = `rowTotal${pIdx}`;
    const rowSum = proj.hours.reduce((a, b) => a + b, 0);
    tdTotal.textContent = rowSum > 0 ? rowSum.toFixed(2).replace(/\.00$/, '') : '0';
    tr.appendChild(tdTotal);

    // Remove button cell
    const tdRemove = document.createElement("td");
    if (projects.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-remove-row";
      removeBtn.title = "Remove";
      removeBtn.textContent = "✕";
      removeBtn.dataset.pidx = pIdx;
      removeBtn.addEventListener("click", () => {
        if (projects.length > 1) {
          projects.splice(pIdx, 1);
          renderTimesheetGrid();
          calcTotals();
          updatePreview();
        }
      });
      tdRemove.appendChild(removeBtn);
    }
    tr.appendChild(tdRemove);

    tbody.appendChild(tr);
  });

  // Update day headers with dates if available
  updateDayHeaders();
}

// ── Update Row Total ─────────────────────────────────────────
function updateRowTotal(pIdx) {
  const total = projects[pIdx].hours.reduce((a, b) => a + b, 0);
  const el = $(`rowTotal${pIdx}`);
  if (el) el.textContent = total > 0 ? fmtHours(total) : '0';
}

// ── Calculate Totals ─────────────────────────────────────────
function calcTotals() {
  // Daily totals
  const dailyTotals = [0,0,0,0,0,0,0];
  let grandTotal = 0;

  projects.forEach((proj) => {
    for (let d = 0; d < 7; d++) {
      dailyTotals[d] += proj.hours[d] || 0;
    }
  });

  for (let d = 0; d < 7; d++) {
    grandTotal += dailyTotals[d];
    const el = $(`dayTotal${d}`);
    if (el) el.textContent = dailyTotals[d] > 0 ? fmtHours(dailyTotals[d]) : '0';
  }

  const grandEl = $("grandTotal");
  if (grandEl) grandEl.textContent = grandTotal > 0 ? fmtHours(grandTotal) : '0';

  // Pay calculation
  const rate = parseFloat($("hourlyRate")?.value) || 0;
  const payDisplay = $("payDisplay");

  if (rate > 0 && payDisplay) {
    payDisplay.style.display = "";
    $("dispTotalHours").textContent = fmtHours(grandTotal);
    $("dispRate").textContent = fmtCurrency(rate);
    $("dispTotalPay").textContent = fmtCurrency(grandTotal * rate);
  } else if (payDisplay) {
    payDisplay.style.display = "none";
  }

  return { dailyTotals, grandTotal, rate, totalPay: grandTotal * rate };
}

// ── Live Preview ──────────────────────────────────────────────
function updatePreview() {
  const data = collectFormData();
  $("previewBody").innerHTML = renderPreviewHTML(data);
}

function collectFormData() {
  const currency = $("currency")?.value || "$";
  const totals = calcTotals();

  // Get day labels
  const startVal = $("weekStarting")?.value;
  let dayLabels = [...DAY_NAMES_SHORT];
  if (startVal) {
    const start = new Date(startVal + 'T00:00:00');
    dayLabels = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dayLabels.push(`${DAY_NAMES_SHORT[i]} ${d.getMonth()+1}/${d.getDate()}`);
    }
  }

  return {
    worker: {
      name:  $("workerName")?.value || '',
      email: $("workerEmail")?.value || '',
      title: $("workerTitle")?.value || '',
      phone: $("workerPhone")?.value || '',
    },
    company: {
      name:       $("companyName")?.value || '',
      supervisor: $("supervisorName")?.value || '',
      department: $("department")?.value || '',
    },
    period: {
      start: $("weekStarting")?.value || '',
      end:   $("weekEnding")?.value || '',
    },
    hourlyRate: parseFloat($("hourlyRate")?.value) || 0,
    projects,
    dayLabels,
    ...totals,
    notes:    $("notes")?.value || '',
    currency,
  };
}

function renderPreviewHTML(d) {
  const cur = d.currency || "$";
  const fmt = (n) => `${cur}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const esc = escHtml;

  const periodStr = d.period.start && d.period.end
    ? `${formatDatePretty(d.period.start)} — ${formatDatePretty(d.period.end)}`
    : '';

  // Build hours table rows
  const projectRows = d.projects.map((proj, i) => {
    const rowTotal = proj.hours.reduce((a, b) => a + b, 0);
    const cells = proj.hours.map((h) =>
      `<td style="padding:4px 6px;text-align:center;font-size:10px;border:1px solid #e2e8f0;">${h > 0 ? h : '-'}</td>`
    ).join('');
    return `
      <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'};">
        <td style="padding:4px 8px;font-size:10px;border:1px solid #e2e8f0;font-weight:500;">${esc(proj.name) || '<em style="color:#aaa">Project</em>'}</td>
        ${cells}
        <td style="padding:4px 6px;text-align:center;font-size:10px;font-weight:700;border:1px solid #e2e8f0;color:#0891b2;">${rowTotal > 0 ? fmtHours(rowTotal) : '0'}</td>
      </tr>
    `;
  }).join('');

  // Daily totals footer
  const dailyTotalCells = d.dailyTotals.map((t) =>
    `<td style="padding:4px 6px;text-align:center;font-size:10px;font-weight:700;border:1px solid #e2e8f0;">${t > 0 ? fmtHours(t) : '0'}</td>`
  ).join('');

  // Day header cells
  const dayHeaders = d.dayLabels.map((label) =>
    `<th style="padding:5px 4px;text-align:center;font-size:8px;font-weight:700;white-space:nowrap;">${esc(label)}</th>`
  ).join('');

  return `
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#1a202c;padding:24px;background:#fff;min-height:500px;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#1a202c;">${esc(d.worker.name) || "<span style='color:#aaa'>Employee Name</span>"}</div>
          ${d.worker.title ? `<div style="color:#718096;font-size:10px;margin-top:2px;">${esc(d.worker.title)}</div>` : ''}
          ${d.worker.email ? `<div style="color:#718096;font-size:10px;">${esc(d.worker.email)}</div>` : ''}
          ${d.worker.phone ? `<div style="color:#718096;font-size:10px;">${esc(d.worker.phone)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:8px;font-weight:700;color:#718096;letter-spacing:2px;">TIMESHEET</div>
          ${d.company.name ? `<div style="font-size:13px;font-weight:700;color:#0891b2;margin-top:2px;">${esc(d.company.name)}</div>` : ''}
          ${d.company.department ? `<div style="font-size:10px;color:#4a5568;">${esc(d.company.department)}</div>` : ''}
          ${d.company.supervisor ? `<div style="font-size:10px;color:#718096;">Supervisor: ${esc(d.company.supervisor)}</div>` : ''}
        </div>
      </div>

      <!-- Divider -->
      <div style="height:4px;background:linear-gradient(135deg,#0891b2,#06b6d4);border-radius:2px;margin-bottom:12px;"></div>

      <!-- Pay Period -->
      ${periodStr ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-size:8px;font-weight:700;color:#0891b2;letter-spacing:1px;margin-bottom:3px;">PAY PERIOD</div>
          <div style="font-weight:600;font-size:11px;">${periodStr}</div>
        </div>
        ${d.hourlyRate > 0 ? `<div style="text-align:right;"><div style="font-size:8px;font-weight:700;color:#0891b2;letter-spacing:1px;margin-bottom:3px;">HOURLY RATE</div><div style="font-weight:700;font-size:12px;">${fmt(d.hourlyRate)}/hr</div></div>` : ''}
      </div>` : ''}

      <!-- Hours Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr style="background:#0891b2;color:#fff;">
            <th style="padding:5px 8px;text-align:left;font-size:8px;font-weight:700;">PROJECT</th>
            ${dayHeaders}
            <th style="padding:5px 4px;text-align:center;font-size:8px;font-weight:700;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${projectRows}
        </tbody>
        <tfoot>
          <tr style="background:#edf2f7;">
            <td style="padding:5px 8px;font-size:9px;font-weight:700;border:1px solid #e2e8f0;color:#4a5568;">DAILY TOTALS</td>
            ${dailyTotalCells}
            <td style="padding:4px 6px;text-align:center;font-size:11px;font-weight:800;border:1px solid #e2e8f0;color:#0891b2;">${d.grandTotal > 0 ? fmtHours(d.grandTotal) : '0'}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Pay Summary -->
      ${d.hourlyRate > 0 ? `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
        <div style="width:220px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;"><span>Total Hours</span><span>${fmtHours(d.grandTotal)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;"><span>Rate</span><span>${fmt(d.hourlyRate)}/hr</span></div>
          <div style="border-top:2px solid #0891b2;margin:6px 0;"></div>
          <div style="display:flex;justify-content:space-between;font-weight:800;font-size:13px;color:#0891b2;"><span>TOTAL PAY</span><span>${fmt(d.grandTotal * d.hourlyRate)}</span></div>
        </div>
      </div>` : ''}

      <!-- Notes -->
      ${d.notes ? `<div style="margin-bottom:10px;"><div style="font-size:8px;font-weight:700;color:#0891b2;letter-spacing:1px;margin-bottom:3px;">NOTES</div><div style="font-size:10px;color:#4a5568;white-space:pre-wrap;">${esc(d.notes)}</div></div>` : ''}

      <!-- Signature blocks -->
      <div style="display:flex;justify-content:space-between;margin-top:24px;">
        <div style="width:180px;">
          <div style="border-top:1px solid #ccc;padding-top:4px;font-size:9px;color:#999;">Employee Signature</div>
          <div style="font-size:8px;color:#bbb;margin-top:2px;">Date: _______________</div>
        </div>
        <div style="width:180px;">
          <div style="border-top:1px solid #ccc;padding-top:4px;font-size:9px;color:#999;">Supervisor Signature</div>
          <div style="font-size:8px;color:#bbb;margin-top:2px;">Date: _______________</div>
        </div>
      </div>
    </div>
  `;
}

// ── Download ──────────────────────────────────────────────────
async function downloadTimesheet() {
  if (isGenerating) return;

  const data = collectFormData();
  if (!data.worker.name) { showToast("Enter your name to generate a timesheet.", "error"); return; }
  if (data.grandTotal === 0) { showToast("Enter some hours before downloading.", "error"); return; }

  isGenerating = true;
  const btn = $("btnDownload");
  btn.disabled = true;
  btn.textContent = "⏳ Generating PDF…";

  try {
    // Use the preview HTML to generate PDF via the browser print
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    const previewHTML = renderPreviewHTML(data);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Timesheet - ${escHtml(data.worker.name)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', sans-serif; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>${previewHTML}</body>
      </html>
    `);
    printWindow.document.close();

    // Wait for fonts to load then trigger print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);

    showToast("✓ Print dialog opened — save as PDF!", "success");
  } catch (err) {
    console.error(err);
    showToast("Error generating timesheet. Please try again.", "error");
  } finally {
    isGenerating = false;
    btn.disabled = false;
    btn.textContent = "⬇ Download Timesheet PDF";
  }
}

// ── Helpers ───────────────────────────────────────────────────
function fmtHours(n) {
  const num = Number(n || 0);
  if (num % 1 === 0) return num.toString();
  return num.toFixed(2).replace(/0$/, '');
}

function fmtCurrency(n) {
  const cur = $("currency")?.value || "$";
  return `${cur}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDatePretty(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, type = "success") {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className   = `toast toast--${type} show`;
  setTimeout(() => toast.classList.remove("show"), 4000);
}
