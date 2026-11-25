import { db } from "../js/firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Daftar 6 dokumen pembayaran
const DOC = [
  ["pp", "Surat permohonan pembayaran"],
  ["in", "Faktur barang / invoice"],
  ["fp", "Faktur pajak"],
  ["sjm", "Surat jaminan mutu"],
  ["sp", "Surat keterangan perolehan"],
  ["co", "COO / COM"]
];

const L1 = [
  "Surat Pengantaran Barang/Surat Jalan",
  "Surat Permohonan Pengujian",
  "Form PG.751",
  "RDS Permohonan Pengujian",
  "Berita Acara Pengujian",
  "Dokumen Pengujian Barang",
  "Bukti Penerimaan Barang/Goods Receipt",
  "Berita Acara Serah Terima Barang",
  "Daftar Penerimaan Barang"
];

const L2 = [
  "Surat Permohonan Pembayaran",
  "Faktur Barang/Invoice",
  "Faktur Pajak",
  "Surat Jaminan Mutu/Quality Guarantee",
  "Surat Perolehan Barang/COO/COM",
  "Laporan Pajak 3 Bulan",
  "Surat PKP",
  "NPWP",
  "Surat Referensi Bank",
  "Copy Surat Perintah Kerja",
  "SKTD",
  "Realisasi"
];

const HD = [
  "NO RKS", "NAMA PENGADAAN",
  "NO SURAT PERMOHONAN PEMBAYARAN", "TGL SURAT",
  "FAKTUR BRG / INVOICE", "TGL FAKTUR BRG / INVOICE",
  "FAKTUR PAJAK", "TGL F PAJAK",
  "SURAT JAMINAN MUTU", "TGL SJM",
  "SRT PEROLEHAN", "TGL SRT PEROLEHAN",
  "COO/COM", "TGL COO/ COM",
  "JENIS", "NOMOR SPK/KONTRAK"
];

// Penyimpanan sementara di memori browser agar pindah menu terasa instan
let S = { items: [], inv: {} };
let META = {};
let userNames = {};
let cur = null;
let currentProfile = null;
let rootEl = null;
let unsubs = [];
let onSyncCallback = null;

// Antrean simpan otomatis agar pengetikan tetap mulus
const timers = {};
const queue = [];
let flushing = false;

// Fungsi bantu pemformatan teks, tanggal, dan rupiah
const E = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sk = (id) => id.replace(/[^A-Za-z0-9_.@+-]/g, (c) => "~" + c.charCodeAt(0).toString(16) + "~");
const v = (x) => (x == null ? "" : String(x).trim());
const dt = (x) => (typeof x === "number" && x > 0 ? new Date(Math.round((x - 25569) * 864e5)).toISOString().slice(0, 10) : "");
const fd = (i) => (i ? i.split("-").reverse().join("/") : "-");
const rp = (n) => (typeof n === "number" ? "Rp " + n.toLocaleString("id-ID") : "-");
const nz = (x) => x || "-";
const filled = (id) => DOC.filter(([k]) => S.inv[id] && S.inv[id][k + "N"]).length;
const rows = (wb, n) => (wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) : []);

function toast(msg) {
  let t = document.getElementById("piToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "piToast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 4500);
}

