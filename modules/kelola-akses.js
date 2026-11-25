import { auth, db } from "../js/firebase-config.js";
import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let unsubUsers = null;

const E = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));

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

// Koneksi Firebase sekunder agar pembuatan akun rekan tidak membuat Admin logout
function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === "Secondary");
  const secondaryApp = existing || initializeApp(auth.app.options, "Secondary");
  return getAuth(secondaryApp);
}

export function stopUsersSync() {
  if (unsubUsers) {
    unsubUsers();
    unsubUsers = null;
  }
}

export function renderUsersModule(container, currentProfile) {
  stopUsersSync();

  if (!currentProfile || currentProfile.role !== "admin") {
    container.innerHTML = `
      <div class="card">
        <h3>Akses Ditolak</h3>
        <p class="muted">Halaman ini hanya dapat dibuka oleh Admin.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <h3>Tambah Akun Rekan Kerja</h3>
      <p class="muted" style="margin:0 0 12px">Akun yang dibuat langsung aktif dan dapat dipakai masuk ke portal ini.</p>
      <form id="uaForm" class="ua-grid">
        <div>
          <label class="ua-label" for="uaNama">Nama Panggilan / Lengkap</label>
          <input id="uaNama" class="pi-input" required placeholder="Contoh: Budi">
        </div>
        <div>
          <label class="ua-label" for="uaEmail">Email Login</label>
          <input id="uaEmail" type="email" class="pi-input" required placeholder="budi@email.com">
        </div>
        <div>
          <label class="ua-label" for="uaPass">Password Awal (min. 6 karakter)</label>
          <input id="uaPass" type="text" class="pi-input" required minlength="6" placeholder="Contoh: Logistik2027">
        </div>
        <div>
          <label class="ua-label" for="uaRole">Peran Akses</label>
          <select id="uaRole" class="pi-input">
            <option value="editor">Editor (Bisa isi invoice & cetak)</option>
            <option value="viewer" selected>Viewer (Hanya lihat & cetak)</option>
            <option value="admin">Admin (Akses penuh + impor Excel)</option>
          </select>
        </div>
        <div style="grid-column:1 / -1;margin-top:4px">
          <button id="uaSubmit" type="submit" class="pi-btn pi-pr">Tambah Akun Tim</button>
        </div>
      </form>
      <div id="uaMsg" class="ua-msg" hidden></div>
    </div>

    <div class="card">
      <div class="pi-hd" style="align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Daftar Anggota Tim Terdaftar</h3>
        <span id="uaCount" class="pi-tg">Memuat...</span>
      </div>
      <div style="overflow-x:auto">
        <table class="ua-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Peran</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="uaBody">
            <tr><td colspan="4" class="muted">Memuat daftar pengguna...</td></tr>
          </tbody>
        </table>
      </div>
      <small class="muted" style="display:block;margin-top:10px">
        Catatan: Mengubah peran berlaku otomatis. Tombol <b>Reset Password</b> akan mengirim link ganti password ke email rekan. Tombol <b>Cabut Akses</b> langsung memblokir akun dari portal ini.
      </small>
    </div>
  `;

  const form = container.querySelector("#uaForm");
  const submitBtn = container.querySelector("#uaSubmit");
  const msgBox = container.querySelector("#uaMsg");
  const bodyEl = container.querySelector("#uaBody");
  const countEl = container.querySelector("#uaCount");

  function showMsg(text, isError = false) {
    msgBox.textContent = text;
    msgBox.className = "ua-msg" + (isError ? " ua-err" : " ua-ok");
    msgBox.hidden = false;
  }

  // 1. Proses tambah akun baru
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgBox.hidden = true;

    const nama = container.querySelector("#uaNama").value.trim();
    const email = container.querySelector("#uaEmail").value.trim().toLowerCase();
    const pass = container.querySelector("#uaPass").value;
    const role = container.querySelector("#uaRole").value;

    if (!nama || !email || pass.length < 6) {
      return showMsg("Pastikan nama, email, dan password minimal 6 karakter sudah terisi.", true);
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Mendaftarkan akun...";

    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      const newUid = cred.user.uid;

      await setDoc(doc(db, "users", newUid), {
        nama,
        email,
        role
      });

      await signOut(secondaryAuth);

      form.reset();
      showMsg(
        `Akun "${nama}" (${email}) berhasil dibuat dengan peran ${role.toUpperCase()}. Bagikan link portal, email, dan password awalnya ke yang bersangkutan.`
      );
      toast(`Akun ${nama} berhasil ditambahkan.`);
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        showMsg("Email ini sudah terdaftar di Firebase Authentication. Gunakan email lain atau cek menu Authentication di Firebase Console.", true);
      } else if (err.code === "auth/invalid-email") {
        showMsg("Format alamat email tidak valid.", true);
      } else if (err.code === "auth/weak-password") {
        showMsg("Password terlalu lemah. Gunakan minimal 6 karakter.", true);
      } else if (err.code === "permission-denied") {
        showMsg("Izin database ditolak (permission-denied). Periksa kembali Firestore Rules untuk koleksi users.", true);
      } else {
        showMsg("Gagal membuat akun: " + err.message, true);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Tambah Akun Tim";
    }
  });

  // 2. Pantau daftar pengguna secara real-time
  unsubUsers = onSnapshot(
    collection(db, "users"),
    (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ uid: d.id, ...d.data() }));
      list.sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id"));

      countEl.textContent = `${list.length} akun`;

      if (!list.length) {
        bodyEl.innerHTML = `<tr><td colspan="4" class="muted">Belum ada akun terdaftar.</td></tr>`;
        return;
      }

      bodyEl.innerHTML = list
        .map((u) => {
          const isMe = u.uid === currentProfile.uid;
          const r = u.role || "viewer";
          return `
            <tr>
              <td><b>${E(u.nama || "-")}</b> ${isMe ? '<span class="pi-tg">Anda</span>' : ""}</td>
              <td>${E(u.email || "-")}</td>
              <td>
                <select class="ua-select" data-uid="${E(u.uid)}" ${isMe ? "disabled title='Tidak dapat mengubah peran akun sendiri'" : ""}>
                  <option value="admin" ${r === "admin" ? "selected" : ""}>Admin</option>
                  <option value="editor" ${r === "editor" ? "selected" : ""}>Editor</option>
                  <option value="viewer" ${r === "viewer" ? "selected" : ""}>Viewer</option>
                </select>
              </td>
              <td>
                <div class="pi-btns">
                  <button class="pi-btn ua-sm" data-reset="${E(u.email || "")}">Reset Password</button>
                  ${
                    isMe
                      ? ""
                      : `<button class="pi-btn ua-sm ua-danger" data-del="${E(u.uid)}" data-name="${E(u.nama || u.email)}">Cabut Akses</button>`
                  }
                </div>
              </td>
            </tr>
          `;
        })
        .join("");
    },
    (err) => {
      bodyEl.innerHTML = `<tr><td colspan="4" class="muted">Gagal memuat daftar tim: ${E(err.message)}</td></tr>`;
    }
  );

  // 3. Ubah peran langsung dari dropdown tabel
  bodyEl.addEventListener("change", async (e) => {
    const sel = e.target.closest(".ua-select");
    if (!sel) return;
    const uid = sel.dataset.uid;
    const newRole = sel.value;
    sel.disabled = true;
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      toast("Peran berhasil diperbarui menjadi " + newRole.toUpperCase() + ".");
    } catch (err) {
      toast("Gagal mengubah peran: " + err.message);
    } finally {
      sel.disabled = false;
    }
  });

  // 4. Tombol Reset Password & Cabut Akses
  bodyEl.addEventListener("click", async (e) => {
    const resetBtn = e.target.closest("[data-reset]");
    if (resetBtn) {
      const email = resetBtn.dataset.reset;
      if (!email) return;
      if (!confirm(`Kirim email reset password ke ${email}?`)) return;
      resetBtn.disabled = true;
      try {
        await sendPasswordResetEmail(auth, email);
        toast(`Link reset password telah dikirim ke ${email}.`);
      } catch (err) {
        toast("Gagal mengirim email reset password: " + err.message);
      } finally {
        resetBtn.disabled = false;
      }
      return;
    }

    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      const uid = delBtn.dataset.del;
      const name = delBtn.dataset.name;
      if (!confirm(`Cabut akses portal untuk "${name}"? Rekan tersebut tidak akan bisa masuk lagi ke portal ini.`)) return;
      delBtn.disabled = true;
      try {
        await deleteDoc(doc(db, "users", uid));
        toast(`Akses untuk ${name} telah dicabut.`);
      } catch (err) {
        toast("Gagal mencabut akses: " + err.message);
        delBtn.disabled = false;
      }
    }
  });
}
