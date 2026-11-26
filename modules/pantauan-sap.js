import { db } from "../js/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const TARGET_SHEETS = [
  "INPUT",
  "GR PO",
  "GR ORDER",
  "PO STO MINTA",
  "PO STO BERI",
  "PANTAUAN ORDER",
  "Log MIGO",
  "LOG GR ORDER",
  "LOG PO STO"
];

const MIGO_CHUNK_SIZE = 600;
const ORDER_CHUNK_SIZE = 400;
const MAX_MIGO_STORED = 8000;
const PAGE_SIZE = 50;

let unsubSummary = null;
let onSummaryChangeCb = null;
let sapSummary = null;
let sapDetails = null;
let detailsLoadedAt = 0;

let uiContainer = null;
let currentProfile = null;
let activeTab = "antrean";
let activeQueueSub = "grPo";
let searchQuery = "";
let migoStatusFilter = "ALL";
let orderOpacFilter = "ALL";
let currentPage = 1;

const E = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));

const v = (x) => (x == null ? "" : String(x).trim());

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseDateTime(raw) {
  if (raw == null || raw === "") return { text: "", iso: "", ym: "" };

  if (typeof raw === "number" && raw > 20000) {
    const ms = Math.round((raw - 25569) * 86400000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const dd = pad2(d.getUTCDate());
      const mm = pad2(d.getUTCMonth() + 1);
      const yyyy = d.getUTCFullYear();
      const hh = pad2(d.getUTCHours());
      const mi = pad2(d.getUTCMinutes());
      const hasTime = raw % 1 > 0.0005;
      return {
        text: hasTime ? `${dd}/${mm}/${yyyy} ${hh}.${mi}` : `${dd}/${mm}/${yyyy}`,
        iso: `${yyyy}-${mm}-${dd}`,
        ym: `${yyyy}-${mm}`
      };
    }
  }

  const s = v(raw);
  const m1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})[.:](\d{2}))?/.exec(s);
  if (m1) {
    const dd = pad2(m1[1]);
    const mm = pad2(m1[2]);
    const yyyy = m1[3].length === 2 ? "20" + m1[3] : m1[3];
    return {
      text: s,
      iso: `${yyyy}-${mm}-${dd}`,
      ym: `${yyyy}-${mm}`
    };
  }

  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) {
    return {
      text: s,
      iso: `${m2[1]}-${m2[2]}-${m2[3]}`,
      ym: `${m2[1]}-${m2[2]}`
    };
  }

  return { text: s, iso: "", ym: "" };
}

function formatQty(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? String(raw) : raw.toLocaleString("id-ID");
  }
  return v(raw);
}

function parseQtyNum(raw) {
  if (typeof raw === "number") return raw;
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function classifyStatus(statusStr, noteStr = "") {
  const st = v(statusStr).toLowerCase();
  const nt = v(noteStr).toLowerCase();
  if (st.includes("berhasil") || st.includes("posted") || st === "ok") return "BERHASIL";
  if (
    st.includes("stock kurang") ||
    st.includes("stok kurang") ||
    nt.includes("saldo tidak cukup") ||
    nt.includes("deficit")
  ) {
    return "STOCK_KURANG";
  }
  if (!st && !nt) return "LAINNYA";
  return "GAGAL";
}

function getSheetRows(wb, targetName) {
  const actual = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === targetName.trim().toLowerCase()
  );
  if (!actual || !wb.Sheets[actual]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[actual], {
    header: 1,
    raw: true,
    defval: ""
  });
}