// 1. Menyalakan sinkronisasi real-time dengan Firestore
export function startInvoiceSync(profile, onUpdate) {
  stopInvoiceSync();
  currentProfile = profile;
  onSyncCallback = onUpdate;

  // Muat daftar nama rekan kerja untuk info "Terakhir diubah oleh..."
  getDocs(collection(db, "users")).then((snap) => {
    userNames = {};
    snap.forEach((d) => {
      const data = d.data();
      userNames[d.id] = data.nama || data.email || "Rekan";
    });
    updateWho();
  }).catch(() => {});

  // Pantau data SPK & Kontrak secara real-time
  const unsubItems = onSnapshot(collection(db, "items"), (snap) => {
    const chunks = [];
    snap.forEach((d) => chunks.push(d.data()));
    chunks.sort((a, b) => (a.n || 0) - (b.n || 0));
    S.items = chunks.flatMap((x) => x.list || []);
    if (cur) cur = S.items.find((i) => i.id === cur.id) || cur;
    refreshUI();
    if (onSyncCallback) onSyncCallback();
  }, () => toast("Gagal memuat data SPK/Kontrak dari database."));

  // Pantau data isian invoice secara real-time
  const unsubInv = onSnapshot(collection(db, "invoice"), (snap) => {
    const inv = {};
    META = {};
    snap.forEach((d) => {
      const { id, by, byName, at, ...fields } = d.data();
      if (id) {
        inv[id] = fields;
        META[id] = { by, byName, at };
      }
    });
    S.inv = inv;
    refreshUI();
    syncDetailInputs();
    if (onSyncCallback) onSyncCallback();
  }, () => toast("Gagal memuat data invoice dari database."));

  unsubs = [unsubItems, unsubInv];
}

// Mematikan sinkronisasi saat pengguna logout
export function stopInvoiceSync() {
  unsubs.forEach((fn) => fn());
  unsubs = [];
  S = { items: [], inv: {} };
  META = {};
  cur = null;
  rootEl = null;
}

// Mengambil angka ringkasan untuk ditampilkan di Dashboard Utama
export function getInvoiceSummary() {
  const total = S.items.length;
  const spk = S.items.filter((i) => i.jenis === "SPK").length;
  const kontrak = S.items.filter((i) => i.jenis === "KONTRAK").length;
  const sudah = S.items.filter((i) => filled(i.id) > 0).length;
  return { total, spk, kontrak, sudah, belum: total - sudah };
}

// 2. Membaca 4 sheet dari file Excel Pantauan Harian Logistik
function parseExcel(wb) {
  const sh = {};
  const hc = (r) => {
    const a = [];
    let c = r.findIndex((x) => /^Pengiriman Ke-\s*1$/i.test(v(x)));
    if (c < 0) return a;
    for (; c < r.length && /^Pengiriman Ke-\s*\d+$/i.test(v(r[c])); c++) a.push(c);
    return a;
  };

  let cs = [];
  rows(wb, "PANTAUAN SPK").forEach((r) => {
    if (v(r[3]) === "Nomor & Tanggal PR") cs = hc(r);
    const m = /^(\d+)(TSJ|NSJ|TBP|NBP)$/.exec(v(r[5]));
    if (m) (sh["SPK|" + m[1]] = sh["SPK|" + m[1]] || {})[m[2]] = cs.map((c) => r[c]);
  });

  const pk = rows(wb, "PANTAUAN KONTRAK");
  pk.forEach((r, i) => {
    if (v(r[3]) === "Nomor & Tanggal PR" && v(r[1]) !== "") {
      const q = hc(r);
      const g = (o) => q.map((c) => (pk[i + o] || [])[c]);
      sh["KONTRAK|" + v(r[1])] = { TSJ: g(4), NSJ: g(5), TBP: g(6), NBP: g(7) };
    }
  });

  const items = [];
  [["SPK", "LIST SPK", 27], ["KONTRAK", "LIST KONTRAK", 26]].forEach(([j, n, rk]) => {
    rows(wb, n).slice(3).forEach((r) => {
      const k = v(r[13]);
      if (!k) return;
      const s = sh[j + "|" + v(r[0])] || {};
      const ship = [];
      const L = Math.max(0, ...["TSJ", "NSJ", "TBP", "NBP"].map((t) => (s[t] || []).length));
      for (let i = 0; i < L; i++) {
        const o = {
          n: i + 1,
          tsj: dt((s.TSJ || [])[i]),
          nsj: v((s.NSJ || [])[i]),
          tbp: dt((s.TBP || [])[i]),
          nbp: v((s.NBP || [])[i])
        };
        if (o.tsj || o.nsj || o.tbp || o.nbp) ship.push(o);
      }
      items.push({
        id: j + "|" + k,
        jenis: j,
        no: v(r[0]),
        peng: v(r[1]),
        pr: v(r[2]),
        tPR: dt(r[3]),
        tPD: dt(r[4]),
        dok: v(r[6]),
        tDok: dt(r[7]),
        spr: j === "KONTRAK" ? v(r[11]) : "",
        tM: dt(r[12]),
        kontrak: k,
        tK: dt(r[14]),
        nilai: typeof r[15] === "number" ? r[15] : null,
        mppl: dt(r[16]),
        ppn: v(r[17]),
        po: v(r[18]),
        vendor: v(r[10]),
        rkip: v(r[rk]),
        ship
      });
    });
  });
  return items;
}

