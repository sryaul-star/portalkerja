<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Memuat Portal...</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --card: #ffffff;
      --text: #1b2430;
      --muted: #677286;
      --border: #dce1e8;
      --accent: #0b6e5f;
      --accent-soft: #e2f2ee;
      --warn: #a85a06;
      --warn-bg: #fcefd9;
      --danger: #b42318;
      --danger-bg: #fef3f2;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 system-ui, "Segoe UI", Arial, sans-serif;
    }

    /* Layar Login */
    .center-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .login-box {
      width: 100%;
      max-width: 380px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 28px 24px;
    }
    .login-box h1 { margin: 0 0 6px; font-size: 20px; color: var(--accent); }
    .login-box p { margin: 0 0 18px; color: var(--muted); font-size: 13px; }
    .field { margin-bottom: 14px; }
    .field label { display: block; font-weight: 600; margin-bottom: 5px; font-size: 13px; }
    .field input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      font: inherit;
    }
    .btn {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .error-box {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--danger-bg);
      color: var(--danger);
      font-size: 13px;
    }

    /* Kerangka Utama Portal */
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px;
      background: var(--card);
      border-right: 1px solid var(--border);
      padding: 18px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .brand {
      font-size: 17px;
      font-weight: 700;
      color: var(--accent);
      padding: 4px 10px 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }
    .menu { display: flex; flex-direction: column; gap: 6px; }
    .menu button {
      text-align: left;
      padding: 10px 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .menu button:hover { background: var(--bg); }
    .menu button.active {
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }
    .logout-btn {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--danger);
      border-radius: 8px;
      font: inherit;
      cursor: pointer;
    }
    .logout-btn:hover { background: var(--danger-bg); border-color: var(--danger); }

    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 14px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .topbar h2 { margin: 0; font-size: 17px; }
    .user-badge {
      background: var(--accent-soft);
      color: var(--accent);
      padding: 5px 12px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
    }
    .content { padding: 22px; max-width: 960px; width: 100%; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .card h3 { margin: 0 0 8px; font-size: 15px; }
    .muted { color: var(--muted); }

    /* Gaya Modul Pantauan Invoice 2027 */
    .pi-header { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .pi-mode { color: var(--accent); font-size: 12px; margin: 4px 0 0; font-weight: 600; }
    .pi-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .pi-btn {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 12px;
      cursor: pointer;
      font: inherit;
      color: var(--text);
    }
    .pi-btn:hover { border-color: var(--accent); }
    .pi-pr { background: var(--accent); border-color: var(--accent); color: #fff; }
    .pi-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .pi-st { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
    .pi-st b { display: block; font-size: 24px; color: var(--accent); }
    .pi-st span { font-size: 12px; color: var(--muted); }
    .pi-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); margin-top: 6px; font: inherit; }
    .pi-ri { display: block; width: 100%; text-align: left; margin-top: 6px; }
    .pi-tg { background: var(--accent-soft); color: var(--accent); border-radius: 6px; padding: 1px 7px; font-size: 12px; }
    .pi-ok { float: right; color: var(--accent); font-size: 12px; font-weight: 600; }
    .pi-hd { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .pi-chip { background: var(--warn-bg); color: var(--warn); border-radius: 99px; padding: 3px 12px; font-size: 12px; align-self: start; }
    .pi-gr { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 10px 0; }
    .pi-fm { width: 100%; border-collapse: collapse; }
    .pi-fm td { padding: 4px 6px 4px 0; }
    .pi-fm td:first-child { width: 34%; color: var(--muted); }
    .pi-fm input { width: 100%; padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); font: inherit; }
    .pi-fm input:disabled { opacity: 0.7; cursor: not-allowed; }
    #piToast {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      background: var(--text);
      color: #fff;
      padding: 9px 16px;
      border-radius: 99px;
      font-size: 13px;
      max-width: 90%;
      z-index: 999;
    }

    /* Gaya Lembar Cetak Checksheet & Checklist */
    .bar { display: flex; gap: 8px; margin-bottom: 8px; }
    .paper { background: #fff; color: #000; border: 1px solid var(--border); padding: 14px; overflow-x: auto; }
    .sheet { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
    .sheet td, .sheet th { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
    .sheet.hh td { border: 0; padding: 1px 6px; }
    .c { text-align: center; }
    .ct { text-align: center; margin: 4px 0; }
    .bx { min-width: 28px; height: 22px; }
    .sheet th.dt { font-weight: 400; font-size: 10px; }
    .paper * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tt { font-size: 17px; letter-spacing: 1.5px; border-bottom: 3px double #000; padding-bottom: 6px; margin: 2px 0 10px; }
    .il td:first-child { width: 110px; font-weight: 700; }
    .cl { font-size: 12px; margin-top: 10px; }
    .cl td, .cl th { padding: 5px 7px; }
    .cl th { background: #e4e4e4; text-align: center; font-weight: 700; }
    .cl th.dt { background: #f1f1f1; }
    .cl .sc { background: #f1f1f1; font-weight: 700; vertical-align: top; }
    .cl tr.sep td { border-top: 2.5px solid #000; }
    .cl .bx { height: 27px; }

    @media (max-width: 760px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; border-right: 0; border-bottom: 1px solid var(--border); }
    }

    /* Pengaturan khusus saat Cetak / Simpan PDF agar sidebar & menu ikut sembunyi */
    @media print {
      body { background: #fff; }
      .sidebar, .topbar, .bar, #piToast, #piApp > :not(#prev) { display: none !important; }
      .layout, .main, .content { display: block !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
      .paper { border: 0; padding: 0; overflow: visible; }
      .pb { break-before: page; }
      .cl tr { break-inside: avoid; }
      @page { size: A4; margin: 10mm; }
    }
  </style>
</head>
<body>

  <div id="loadingView" class="center-screen">
    <p class="muted">Memeriksa sesi login...</p>
  </div>

  <div id="loginView" class="center-screen" hidden>
    <div class="login-box">
      <h1 id="loginTitle">Portal Kerja</h1>
      <p>Silakan masuk menggunakan akun yang telah didaftarkan.</p>
      <form id="loginForm">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" required placeholder="nama@email.com">
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" required placeholder="Masukkan password">
        </div>
        <button id="loginBtn" class="btn" type="submit">Masuk</button>
        <div id="loginError" class="error-box" hidden></div>
      </form>
    </div>
  </div>

  <div id="appView" class="layout" hidden>
    <aside class="sidebar">
      <div>
        <div id="sidebarTitle" class="brand">Portal Kerja</div>
        <nav class="menu">
          <button class="active" data-page="dashboard">Dashboard Utama</button>
          <button data-page="invoice">Pantauan Invoice 2027</button>
          <button id="menuUsers" data-page="users" hidden>Kelola Akses Tim</button>
        </nav>
      </div>
      <button id="logoutBtn" class="logout-btn">Keluar</button>
    </aside>

    <div class="main">
      <header class="topbar">
        <h2 id="pageTitle">Dashboard Utama</h2>
        <span id="userBadge" class="user-badge"></span>
      </header>
      <main id="pageContent" class="content"></main>
    </div>
  </div>

  <!-- Pustaka SheetJS untuk membaca & mengekspor file Excel (.xlsx) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

  <script type="module">
    import { APP_NAME, auth, db } from "./js/firebase-config.js";
    import {
      startInvoiceSync,
      stopInvoiceSync,
      getInvoiceSummary,
      renderInvoiceModule
    } from "./modules/pantauan-invoice.js";
    import {
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged
    } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
    import {
      doc,
      getDoc
    } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

    document.title = APP_NAME;
    document.getElementById("loginTitle").textContent = APP_NAME;
    document.getElementById("sidebarTitle").textContent = APP_NAME;

    const loadingView = document.getElementById("loadingView");
    const loginView = document.getElementById("loginView");
    const appView = document.getElementById("appView");
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const loginError = document.getElementById("loginError");
    const menuUsers = document.getElementById("menuUsers");
    const userBadge = document.getElementById("userBadge");
    const pageTitle = document.getElementById("pageTitle");
    const pageContent = document.getElementById("pageContent");

    let currentUserProfile = null;
    let activePage = "dashboard";

    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    function showError(message) {
      loginError.textContent = message;
      loginError.hidden = false;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.hidden = true;
      loginBtn.disabled = true;
      loginBtn.textContent = "Memeriksa...";

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
          showError("Email atau password salah. Silakan periksa kembali.");
        } else {
          showError("Gagal masuk: " + err.message);
        }
        loginBtn.disabled = false;
        loginBtn.textContent = "Masuk";
      }
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
      stopInvoiceSync();
      signOut(auth);
    });

    onAuthStateChanged(auth, async (user) => {
      loadingView.hidden = true;
      loginBtn.disabled = false;
      loginBtn.textContent = "Masuk";

      if (!user) {
        stopInvoiceSync();
        currentUserProfile = null;
        appView.hidden = true;
        loginView.hidden = false;
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          showError("Akun Anda belum didaftarkan perannya di database (koleksi users).");
          await signOut(auth);
          return;
        }

        currentUserProfile = { uid: user.uid, ...snap.data() };
        const roleLabel = (currentUserProfile.role || "viewer").toUpperCase();

        userBadge.textContent = `${currentUserProfile.nama} • ${roleLabel}`;
        menuUsers.hidden = currentUserProfile.role !== "admin";

        loginView.hidden = true;
        appView.hidden = false;

        // Mulai sinkronisasi data Modul 1 agar Dashboard langsung menampilkan angka terbaru
        startInvoiceSync(currentUserProfile, () => {
          if (activePage === "dashboard") renderDashboard();
        });

        openPage("dashboard");
      } catch (err) {
        showError("Gagal membaca data peran dari database: " + err.message);
        await signOut(auth);
      }
    });

    document.querySelectorAll(".menu button").forEach((btn) => {
      btn.addEventListener("click", () => openPage(btn.dataset.page));
    });

    function renderDashboard() {
      const s = getInvoiceSummary();
      const persen = s.total ? Math.round((s.sudah / s.total) * 100) : 0;

      pageContent.innerHTML = `
        <div class="card">
          <h3>Selamat datang, ${esc(currentUserProfile.nama)}!</h3>
          <p class="muted" style="margin:4px 0 0">Ringkasan pantauan pekerjaan administrasi tim secara langsung.</p>
        </div>

        <h3 style="margin:16px 0 10px;font-size:15px">Ringkasan Modul 1: Pantauan Invoice 2027</h3>
        <div class="pi-stats">
          <div class="pi-st"><b>${s.spk}</b><span>Total SPK</span></div>
          <div class="pi-st"><b>${s.kontrak}</b><span>Total Kontrak</span></div>
          <div class="pi-st"><b>${s.sudah}</b><span>Sudah Ada Invoice (${persen}%)</span></div>
          <div class="pi-st"><b>${s.belum}</b><span>Belum Ada Invoice</span></div>
        </div>

        <div class="card">
          <h3>Akses Cepat</h3>
          <div class="pi-btns">
            <button class="pi-btn pi-pr" id="goInvoice">Buka Pantauan Invoice 2027</button>
          </div>
        </div>
      `;

      document.getElementById("goInvoice").onclick = () => openPage("invoice");
    }

    function openPage(page) {
      activePage = page;
      document.querySelectorAll(".menu button").forEach((b) => {
        b.classList.toggle("active", b.dataset.page === page);
      });

      if (page === "dashboard") {
        pageTitle.textContent = "Dashboard Utama";
        renderDashboard();
      } else if (page === "invoice") {
        pageTitle.textContent = "Pantauan Invoice 2027";
        renderInvoiceModule(pageContent, currentUserProfile);
      } else if (page === "users") {
        pageTitle.textContent = "Kelola Akses Tim";
        pageContent.innerHTML = `
          <div class="card">
            <h3>Khusus Admin</h3>
            <p class="muted">Menu ini akan kita aktifkan di Tahap 4 agar Anda bisa menambahkan dan mengatur peran (Editor / Viewer) untuk 10+ rekan kerja.</p>
          </div>
        `;
      }
    }
  </script>
</body>
</html>