function parseSuperSriWorkbook(wb) {
  // 1. Sheet INPUT (GI Order aktif)
  const input = getSheetRows(wb, "INPUT")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[2]))
    .map((r) => [
      v(r[0]), // order
      v(r[1]), // material
      v(r[2]), // nama material
      formatQty(r[3]), // qty
      v(r[4]), // opac
      v(r[5]), // user
      v(r[6]), // jenis sc
      v(r[7]), // no dok
      v(r[8]), // status
      v(r[9])  // keterangan
    ]);

  // 2. Sheet GR PO (Aktif)
  const grPo = getSheetRows(wb, "GR PO")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[5]) || v(r[6]) || v(r[11]))
    .map((r) => [
      v(r[0]), // nomor pr
      v(r[1]), // nomor po
      v(r[2]), // no uji
      v(r[3]), // no bast
      v(r[4]), // header text
      v(r[5]), // material
      v(r[6]), // short text
      formatQty(r[7]), // qty kontrak
      formatQty(r[8]), // qty gr
      v(r[9]), // recipient
      v(r[10]), // text
      v(r[11]) // material document
    ]);

  // 3. Sheet GR ORDER (Aktif)
  const grOrder = getSheetRows(wb, "GR ORDER")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[2]))
    .map((r) => [
      v(r[0]), // order
      v(r[1]), // material
      v(r[2]), // nama material
      v(r[3]), // good receipts
      v(r[4]), // doc header text
      formatQty(r[5]), // qty
      v(r[6]), // no dok
      v(r[7]), // status
      v(r[8])  // keterangan
    ]);

  // 4. Sheet PO STO MINTA (Abaikan baris template yang belum ada material/referensi/qty)
  const poStoMinta = getSheetRows(wb, "PO STO MINTA")
    .slice(1)
    .filter((r) => v(r[3]) || v(r[4]) || v(r[5]) || v(r[8]))
    .map((r) => [
      v(r[0]), // purch.order
      v(r[1]), // purch.grup
      v(r[2]), // supplying plant
      v(r[3]), // our reference
      v(r[4]), // material
      formatQty(r[5]), // po quantity
      v(r[6]), // plant
      v(r[7]), // stor.location
      v(r[8]), // no document
      v(r[9]), // status
      v(r[10]) // keterangan
    ]);

  // 5. Sheet PO STO BERI (Aktif)
  const poStoBeri = getSheetRows(wb, "PO STO BERI")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[2]))
    .map((r) => [
      v(r[0]), // no po
      v(r[1]), // material
      v(r[2]), // short text
      formatQty(r[3]), // qty beri
      v(r[4]), // header text
      v(r[5]), // sloc
      v(r[6]), // material doc
      v(r[7]), // status
      v(r[8])  // keterangan
    ]);

  // 6. Sheet PANTAUAN ORDER
  const pantauanOrder = getSheetRows(wb, "PANTAUAN ORDER")
    .slice(1)
    .filter((r) => v(r[1]) || v(r[2]))
    .map((r) => {
      const d = parseDateTime(r[0]);
      return [
        d.text,   // tanggal
        v(r[1]),  // order
        v(r[2]),  // no kai
        v(r[3]),  // opac
        v(r[4]),  // opac description
        v(r[5]) || "OPEN" // status
      ];
    });

  // 7. Sheet LOG GR ORDER (urutan terbaru di atas)
  const logGrOrderRaw = getSheetRows(wb, "LOG GR ORDER")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[7]));
  const logGrOrder = [];
  let logGrOrderBerhasil = 0;

  // 8. Sheet LOG PO STO (urutan terbaru di atas)
  const logPoStoRaw = getSheetRows(wb, "LOG PO STO")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[2]) || v(r[4]));
  const logPoSto = [];
  let logPoStoBerhasil = 0;

  // 9. Sheet Log MIGO (hitung 100% statistik, tren, & stock kurang)
  const logMigoRaw = getSheetRows(wb, "Log MIGO")
    .slice(1)
    .filter((r) => v(r[0]) || v(r[1]) || v(r[3]));
  const logMigoAll = [];
  let logMigoBerhasil = 0;
  let logMigoStockKurang = 0;
  let logMigoGagal = 0;

  const dayMap = {};
  const monthMap = {};
  const shortageMap = {};

  function addTrend(d, cls) {
    if (!d.iso) return;
    const dk = d.iso;
    const mk = d.ym;
    if (!dayMap[dk]) dayMap[dk] = { key: dk, berhasil: 0, stockKurang: 0, gagal: 0 };
    if (!monthMap[mk]) monthMap[mk] = { key: mk, berhasil: 0, stockKurang: 0, gagal: 0 };
    if (cls === "BERHASIL") {
      dayMap[dk].berhasil++;
      monthMap[mk].berhasil++;
    } else if (cls === "STOCK_KURANG") {
      dayMap[dk].stockKurang++;
      monthMap[mk].stockKurang++;
    } else if (cls === "GAGAL") {
      dayMap[dk].gagal++;
      monthMap[mk].gagal++;
    }
  }

  logMigoRaw.forEach((r) => {
    const d = parseDateTime(r[0]);
    const order = v(r[1]);
    const opac = v(r[2]);
    const material = v(r[3]);
    const qty = formatQty(r[4]);
    const status = v(r[5]);
    const docNo = v(r[6]);
    const note = v(r[7]);
    const cls = classifyStatus(status, note);

    if (cls === "BERHASIL") logMigoBerhasil++;
    else if (cls === "STOCK_KURANG") {
      logMigoStockKurang++;
      const matKey = material || "TANPA KODE";
      if (!shortageMap[matKey]) {
        shortageMap[matKey] = {
          material: matKey,
          count: 0,
          totalQty: 0,
          lastTime: d.text,
          lastOrder: order,
          lastNote: note
        };
      }
      shortageMap[matKey].count++;
      shortageMap[matKey].totalQty += parseQtyNum(r[4]);
      shortageMap[matKey].lastTime = d.text;
      shortageMap[matKey].lastOrder = order;
      if (note) shortageMap[matKey].lastNote = note;
    } else {
      logMigoGagal++;
    }

    addTrend(d, cls);
    logMigoAll.push([d.text, order, opac, material, qty, status, docNo, note]);
  });

  logGrOrderRaw.forEach((r) => {
    const d = parseDateTime(r[0]);
    const status = v(r[8]);
    const cls = classifyStatus(status);
    if (cls === "BERHASIL") logGrOrderBerhasil++;
    addTrend(d, cls);
    logGrOrder.push([
      d.text,
      v(r[1]),
      v(r[2]),
      v(r[3]),
      v(r[4]),
      v(r[5]),
      formatQty(r[6]),
      v(r[7]),
      status
    ]);
  });

  logPoStoRaw.forEach((r) => {
    const d = parseDateTime(r[0]);
    const status = v(r[8]);
    const cls = classifyStatus(status);
    if (cls === "BERHASIL") logPoStoBerhasil++;
    addTrend(d, cls);
    logPoSto.push([
      d.text,
      v(r[1]),
      v(r[2]),
      v(r[3]),
      v(r[4]),
      formatQty(r[5]),
      v(r[6]),
      v(r[7]),
      status
    ]);
  });

  // Balik urutan log agar transaksi paling baru tampil paling atas
  logMigoAll.reverse();
  logGrOrder.reverse();
  logPoSto.reverse();

  // Hitung ringkasan Pantauan Order (OPEN, NO KAI unik, & sebaran OPAC)
  const openOrders = pantauanOrder.filter((r) => r[5].toUpperCase() === "OPEN");
  const uniqueKaiSet = new Set(openOrders.map((r) => r[2]).filter(Boolean));
  const opacMap = {};
  openOrders.forEach((r) => {
    const desc = r[4] || r[3] || "LAINNYA";
    opacMap[desc] = (opacMap[desc] || 0) + 1;
  });
  const opacBreakdown = Object.entries(opacMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Pilih skala tren otomatis: Harian jika <= 21 hari aktif, Bulanan jika lebih panjang
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const dayKeys = Object.keys(dayMap).sort();
  let trendMode = "daily";
  let trend = [];

  if (dayKeys.length <= 21) {
    trendMode = "daily";
    trend = dayKeys.slice(-14).map((k) => {
      const [y, m, dd] = k.split("-");
      return { ...dayMap[k], label: `${dd}/${m}` };
    });
  } else {
    trendMode = "monthly";
    const mKeys = Object.keys(monthMap).sort().slice(-12);
    trend = mKeys.map((k) => {
      const [y, m] = k.split("-");
      return { ...monthMap[k], label: `${monthNames[parseInt(m, 10) - 1] || m} ${y.slice(2)}` };
    });
  }

  const stockShortages = Object.values(shortageMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const migoStoredRows = logMigoAll.slice(0, MAX_MIGO_STORED);
  const migoChunks = Math.ceil(migoStoredRows.length / MIGO_CHUNK_SIZE);
  const orderChunks = Math.ceil(pantauanOrder.length / ORDER_CHUNK_SIZE);

  const inputBerhasil = input.filter((r) => classifyStatus(r[8], r[9]) === "BERHASIL").length;
  const grPoPosted = grPo.filter((r) => Boolean(r[11])).length;

  const summary = {
    updatedAt: Date.now(),
    counts: {
      inputTotal: input.length,
      inputBerhasil,
      grPoTotal: grPo.length,
      grPoPosted,
      grOrderTotal: grOrder.length,
      poStoMintaTotal: poStoMinta.length,
      poStoBeriTotal: poStoBeri.length,
      pantauanOrderTotal: pantauanOrder.length,
      pantauanOrderOpen: openOrders.length,
      uniqueNoKai: uniqueKaiSet.size,
      logMigoTotal: logMigoAll.length,
      logMigoStored: migoStoredRows.length,
      logMigoBerhasil,
      logMigoStockKurang,
      logMigoGagal,
      logGrOrderTotal: logGrOrder.length,
      logGrOrderBerhasil,
      logPoStoTotal: logPoSto.length,
      logPoStoBerhasil,
      totalBerhasilAll: logMigoBerhasil + logGrOrderBerhasil + logPoStoBerhasil
    },
    trendMode,
    trend,
    opacBreakdown,
    stockShortages,
    migoChunks,
    orderChunks
  };

  return {
    summary,
    active: { input, grPo, grOrder, poStoMinta, poStoBeri },
    logsOther: { logGrOrder, logPoSto },
    pantauanOrder,
    migoStoredRows
  };
}

// --- Sinkronisasi Real-Time Summary ---
export function startSapSync(profile, onChange) {
  stopSapSync();
  currentProfile = profile;
  onSummaryChangeCb = onChange;

  unsubSummary = onSnapshot(
    doc(db, "supersri", "summary"),
    (snap) => {
      sapSummary = snap.exists() ? snap.data() : null;
      if (sapSummary && sapSummary.updatedAt !== detailsLoadedAt) {
        sapDetails = null;
      }
      if (onSummaryChangeCb) onSummaryChangeCb(sapSummary);
      if (uiContainer) {
        loadSapDetailsIfNeeded().then(() => renderSapUI());
      }
    },
    (err) => {
      console.error("Gagal membaca ringkasan SuperSri:", err);
    }
  );
}

export function stopSapSync() {
  if (unsubSummary) {
    unsubSummary();
    unsubSummary = null;
  }
  sapSummary = null;
  sapDetails = null;
  detailsLoadedAt = 0;
  uiContainer = null;
}

export function getSapSummary() {
  return sapSummary;
}

async function loadSapDetailsIfNeeded() {
  if (!sapSummary) {
    sapDetails = null;
    return;
  }
  if (sapDetails && detailsLoadedAt === sapSummary.updatedAt) return;

  const targetUpdated = sapSummary.updatedAt;
  const reqs = [
    getDoc(doc(db, "supersri", "active")),
    getDoc(doc(db, "supersri", "logs_other"))
  ];

  const ordCount = sapSummary.orderChunks || 0;
  const migoCount = sapSummary.migoChunks || 0;

  for (let i = 0; i < ordCount; i++) {
    reqs.push(getDoc(doc(db, "supersri", "ord_" + String(i).padStart(3, "0"))));
  }
  for (let i = 0; i < migoCount; i++) {
    reqs.push(getDoc(doc(db, "supersri", "migo_" + String(i).padStart(3, "0"))));
  }

  const snaps = await Promise.all(reqs);
  const activeData = snaps[0].exists()
    ? snaps[0].data()
    : { input: [], grPo: [], grOrder: [], poStoMinta: [], poStoBeri: [] };
  const otherData = snaps[1].exists()
    ? snaps[1].data()
    : { logGrOrder: [], logPoSto: [] };

  const unpack = (arr) => (arr || []).map((x) => (Array.isArray(x) ? x : x.r || []));

  const pantauanOrder = [];
  for (let i = 0; i < ordCount; i++) {
    const s = snaps[2 + i];
    if (s.exists()) pantauanOrder.push(...unpack(s.data().rows));
  }

  const logMigo = [];
  for (let i = 0; i < migoCount; i++) {
    const s = snaps[2 + ordCount + i];
    if (s.exists()) logMigo.push(...unpack(s.data().rows));
  }

  sapDetails = {
    input: unpack(activeData.input),
    grPo: unpack(activeData.grPo),
    grOrder: unpack(activeData.grOrder),
    poStoMinta: unpack(activeData.poStoMinta),
    poStoBeri: unpack(activeData.poStoBeri),
    logGrOrder: unpack(otherData.logGrOrder),
    logPoSto: unpack(otherData.logPoSto),
    pantauanOrder,
    logMigo
  };
  detailsLoadedAt = targetUpdated;
}

async function uploadSuperSriFile(file) {
  if (!window.XLSX) {
    toast("Pustaka Excel gagal dimuat. Periksa koneksi internet.");
    return;
  }

  toast("Membaca file SuperSri, mohon tunggu...");
  try {
    const buf = await file.arrayBuffer();
    const metaWb = XLSX.read(buf, { type: "array", bookSheets: true });
    const matchedSheets = metaWb.SheetNames.filter((name) =>
      TARGET_SHEETS.some((t) => t.toLowerCase() === name.trim().toLowerCase())
    );

    if (!matchedSheets.length) {
      toast("File tidak dikenali. Pastikan ini file SuperSri.xlsm yang benar.");
      return;
    }

    const wb = XLSX.read(buf, { type: "array", sheets: matchedSheets });
    const parsed = parseSuperSriWorkbook(wb);
    parsed.summary.updatedBy = currentProfile?.nama || "Admin";
    parsed.summary.fileName = file.name;

    toast("Menyimpan data ke database bersama...");

    const pack = (rows) => rows.map((r) => ({ r }));

    // Cek dokumen lama agar potongan berlebih bisa dibersihkan
    const existingSnap = await getDocs(collection(db, "supersri"));
    const keepIds = new Set(["summary", "active", "logs_other"]);

    await setDoc(doc(db, "supersri", "active"), {
      input: pack(parsed.active.input),
      grPo: pack(parsed.active.grPo),
      grOrder: pack(parsed.active.grOrder),
      poStoMinta: pack(parsed.active.poStoMinta),
      poStoBeri: pack(parsed.active.poStoBeri)
    });

    await setDoc(doc(db, "supersri", "logs_other"), {
      logGrOrder: pack(parsed.logsOther.logGrOrder),
      logPoSto: pack(parsed.logsOther.logPoSto)
    });

    for (let i = 0; i < parsed.summary.orderChunks; i++) {
      const id = "ord_" + String(i).padStart(3, "0");
      keepIds.add(id);
      const slice = parsed.pantauanOrder.slice(i * ORDER_CHUNK_SIZE, (i + 1) * ORDER_CHUNK_SIZE);
      await setDoc(doc(db, "supersri", id), { idx: i, rows: pack(slice) });
    }

    for (let i = 0; i < parsed.summary.migoChunks; i++) {
      const id = "migo_" + String(i).padStart(3, "0");
      keepIds.add(id);
      const slice = parsed.migoStoredRows.slice(i * MIGO_CHUNK_SIZE, (i + 1) * MIGO_CHUNK_SIZE);
      await setDoc(doc(db, "supersri", id), { idx: i, rows: pack(slice) });
    }

    // Hapus potongan lama yang tidak terpakai lagi
    const deletes = [];
    existingSnap.forEach((d) => {
      if (!keepIds.has(d.id)) deletes.push(deleteDoc(d.ref));
    });
    if (deletes.length) await Promise.all(deletes);

    // Simpan summary paling akhir agar listener lain memuat data yang sudah lengkap
    await setDoc(doc(db, "supersri", "summary"), parsed.summary);

    toast(
      `SuperSri berhasil diperbarui! (${parsed.summary.counts.logMigoTotal.toLocaleString("id-ID")} Log MIGO, ${parsed.summary.counts.pantauanOrderOpen} Order OPEN, ${parsed.summary.counts.grPoTotal} GR PO).`
    );
  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      toast("Gagal simpan: izin Firestore untuk koleksi supersri belum ditambahkan.");
    } else {
      toast("Gagal memproses SuperSri: " + (err.message || "Format tidak sesuai."));
    }
  }
}