// 3. Menyimpan data ke Firestore (dengan pemecahan per 15 baris agar ringan)
async function saveItemsToDB(items) {
  const colRef = collection(db, "items");
  const oldSnap = await getDocs(colRef);
  const chunkCount = Math.ceil(items.length / 15);

  for (let c = 0; c < chunkCount; c++) {
    const docId = "c" + String(c).padStart(3, "0");
    await setDoc(doc(db, "items", docId), {
      n: c,
      list: items.slice(c * 15, c * 15 + 15)
    });
  }

  for (const d of oldSnap.docs) {
    if (Number(d.id.slice(1)) >= chunkCount) {
      await deleteDoc(doc(db, "items", d.id));
    }
  }
}

async function flushInvoiceQueue() {
  if (flushing) return;
  flushing = true;
  while (queue.length) {
    const id = queue.shift();
    try {
      await setDoc(doc(db, "invoice", sk(id)), {
        ...(S.inv[id] || {}),
        id,
        by: currentProfile.uid,
        byName: currentProfile.nama,
        at: Date.now()
      });
    } catch (e) {
      toast("Gagal menyimpan perubahan invoice ke database.");
    }
  }
  flushing = false;
}

function queueInvoiceSave(id) {
  if (!currentProfile || currentProfile.role === "viewer") return;
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => {
    if (!queue.includes(id)) queue.push(id);
    flushInvoiceQueue();
  }, 600);
}

// 4. Membuat tampilan halaman Modul Pantauan Invoice 2027
export function renderInvoiceModule(container, profile) {
  rootEl = container;
  currentProfile = profile;
  const isAdmin = profile.role === "admin";
  const canEdit = profile.role === "admin" || profile.role === "editor";

  const statusText = isAdmin
    ? "Data bersama aktif (Admin): Anda dapat mengimpor data harian dan mengubah isian invoice."
    : canEdit
    ? "Data bersama aktif (Editor): Perubahan isian invoice Anda langsung terlihat oleh tim."
    : "Mode lihat saja (Viewer): Anda dapat mencari data dan mencetak Checksheet/Checklist.";

  container.innerHTML = `
    <div id="piApp">
      <div class="pi-header">
        <div>
          <p class="muted" style="margin:0">Data dari Pantauan Harian Logistik. Perubahan tersinkron otomatis ke seluruh tim.</p>
          <p class="pi-mode">${statusText}</p>
        </div>
        <div class="pi-btns">
          <button id="bImp" class="pi-btn pi-pr" ${isAdmin ? "" : "hidden"}>Impor Pantauan Harian</button>
          <button id="bBak" class="pi-btn">Backup Excel</button>
          <button id="bRes" class="pi-btn" ${canEdit ? "" : "hidden"}>Pulihkan Backup</button>
        </div>
      </div>

      <input type="file" id="f1" hidden accept=".xlsx,.xlsm">
      <input type="file" id="f2" hidden accept=".xlsx">

      <section class="pi-stats" id="piStats"></section>

      <section class="card" id="piEmpty" hidden>
        <b>Belum ada data SPK/Kontrak.</b>
        <p class="muted">${isAdmin
          ? 'Klik tombol "Impor Pantauan Harian", lalu pilih file Excel Pantauan Harian Logistik 2027 untuk membagikan data ke tim.'
          : "Menunggu Admin mengimpor data Pantauan Harian Logistik."}</p>
      </section>

      <section class="card">
        <label for="piQ"><b>Cari nomor SPK, nomor kontrak, vendor, atau pengadaan</b></label>
        <input id="piQ" class="pi-input" autocomplete="off" placeholder="Ketik kata kunci...">
        <div id="piRes"></div>
      </section>

      <section class="card" id="piDet" hidden></section>
      <section id="prev" hidden></section>
    </div>
  `;

  bindEvents(isAdmin, canEdit);
  refreshUI();
  if (cur) showDetail(canEdit);
}