function statusBadge(st, note = "") {
  const cls = classifyStatus(st, note);
  if (cls === "BERHASIL") return `<span class="sap-badge sap-ok">${E(st || "BERHASIL")}</span>`;
  if (cls === "STOCK_KURANG") return `<span class="sap-badge sap-warn">${E(st || "Stock Kurang")}</span>`;
  if (cls === "GAGAL") return `<span class="sap-badge sap-err">${E(st || "GAGAL")}</span>`;
  return `<span class="sap-badge sap-neu">${E(st || "-")}</span>`;
}

function filterRows(rows, q) {
  if (!q) return rows;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    const joined = r.join(" ").toLowerCase();
    return terms.every((t) => joined.includes(t));
  });
}

function buildTable(headers, rows, renderRow, emptyText = "Tidak ada data yang cocok.") {
  if (!rows.length) {
    return `<div class="sap-empty">${E(emptyText)}</div>`;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  const pager =
    totalPages > 1
      ? `<div class="sap-pager">
           <span class="muted">Menampilkan ${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} dari ${rows.length.toLocaleString("id-ID")} baris</span>
           <div class="pi-btns">
             <button class="pi-btn ua-sm" data-page-nav="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Sebelumnya</button>
             <span class="sap-page-info">Hal ${currentPage} / ${totalPages}</span>
             <button class="pi-btn ua-sm" data-page-nav="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Berikutnya</button>
           </div>
         </div>`
      : `<div class="sap-pager"><span class="muted">Total ${rows.length.toLocaleString("id-ID")} baris</span></div>`;

  return `
    <div class="sap-table-wrap">
      <table class="sap-table">
        <thead><tr>${headers.map((h) => `<th>${E(h)}</th>`).join("")}</tr></thead>
        <tbody>${slice.map(renderRow).join("")}</tbody>
      </table>
    </div>
    ${pager}
  `;
}

function renderTabBody() {
  if (!sapDetails) {
    return `<div class="card"><p class="muted" style="margin:0">Memuat rincian tabel SuperSri...</p></div>`;
  }

  const c = sapSummary.counts;
  const q = searchQuery.trim();

  if (activeTab === "antrean") {
    const subMenus = [
      ["grPo", `GR PO (${c.grPoTotal})`],
      ["input", `INPUT / GI Order (${c.inputTotal})`],
      ["grOrder", `GR ORDER (${c.grOrderTotal})`],
      ["poStoMinta", `PO STO Minta (${c.poStoMintaTotal})`],
      ["poStoBeri", `PO STO Beri (${c.poStoBeriTotal})`]
    ];

    let tableHtml = "";
    if (activeQueueSub === "grPo") {
      const rows = filterRows(sapDetails.grPo, q);
      tableHtml = buildTable(
        ["Nomor PR", "Nomor PO", "No Uji / BAST", "Material", "Short Text", "Qty Kontrak", "Qty GR", "Recipient", "Material Doc"],
        rows,
        (r) => `<tr>
          <td>${E(r[0] || "-")}</td>
          <td><b>${E(r[1] || "-")}</b></td>
          <td>${E(r[2] || "-")}<br><small class="muted">${E(r[3] || "")}</small></td>
          <td><code>${E(r[5] || "-")}</code></td>
          <td>${E(r[6] || "-")}</td>
          <td class="c">${E(r[7] || "-")}</td>
          <td class="c"><b>${E(r[8] || "-")}</b></td>
          <td>${E(r[9] || "-")}</td>
          <td>${r[11] ? `<span class="sap-doc">${E(r[11])}</span>` : '<span class="muted">Belum GR</span>'}</td>
        </tr>`,
        "Tidak ada item aktif di sheet GR PO."
      );
    } else if (activeQueueSub === "input") {
      const rows = filterRows(sapDetails.input, q);
      tableHtml = buildTable(
        ["Nomor Order", "Material", "Nama Material", "Qty", "OPAC", "User", "Jenis SC", "No Dokumen", "Status"],
        rows,
        (r) => `<tr>
          <td><b>${E(r[0] || "-")}</b></td>
          <td><code>${E(r[1] || "-")}</code></td>
          <td>${E(r[2] || "-")}</td>
          <td class="c">${E(r[3] || "-")}</td>
          <td class="c">${E(r[4] || "-")}</td>
          <td>${E(r[5] || "-")}</td>
          <td>${E(r[6] || "-")}</td>
          <td>${r[7] ? `<span class="sap-doc">${E(r[7])}</span>` : "-"}</td>
          <td>${statusBadge(r[8], r[9])}</td>
        </tr>`,
        "Antrean GI Order (sheet INPUT) saat ini kosong."
      );
    } else if (activeQueueSub === "grOrder") {
      const rows = filterRows(sapDetails.grOrder, q);
      tableHtml = buildTable(
        ["Nomor Order", "Material", "Nama Material", "Good Receipts", "Doc Header Text", "Qty", "No Dokumen", "Status"],
        rows,
        (r) => `<tr>
          <td><b>${E(r[0] || "-")}</b></td>
          <td><code>${E(r[1] || "-")}</code></td>
          <td>${E(r[2] || "-")}</td>
          <td>${E(r[3] || "-")}</td>
          <td>${E(r[4] || "-")}</td>
          <td class="c">${E(r[5] || "-")}</td>
          <td>${r[6] ? `<span class="sap-doc">${E(r[6])}</span>` : "-"}</td>
          <td>${statusBadge(r[7], r[8])}</td>
        </tr>`,
        "Antrean sheet GR ORDER saat ini kosong."
      );
    } else if (activeQueueSub === "poStoMinta") {
      const rows = filterRows(sapDetails.poStoMinta, q);
      tableHtml = buildTable(
        ["Purch.Order", "Supplying Plant", "Our Reference", "Material", "PO Qty", "Plant / Sloc", "No Document", "Status"],
        rows,
        (r) => `<tr>
          <td><b>${E(r[0] || "-")}</b></td>
          <td>${E(r[2] || "-")}</td>
          <td>${E(r[3] || "-")}</td>
          <td><code>${E(r[4] || "-")}</code></td>
          <td class="c">${E(r[5] || "-")}</td>
          <td>${E(r[6] || "-")} / ${E(r[7] || "-")}</td>
          <td>${r[8] ? `<span class="sap-doc">${E(r[8])}</span>` : "-"}</td>
          <td>${statusBadge(r[9], r[10])}</td>
        </tr>`,
        "Antrean sheet PO STO MINTA saat ini kosong."
      );
    } else {
      const rows = filterRows(sapDetails.poStoBeri, q);
      tableHtml = buildTable(
        ["Nomor PO", "Material", "Short Text", "Qty Beri", "Header Text", "Sloc", "Material Doc", "Status"],
        rows,
        (r) => `<tr>
          <td><b>${E(r[0] || "-")}</b></td>
          <td><code>${E(r[1] || "-")}</code></td>
          <td>${E(r[2] || "-")}</td>
          <td class="c">${E(r[3] || "-")}</td>
          <td>${E(r[4] || "-")}</td>
          <td>${E(r[5] || "-")}</td>
          <td>${r[6] ? `<span class="sap-doc">${E(r[6])}</span>` : "-"}</td>
          <td>${statusBadge(r[7], r[8])}</td>
        </tr>`,
        "Antrean sheet PO STO BERI saat ini kosong."
      );
    }

    return `
      <div class="card">
        <div class="sap-pills">
          ${subMenus
            .map(
              ([id, label]) =>
                `<button class="sap-pill ${activeQueueSub === id ? "active" : ""}" data-qsub="${id}">${label}</button>`
            )
            .join("")}
        </div>
        ${tableHtml}
      </div>
    `;
  }

  if (activeTab === "orders") {
    const opacs = [...new Set(sapDetails.pantauanOrder.map((r) => r[4]).filter(Boolean))].sort();
    let rows = filterRows(sapDetails.pantauanOrder, q);
    if (orderOpacFilter !== "ALL") {
      rows = rows.filter((r) => r[4] === orderOpacFilter);
    }
    return `
      <div class="card">
        <div class="sap-filter-row">
          <label class="muted" style="font-size:12px">Filter Tahap (OPAC Description):</label>
          <select id="sapOpacSel" class="ua-select">
            <option value="ALL">Semua Tahap (${sapDetails.pantauanOrder.length})</option>
            ${opacs
              .map(
                (op) =>
                  `<option value="${E(op)}" ${orderOpacFilter === op ? "selected" : ""}>${E(op)}</option>`
              )
              .join("")}
          </select>
        </div>
        ${buildTable(
          ["Tanggal", "Nomor Order", "NO KAI", "OPAC", "OPAC Description", "Status"],
          rows,
          (r) => `<tr>
            <td>${E(r[0] || "-")}</td>
            <td><b>${E(r[1] || "-")}</b></td>
            <td><span class="pi-tg">${E(r[2] || "-")}</span></td>
            <td class="c"><code>${E(r[3] || "-")}</code></td>
            <td>${E(r[4] || "-")}</td>
            <td><span class="sap-badge ${r[5].toUpperCase() === "OPEN" ? "sap-info" : "sap-ok"}">${E(r[5])}</span></td>
          </tr>`,
          "Belum ada data di sheet PANTAUAN ORDER."
        )}
      </div>
    `;
  }

  if (activeTab === "migo") {
    let rows = sapDetails.logMigo;
    if (migoStatusFilter !== "ALL") {
      rows = rows.filter((r) => classifyStatus(r[5], r[7]) === migoStatusFilter);
    }
    rows = filterRows(rows, q);

    const noteOverflow =
      c.logMigoTotal > c.logMigoStored
        ? `<small class="muted" style="display:block;margin-bottom:8px">Menampilkan ${c.logMigoStored.toLocaleString("id-ID")} transaksi terbaru dari total ${c.logMigoTotal.toLocaleString("id-ID")} baris Log MIGO (grafik & statistik tetap dihitung dari 100% data).</small>`
        : "";

    return `
      <div class="card">
        <div class="sap-pills">
          <button class="sap-pill ${migoStatusFilter === "ALL" ? "active" : ""}" data-mstat="ALL">Semua (${c.logMigoTotal.toLocaleString("id-ID")})</button>
          <button class="sap-pill ${migoStatusFilter === "BERHASIL" ? "active" : ""}" data-mstat="BERHASIL">Berhasil (${c.logMigoBerhasil.toLocaleString("id-ID")})</button>
          <button class="sap-pill ${migoStatusFilter === "STOCK_KURANG" ? "active" : ""}" data-mstat="STOCK_KURANG">Stock Kurang (${c.logMigoStockKurang.toLocaleString("id-ID")})</button>
          <button class="sap-pill ${migoStatusFilter === "GAGAL" ? "active" : ""}" data-mstat="GAGAL">Gagal (${c.logMigoGagal.toLocaleString("id-ID")})</button>
        </div>
        ${noteOverflow}
        ${buildTable(
          ["Waktu", "Order", "OPAC", "Material", "Qty", "Status", "Nomor Dokumen", "Keterangan"],
          rows,
          (r) => `<tr>
            <td style="white-space:nowrap">${E(r[0] || "-")}</td>
            <td><b>${E(r[1] || "-")}</b></td>
            <td class="c">${E(r[2] || "-")}</td>
            <td><code>${E(r[3] || "-")}</code></td>
            <td class="c">${E(r[4] || "-")}</td>
            <td>${statusBadge(r[5], r[7])}</td>
            <td>${r[6] ? `<span class="sap-doc" title="Klik untuk salin" data-copy="${E(r[6])}">${E(r[6])}</span>` : "-"}</td>
            <td class="sap-note">${E(r[7] || "-")}</td>
          </tr>`,
          "Belum ada catatan di sheet Log MIGO."
        )}
      </div>
    `;
  }

  if (activeTab === "logGrOrder") {
    const rows = filterRows(sapDetails.logGrOrder, q);
    return `
      <div class="card">
        ${buildTable(
          ["Waktu Posting", "Nomor Order", "Material", "Nama Material", "Recipient", "Doc Header Text", "Qty", "Nomor Dokumen", "Status"],
          rows,
          (r) => `<tr>
            <td style="white-space:nowrap">${E(r[0] || "-")}</td>
            <td><b>${E(r[1] || "-")}</b></td>
            <td><code>${E(r[2] || "-")}</code></td>
            <td>${E(r[3] || "-")}</td>
            <td>${E(r[4] || "-")}</td>
            <td>${E(r[5] || "-")}</td>
            <td class="c">${E(r[6] || "-")}</td>
            <td>${r[7] ? `<span class="sap-doc" title="Klik untuk salin" data-copy="${E(r[7])}">${E(r[7])}</span>` : "-"}</td>
            <td>${statusBadge(r[8])}</td>
          </tr>`,
          "Belum ada catatan di sheet LOG GR ORDER."
        )}
      </div>
    `;
  }

  const rows = filterRows(sapDetails.logPoSto, q);
  return `
    <div class="card">
      ${buildTable(
        ["Waktu Posting", "No Document", "Purch.Order", "Supplying Plant", "Material", "PO Quantity", "Plant / Sloc", "Status"],
        rows,
        (r) => `<tr>
          <td style="white-space:nowrap">${E(r[0] || "-")}</td>
          <td>${r[1] ? `<span class="sap-doc" title="Klik untuk salin" data-copy="${E(r[1])}">${E(r[1])}</span>` : "-"}</td>
          <td><b>${E(r[2] || "-")}</b></td>
          <td>${E(r[3] || "-")}</td>
          <td><code>${E(r[4] || "-")}</code></td>
          <td class="c">${E(r[5] || "-")}</td>
          <td>${E(r[6] || "-")} / ${E(r[7] || "-")}</td>
          <td>${statusBadge(r[8])}</td>
        </tr>`,
        "Belum ada catatan di sheet LOG PO STO."
      )}
    </div>
  `;
}

function renderSapUI() {
  if (!uiContainer) return;
  const isAdmin = currentProfile?.role === "admin";
  const lastStr = sapSummary?.updatedAt
    ? new Date(sapSummary.updatedAt).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "Belum pernah diimpor";

  const headerHtml = `
    <div class="pi-header">
      <div>
        <p class="muted" style="margin:0">Pemantauan antrean kerja SAP, Pantauan Order, dan riwayat Log dari SuperSri.</p>
        <p class="pi-mode">
          ${
            sapSummary
              ? `Terakhir diperbarui oleh ${E(sapSummary.updatedBy || "Admin")} • ${E(lastStr)}`
              : "Data SuperSri belum diunggah."
          }
        </p>
      </div>
      ${
        isAdmin
          ? `<div class="pi-btns">
               <button id="sapImpBtn" class="pi-btn pi-pr">Impor SuperSri (.xlsm)</button>
               <input id="sapFile" type="file" hidden accept=".xlsm,.xlsx">
             </div>`
          : ""
      }
    </div>
  `;

  if (!sapSummary) {
    uiContainer.innerHTML = `
      ${headerHtml}
      <div class="card">
        <h3>Belum ada data SuperSri</h3>
        <p class="muted" style="margin:0">
          ${
            isAdmin
              ? 'Klik tombol <b>Impor SuperSri (.xlsm)</b> di atas lalu pilih file <b>SuperSri.xlsm</b> Anda agar seluruh tim dan atasan dapat memantau data SAP.'
              : "Menunggu Admin mengunggah file SuperSri terbaru."
          }
        </p>
      </div>
    `;
    bindSapEvents();
    return;
  }

  const c = sapSummary.counts;
  const activeTotal = c.inputTotal + c.grPoTotal + c.grOrderTotal + c.poStoMintaTotal + c.poStoBeriTotal;

  uiContainer.innerHTML = `
    ${headerHtml}

    <div class="pi-stats">
      <div class="pi-st"><b>${activeTotal.toLocaleString("id-ID")}</b><span>Total Antrean Aktif (5 Sheet)</span></div>
      <div class="pi-st"><b>${c.pantauanOrderOpen.toLocaleString("id-ID")}</b><span>Order OPEN (${c.uniqueNoKai} NO KAI)</span></div>
      <div class="pi-st"><b style="color:#0b6e5f">${c.totalBerhasilAll.toLocaleString("id-ID")}</b><span>Total Posting Berhasil</span></div>
      <div class="pi-st"><b style="color:#c2410c">${c.logMigoStockKurang.toLocaleString("id-ID")}</b><span>Kejadian Stock Kurang</span></div>
    </div>

    <div class="card" style="padding:12px 14px">
      <div class="sap-toolbar">
        <div class="sap-tabs">
          <button class="sap-tab ${activeTab === "antrean" ? "active" : ""}" data-tab="antrean">Antrean Aktif (${activeTotal})</button>
          <button class="sap-tab ${activeTab === "orders" ? "active" : ""}" data-tab="orders">Pantauan Order (${c.pantauanOrderTotal})</button>
          <button class="sap-tab ${activeTab === "migo" ? "active" : ""}" data-tab="migo">Log MIGO (${c.logMigoTotal.toLocaleString("id-ID")})</button>
          <button class="sap-tab ${activeTab === "logGrOrder" ? "active" : ""}" data-tab="logGrOrder">Log GR Order (${c.logGrOrderTotal})</button>
          <button class="sap-tab ${activeTab === "logPoSto" ? "active" : ""}" data-tab="logPoSto">Log PO STO (${c.logPoStoTotal})</button>
        </div>
        <input id="sapSearch" class="pi-input sap-search" value="${E(searchQuery)}" placeholder="Cari Nomor Order, Material, NO KAI, PO, atau No Dokumen SAP...">
      </div>
    </div>

    <div id="sapTabBody">${renderTabBody()}</div>
  `;

  bindSapEvents();
}

function bindSapEvents() {
  if (!uiContainer) return;

  const impBtn = uiContainer.querySelector("#sapImpBtn");
  const fileInp = uiContainer.querySelector("#sapFile");
  if (impBtn && fileInp) {
    impBtn.onclick = () => fileInp.click();
    fileInp.onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      impBtn.disabled = true;
      impBtn.textContent = "Memproses SuperSri...";
      await uploadSuperSriFile(f);
      impBtn.disabled = false;
      impBtn.textContent = "Impor SuperSri (.xlsm)";
    };
  }

  const searchInp = uiContainer.querySelector("#sapSearch");
  if (searchInp) {
    searchInp.oninput = (e) => {
      searchQuery = e.target.value;
      currentPage = 1;
      const body = uiContainer.querySelector("#sapTabBody");
      if (body) body.innerHTML = renderTabBody();
      bindTabBodyEvents();
    };
  }

  uiContainer.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      currentPage = 1;
      renderSapUI();
    };
  });

  bindTabBodyEvents();
}

function bindTabBodyEvents() {
  const body = uiContainer?.querySelector("#sapTabBody");
  if (!body) return;

  body.querySelectorAll("[data-qsub]").forEach((btn) => {
    btn.onclick = () => {
      activeQueueSub = btn.dataset.qsub;
      currentPage = 1;
      body.innerHTML = renderTabBody();
      bindTabBodyEvents();
    };
  });

  body.querySelectorAll("[data-mstat]").forEach((btn) => {
    btn.onclick = () => {
      migoStatusFilter = btn.dataset.mstat;
      currentPage = 1;
      body.innerHTML = renderTabBody();
      bindTabBodyEvents();
    };
  });

  const opacSel = body.querySelector("#sapOpacSel");
  if (opacSel) {
    opacSel.onchange = (e) => {
      orderOpacFilter = e.target.value;
      currentPage = 1;
      body.innerHTML = renderTabBody();
      bindTabBodyEvents();
    };
  }

  body.querySelectorAll("[data-page-nav]").forEach((btn) => {
    btn.onclick = () => {
      currentPage = parseInt(btn.dataset.pageNav, 10) || 1;
      body.innerHTML = renderTabBody();
      bindTabBodyEvents();
      body.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  body.querySelectorAll("[data-copy]").forEach((el) => {
    el.onclick = async () => {
      try {
        await navigator.clipboard.writeText(el.dataset.copy);
        toast("Nomor dokumen disalin: " + el.dataset.copy);
      } catch {
        toast("Nomor dokumen: " + el.dataset.copy);
      }
    };
  });
}

export function renderSapModule(container, profile, initialTab = null) {
  uiContainer = container;
  currentProfile = profile;
  if (initialTab) activeTab = initialTab;
  currentPage = 1;

  renderSapUI();
  if (sapSummary && (!sapDetails || detailsLoadedAt !== sapSummary.updatedAt)) {
    loadSapDetailsIfNeeded().then(() => {
      if (uiContainer === container) renderSapUI();
    });
  }
}