function bindEvents(isAdmin, canEdit) {
  const $ = (s) => rootEl.querySelector(s);

  if (isAdmin) {
    $("#bImp").onclick = () => $("#f1").click();
    $("#f1").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!window.XLSX) return toast("Pustaka Excel gagal dimuat. Periksa koneksi internet.");
      toast("Membaca file Excel dan mengunggah ke database tim...");
      try {
        const wb = XLSX.read(await f.arrayBuffer(), {
          type: "array",
          sheets: ["LIST SPK", "LIST KONTRAK", "PANTAUAN SPK", "PANTAUAN KONTRAK"]
        });
        const it = parseExcel(wb);
        if (!it.length) throw new Error("Kosong");
        await saveItemsToDB(it);
        cur = null;
        $("#piDet").hidden = true;
        toast(it.length + " SPK/Kontrak berhasil dimuat dan dibagikan ke tim!");
      } catch (err) {
        toast("Gagal membaca file. Pastikan ini file Pantauan Harian Logistik.");
      }
      e.target.value = "";
    };
  }

  // Tombol Backup Excel yang langsung mengunduh file .xlsx di browser
  $("#bBak").onclick = () => {
    if (!window.XLSX || !S.items.length) return toast("Belum ada data untuk dicadangkan.");
    const aoa = [
      HD,
      ...S.items.map((i) => {
        const iv = S.inv[i.id] || {};
        return [
          Number(i.no) || i.no,
          i.peng,
          ...DOC.flatMap(([k]) => [iv[k + "N"] || "", iv[k + "T"] ? new Date(iv[k + "T"] + "T00:00:00Z") : ""]),
          i.jenis,
          i.kontrak
        ];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (let r = 1; r < aoa.length; r++) {
      "DFHJLN".split("").forEach((c) => {
        const x = ws[c + (r + 1)];
        if (x && x.t === "d") x.z = "dd/mm/yyyy";
      });
    }
    ws["!cols"] = HD.map((h, x) => ({ wch: x === 1 ? 50 : x > 13 ? 24 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INPUT DATA INVOICE");
    XLSX.writeFile(wb, "Backup_Pantauan_Invoice_2027.xlsx");
    toast("File Backup_Pantauan_Invoice_2027.xlsx berhasil diunduh.");
  };

  if (canEdit) {
    $("#bRes").onclick = () => $("#f2").click();
    $("#f2").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = rows(XLSX.read(await f.arrayBuffer(), { type: "array" }), "INPUT DATA INVOICE");
        let n = 0;
        r.slice(1).forEach((x) => {
          const id = v(x[14]) + "|" + v(x[15]);
          if (id === "|") return;
          const o = {};
          DOC.forEach(([k], j) => {
            const a = x[2 + 2 * j];
            const b = x[3 + 2 * j];
            if (v(a)) o[k + "N"] = v(a);
            const t = typeof b === "number"
              ? dt(b)
              : /^\d{2}\/\d{2}\/\d{4}$/.test(v(b))
              ? v(b).split("/").reverse().join("-")
              : "";
            if (t) o[k + "T"] = t;
          });
          if (Object.keys(o).length) {
            S.inv[id] = o;
            n++;
            queueInvoiceSave(id);
          }
        });
        refreshUI();
        if (cur) showDetail(canEdit);
        toast(n + " baris invoice dipulihkan dan disinkronkan ke database tim.");
      } catch (err) {
        toast("Gagal memulihkan backup. Pastikan memakai file hasil Backup Excel.");
      }
      e.target.value = "";
    };
  }

  // Pencarian cepat SPK/Kontrak
  const find = (q) => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.items
      .filter((i) => t.every((w) => (i.kontrak + " " + i.vendor + " " + i.peng + " " + i.po + " " + i.jenis).toLowerCase().includes(w)))
      .slice(0, 12);
  };

  const pick = (item) => {
    cur = item;
    $("#piRes").innerHTML = "";
    $("#piQ").value = item.kontrak;
    showDetail(canEdit);
  };

  $("#piQ").oninput = () => {
    const q = $("#piQ").value.trim();
    const res = q ? find(q) : [];
    $("#piRes").innerHTML = res.length
      ? res.map((i) => `
          <button class="pi-btn pi-ri" data-id="${E(i.id)}">
            <b>${E(i.kontrak)}</b> <span class="pi-tg">${i.jenis}</span>
            ${filled(i.id) ? '<span class="pi-ok">invoice terisi</span>' : ""}
            <br><span class="muted">${E(i.vendor)} · ${E(i.peng).slice(0, 70)}</span>
          </button>`).join("")
      : q ? '<p class="muted">Tidak ada hasil.</p>' : "";
  };

  $("#piQ").onkeydown = (e) => {
    if (e.key === "Enter") {
      const first = find($("#piQ").value)[0];
      if (first) pick(first);
    }
  };

  $("#piRes").onclick = (e) => {
    const btn = e.target.closest(".pi-ri");
    if (btn) {
      const found = S.items.find((i) => i.id === btn.dataset.id);
      if (found) pick(found);
    }
  };

  $("#piDet").oninput = (e) => {
    const f = e.target.dataset.f;
    if (!f || !cur || !canEdit) return;
    (S.inv[cur.id] = S.inv[cur.id] || {})[f] = e.target.value;
    queueInvoiceSave(cur.id);
    updateCount();
    refreshUI();
  };

  $("#piDet").onclick = (e) => {
    if (e.target.id === "bCs") showPreview(buildChecksheet(cur));
    if (e.target.id === "bCl") showPreview(buildChecklist(cur));
  };
}

function refreshUI() {
  if (!rootEl) return;
  const statsEl = rootEl.querySelector("#piStats");
  const emptyEl = rootEl.querySelector("#piEmpty");
  if (!statsEl || !emptyEl) return;

  const s = getInvoiceSummary();
  statsEl.innerHTML = [
    [s.spk, "SPK"],
    [s.kontrak, "Kontrak"],
    [s.sudah, "Sudah ada invoice"],
    [s.belum, "Belum ada invoice"]
  ].map(([x, l]) => `<div class="pi-st"><b>${x}</b><span>${l}</span></div>`).join("");

  emptyEl.hidden = s.total > 0;
}

function updateCount() {
  if (!rootEl || !cur) return;
  const el = rootEl.querySelector("#piCnt");
  if (el) el.textContent = filled(cur.id) + " dari 6 dokumen terisi";
}

function updateWho() {
  if (!rootEl || !cur) return;
  const el = rootEl.querySelector("#piWho");
  if (!el) return;
  const m = META[cur.id];
  if (!m || !m.at) {
    el.textContent = "";
    return;
  }
  const nama = m.byName || userNames[m.by] || "Rekan";
  el.textContent = "Terakhir diubah oleh " + nama + ", " + new Date(m.at).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function syncDetailInputs() {
  if (!rootEl || !cur) return;
  const det = rootEl.querySelector("#piDet");
  if (!det || det.hidden) return;
  const iv = S.inv[cur.id] || {};
  det.querySelectorAll("[data-f]").forEach((inp) => {
    if (inp !== document.activeElement) {
      inp.value = iv[inp.dataset.f] || "";
    }
  });
  updateCount();
  updateWho();
}

function showDetail(canEdit) {
  const det = rootEl.querySelector("#piDet");
  const prev = rootEl.querySelector("#prev");
  const i = cur;
  const iv = S.inv[i.id] || {};
  det.hidden = false;
  prev.hidden = true;

  det.innerHTML = `
    <div class="pi-hd">
      <div>
        <h2 style="margin:0;font-size:17px">${E(i.kontrak)}</h2>
        <span class="pi-tg">${i.jenis}</span> <span class="muted">${E(i.vendor)}</span>
      </div>
      <span id="piCnt" class="pi-chip"></span>
    </div>
    <p style="margin:8px 0">${E(i.peng)}</p>
    <div class="pi-gr">
      <div><small class="muted">Nilai</small><div>${rp(i.nilai)}</div></div>
      <div><small class="muted">PO</small><div>${nz(i.po)}</div></div>
      <div><small class="muted">RKIP</small><div>${nz(i.rkip)}</div></div>
      <div><small class="muted">Tanggal</small><div>${fd(i.tK)}</div></div>
      <div><small class="muted">MPPL</small><div>${fd(i.mppl)}</div></div>
      <div><small class="muted">Pengiriman</small><div>${i.ship.length}</div></div>
    </div>
    <h3 style="margin:14px 0 6px;font-size:14px">Isian invoice</h3>
    <table class="pi-fm">
      ${DOC.map(([k, l]) => `
        <tr>
          <td>${l}</td>
          <td><input data-f="${k}N" placeholder="Nomor" value="${E(iv[k + "N"])}" ${canEdit ? "" : "disabled"}></td>
          <td><input type="date" data-f="${k}T" value="${E(iv[k + "T"])}" ${canEdit ? "" : "disabled"}></td>
        </tr>`).join("")}
    </table>
    <small id="piWho" class="muted" style="display:block;margin-top:6px"></small>
    <div class="pi-btns" style="margin-top:12px">
      <button class="pi-btn pi-pr" id="bCs">Cetak Checksheet</button>
      <button class="pi-btn pi-pr" id="bCl">Cetak Checklist</button>
    </div>
  `;
  updateCount();
  updateWho();
}

function showPreview(html) {
  const p = rootEl.querySelector("#prev");
  p.hidden = false;
  p.innerHTML = `
    <div class="bar">
      <button class="pi-btn pi-pr" id="bPr">Cetak / simpan PDF</button>
      <button class="pi-btn" id="bCx">Tutup</button>
    </div>
    <div class="paper">${html}</div>
  `;
  p.querySelector("#bPr").onclick = () => window.print();
  p.querySelector("#bCx").onclick = () => { p.hidden = true; };
  p.scrollIntoView({ behavior: "smooth" });
}

// 5. Pembuat lembar cetak Checksheet & Checklist (identik dengan format kerja Anda)
function buildChecksheet(i) {
  const iv = S.inv[i.id] || {};
  const k = i.jenis === "KONTRAK";
  const R = (a, b, c, d, e) => `<tr><td class="c">${a}</td><td><b>${b}</b></td><td>${c}</td><td>${d}</td><td class="c">${e}</td></tr>`;
  const n = [];
  n.push(R(1, "PERSETUJUAN DANA", "PR RAB", nz(i.pr), fd(i.tPR)), R("", "", "Persetujuan Dana (PD)", nz(i.pr), fd(i.tPD)));
  n.push(
    R(2, "PROSES PENGADAAN", k ? "SP3" : "Rencana Kerja & Syarat-Syarat (RKS)", nz(i.dok), fd(i.tDok)),
    R("", "", "Undangan Pengadaan", "-", fd(i.tDok)),
    R("", "", "Bio data perusahaan", "AKTA · TDP/NIB · SIUP · NPWP · PKP · REF BANK · PAJAK 3 BULAN · FOTO", ""),
    R("", "", k ? "SPR" : "Keputusan Penetapan (KP)", nz(i.spr), fd(i.tM)),
    R("", "", k ? "Kontrak" : "Surat Perintah Kerja (SPK)", nz(i.kontrak), fd(i.tK)),
    R("", "", "Masa Penyerahan Paling Lambat", "-", fd(i.mppl))
  );
  (i.ship.length ? i.ship : [{}]).forEach((s, x) =>
    n.push(R(x ? "" : 3, x ? "" : "PROSES PENGIRIMAN BARANG", "Pengiriman ke-" + (s.n || x + 1) + " · Surat Pengantar Barang", "SPB: " + nz(s.nsj) + "<br>BAPB: " + nz(s.nbp), fd(s.tbp || s.tsj)))
  );
  DOC.forEach(([c, l], x) => n.push(R(x ? "" : 4, x ? "" : "PROSES PEMBAYARAN", l, nz(iv[c + "N"]), fd(iv[c + "T"]))));
  ["Denda-Hari-Total (Rp)", "SKB/RESI", "A.9/SAB"].forEach((l) => n.push(R("", "", l, "", "")));

  return `
    <h3 class="ct">CHECKSHEET ${k ? "KONTRAK" : "SURAT PERINTAH KERJA"}</h3>
    <p class="ct">${E(i.peng)}</p>
    <table class="sheet hh">
      <tr><td>Nama vendor</td><td>: ${E(i.vendor)}</td><td>Purchase Order</td><td>: ${nz(i.po)}</td></tr>
      <tr><td>Nomor ${k ? "kontrak" : "SPK"}</td><td>: ${E(i.kontrak)}</td><td>PPN</td><td>: ${i.ppn === "TDP" ? "Tidak Dipungut" : i.ppn ? "Dipungut" : "-"}</td></tr>
      <tr><td>Tanggal</td><td>: ${fd(i.tK)}</td><td>RKIP</td><td>: ${nz(i.rkip)}</td></tr>
      <tr><td>Nilai (Netto)</td><td>: ${rp(i.nilai)}</td><td>Unit</td><td>: Logistik</td></tr>
    </table>
    <table class="sheet">
      <tr><th>NO</th><th>KEGIATAN</th><th>DOKUMEN</th><th>NOMOR</th><th>TANGGAL</th></tr>
      ${n.join("")}
    </table>
  `;
}

function buildChecklist(i) {
  const k = i.jenis === "KONTRAK";
  const hs = (() => {
    const d = i.ship.filter((s) => /^\d+(\/RPHP\b.*)?$/i.test(s.nbp));
    return d.length ? d : [{}];
  })();
  const Z = 12;
  const num = (s) => (String(s.nbp || "").match(/^\d{1,2}/) || ["-"])[0];
  const tg = (s) => (s.tbp ? s.tbp.slice(8, 10) + "/" + s.tbp.slice(5, 7) : "");
  const A = k ? L1.filter((l) => l !== "Form PG.751") : L1;
  const sec = (n, u, L, B) =>
    L.map((l, x) => `<tr${x ? "" : ' class="sep"'}>${x ? "" : `<td class="c sc" rowspan=${L.length}>${n}</td><td class="sc" rowspan=${L.length}>${u}</td>`}<td class="c">${x + 1}</td><td>${l}</td>${B}</tr>`).join("");

  const tb = [];
  for (let c = 0; c < hs.length; c += Z) {
    const h = hs.slice(c, c + Z);
    const B = '<td class="bx"></td>'.repeat(h.length);
    tb.push(`
      <table class="sheet cl${c ? " pb" : ""}">
        <thead>
          <tr><th rowspan=2 style="width:34px">NO</th><th rowspan=2 style="width:150px">URAIAN</th><th colspan=2 rowspan=2>KEGIATAN</th>${h.map((s) => "<th>" + num(s) + "</th>").join("")}</tr>
          <tr>${h.map((s) => '<th class="dt">' + tg(s) + "</th>").join("")}</tr>
        </thead>
        <tbody>${sec(1, "DOKUMEN PENGIRIMAN (BERKAS)", A, B) + sec(2, "DOKUMEN PEMBAYARAN", L2, B)}</tbody>
      </table>
    `);
  }

  return `
    <h3 class="ct tt">CHECKLIST DOKUMEN</h3>
    <table class="sheet hh il">
      <tr><td>Nomor ${k ? "kontrak" : "SPK"}</td><td>: ${E(i.kontrak)}</td></tr>
      <tr><td>Rekanan</td><td>: ${E(i.vendor)}</td></tr>
      <tr><td>Pengadaan</td><td>: ${E(i.peng)}</td></tr>
      <tr><td>Nilai</td><td>: ${rp(i.nilai)}</td></tr>
    </table>
    ${tb.join("")}
  `;
}
