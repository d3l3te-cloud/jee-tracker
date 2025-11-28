// app.js – Praxis (global, Firebase-based)
// Features:
// - Firestore: batches → subjects → chapters → lectures/resources
// - Admin CRUD (batches, subjects, chapters, lectures, PDFs, announcements)
// - Auth: Google + Email/Password (users stored in Firestore)
// - Admin based on Firestore users/{uid}.role === "admin"
// - Progress stored locally (per-device) for now

import {
  auth,
  provider,
  db,
  // storage (future: if you switch to Storage uploads)
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
} from "./firebase-config.js";

// ========== STATE ==========
let currentUser = null;
let isAdmin = false;

let courseData = {
  batches: [], // [{id, name, classLevel, subjects:[{id, name, chapters:[...]}]}]
};

let announcements = [];
let userProgress = loadFromStorage("praxis-progress", { completedLectures: {} });

let currentClassLevel = null;
let currentBatchId = null;
let currentSubjectId = null;
let currentChapterId = null;
let currentPlayingLectureKey = null;

// ========== UTIL ==========
const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function loadFromStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function lectureKey(batchId, subjectId, chapterId, lectureId) {
  return `${batchId}|${subjectId}|${chapterId}|${lectureId}`;
}

function getBatchById(id) {
  return courseData.batches.find((b) => b.id === id) || null;
}
function getBatchesByClass(level) {
  return courseData.batches.filter((b) => b.classLevel === level);
}
function getSubject(batch, subjectId) {
  if (!batch) return null;
  if (subjectId) {
    const s = batch.subjects.find((x) => x.id === subjectId);
    if (s) return s;
  }
  return batch.subjects[0] || null;
}
function getChapter(batchId, subjectId, chapterId) {
  const batch = getBatchById(batchId);
  const subj = getSubject(batch, subjectId);
  if (!subj) return null;
  return subj.chapters.find((c) => c.id === chapterId) || null;
}

// ========== THEME ==========
const themeToggle = qs("#themeToggle");
const root = document.documentElement;
(function initTheme() {
  const saved = localStorage.getItem("praxis-theme") || "dark";
  root.setAttribute("data-theme", saved);
  themeToggle.textContent = saved === "dark" ? "🌙" : "☀️";
})();
themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("praxis-theme", next);
  themeToggle.textContent = next === "dark" ? "🌙" : "☀️";
});

// ========== NAVIGATION ==========
const views = {
  dashboardView: qs("#dashboardView"),
  courseView: qs("#courseView"),
  analysisView: qs("#analysisView"),
  adminView: qs("#adminView"),
};

qsa(".topnav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const viewId = btn.dataset.view;
    qsa(".topnav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(views).forEach(([id, el]) =>
      el.classList.toggle("active", id === viewId)
    );
  });
});

function switchView(viewId) {
  qsa(".topnav-item").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.view === viewId)
  );
  Object.entries(views).forEach(([id, el]) =>
    el.classList.toggle("active", id === viewId)
  );
}

// Mobile nav
const navToggle = qs("#navToggle");
const topbarEl = qs(".topbar");
if (navToggle && topbarEl) {
  navToggle.addEventListener("click", () => {
    topbarEl.classList.toggle("nav-open");
  });
}

// ========== AUTH ==========

const authArea = qs("#authArea");
const userStatusMsg = qs("#userStatusMsg");
const adminStatus = qs("#adminStatus");

// Auth modal DOM
const authModal = qs("#authModal");
const closeAuthModalBtn = qs("#closeAuthModal");
const authEmailInput = qs("#authEmail");
const authPasswordInput = qs("#authPassword");
const authErrorEl = qs("#authError");
const emailLoginBtn = qs("#emailLoginBtn");
const emailSignupBtn = qs("#emailSignupBtn");

function openAuthModal() {
  authErrorEl.textContent = "";
  authEmailInput.value = "";
  authPasswordInput.value = "";
  authModal.classList.remove("hidden");
}
function closeAuthModal() {
  authModal.classList.add("hidden");
}
closeAuthModalBtn.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) closeAuthModal();
});

// Ensure user doc exists
async function ensureUserDoc(user) {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { email: user.email || null, role: "user" }, { merge: true });
  }
}

// Load user role
async function refreshRole() {
  if (!currentUser) {
    isAdmin = false;
    if (adminStatus) adminStatus.textContent = "Not signed in";
    return;
  }
  try {
    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);
    isAdmin = snap.exists() && snap.data().role === "admin";
    if (adminStatus) {
      adminStatus.textContent = isAdmin
        ? "Admin access granted (global changes enabled)."
        : "Signed in but not admin. You can view, not edit.";
    }
  } catch (e) {
    console.error("Error loading role:", e);
    isAdmin = false;
  }
}

// Render auth area in header
function renderAuthArea() {
  authArea.innerHTML = "";
  if (!currentUser) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "6px";

    const googleBtn = document.createElement("button");
    googleBtn.className = "btn-primary small";
    googleBtn.textContent = "Google";
    googleBtn.addEventListener("click", handleGoogleLogin);

    const emailBtn = document.createElement("button");
    emailBtn.className = "btn-secondary small";
    emailBtn.textContent = "Email";
    emailBtn.addEventListener("click", openAuthModal);

    wrap.append(googleBtn, emailBtn);
    authArea.appendChild(wrap);

    if (userStatusMsg) {
      userStatusMsg.textContent =
        "Not signed in. You can browse, but admin changes & synced progress need login.";
    }
    return;
  }

  const btn = document.createElement("button");
  btn.className = "btn-secondary small";
  btn.textContent = `${currentUser.email || "User"} – Sign out`;
  btn.addEventListener("click", () => signOut(auth));
  authArea.appendChild(btn);

  if (userStatusMsg) {
    userStatusMsg.textContent = isAdmin
      ? `Signed in as admin: ${currentUser.email}`
      : `Signed in as ${currentUser.email || "user"}`;
  }
}

// Google login
async function handleGoogleLogin() {
  try {
    const res = await signInWithPopup(auth, provider);
    currentUser = res.user;
    await ensureUserDoc(currentUser);
    await refreshRole();
    renderAuthArea();
  } catch (e) {
    console.error(e);
    alert("Google sign-in failed: " + e.message);
  }
}

// Email login
emailLoginBtn.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const pass = authPasswordInput.value.trim();
  if (!email || !pass) {
    authErrorEl.textContent = "Enter email and password.";
    return;
  }
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    currentUser = res.user;
    await ensureUserDoc(currentUser);
    await refreshRole();
    renderAuthArea();
    closeAuthModal();
  } catch (e) {
    console.error(e);
    authErrorEl.textContent = e.message;
  }
});

// Email signup
emailSignupBtn.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  const pass = authPasswordInput.value.trim();
  if (!email || !pass) {
    authErrorEl.textContent = "Enter email and password.";
    return;
  }
  if (pass.length < 6) {
    authErrorEl.textContent = "Password should be at least 6 characters.";
    return;
  }
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    currentUser = res.user;
    await ensureUserDoc(currentUser);
    await refreshRole();
    renderAuthArea();
    closeAuthModal();
  } catch (e) {
    console.error(e);
    authErrorEl.textContent = e.message;
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (currentUser) {
    await ensureUserDoc(currentUser);
  }
  await refreshRole();
  renderAuthArea();
});

// ========== FIRESTORE LOADING (COURSE DATA) ==========

async function loadCourseFromFirestore() {
  courseData.batches = [];

  const batchesSnap = await getDocs(collection(db, "batches"));
  for (const batchDoc of batchesSnap.docs) {
    const batchId = batchDoc.id;
    const batchData = batchDoc.data();
    const batchObj = {
      id: batchId,
      name: batchData.name,
      classLevel: batchData.classLevel,
      subjects: [],
    };

    const subjectsSnap = await getDocs(
      collection(db, "batches", batchId, "subjects")
    );
    for (const subjDoc of subjectsSnap.docs) {
      const subjectId = subjDoc.id;
      const subjectData = subjDoc.data();
      const subjObj = {
        id: subjectId,
        name: subjectData.name,
        chapters: [],
      };

      const chaptersSnap = await getDocs(
        collection(db, "batches", batchId, "subjects", subjectId, "chapters")
      );
      for (const chDoc of chaptersSnap.docs) {
        const chapterId = chDoc.id;
        const chData = chDoc.data();
        const chapterObj = {
          id: chapterId,
          name: chData.name,
          description: chData.description || "",
          lectures: [],
          notes: [],
          dpp: [],
          solutions: [],
          tests: [],
        };

        const lecturesSnap = await getDocs(
          collection(
            db,
            "batches",
            batchId,
            "subjects",
            subjectId,
            "chapters",
            chapterId,
            "lectures"
          )
        );
        lecturesSnap.forEach((lecDoc) => {
          const data = lecDoc.data();
          chapterObj.lectures.push({
            id: lecDoc.id,
            title: data.title,
            youtubeId: data.youtubeId,
          });
        });

        const resSnap = await getDocs(
          collection(
            db,
            "batches",
            batchId,
            "subjects",
            subjectId,
            "chapters",
            chapterId,
            "resources"
          )
        );
        resSnap.forEach((resDoc) => {
          const r = resDoc.data();
          const resObj = {
            id: resDoc.id,
            title: r.title,
            url: r.url,
            type: r.type,
          };
          if (r.type === "notes") chapterObj.notes.push(resObj);
          else if (r.type === "dpp") chapterObj.dpp.push(resObj);
          else if (r.type === "solutions") chapterObj.solutions.push(resObj);
          else if (r.type === "tests") chapterObj.tests.push(resObj);
        });

        subjObj.chapters.push(chapterObj);
      }

      batchObj.subjects.push(subjObj);
    }

    courseData.batches.push(batchObj);
  }
}

// ========== ANNOUNCEMENTS ==========
const annBtn = qs("#annBtn");
const annModal = qs("#annModal");
const closeAnnModalBtn = qs("#closeAnnModal");
const annListEl = qs("#annList");

annBtn.addEventListener("click", () => {
  renderAnnList();
  annModal.classList.remove("hidden");
});
closeAnnModalBtn.addEventListener("click", () => {
  annModal.classList.add("hidden");
});
annModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    annModal.classList.add("hidden");
  }
});

function renderAnnList() {
  annListEl.innerHTML = "";
  if (!announcements.length) {
    annListEl.innerHTML = "<li class='muted small'>No announcements yet.</li>";
    return;
  }
  announcements
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((ann) => {
      const li = document.createElement("li");
      li.className = "list-item-row";
      const main = document.createElement("div");
      main.className = "list-main";
      main.innerHTML = `
        <div class="list-title">${ann.title}</div>
        <div class="list-meta">${ann.body}</div>
      `;
      li.appendChild(main);
      annListEl.appendChild(li);
    });
}

// Realtime announcements
onSnapshot(collection(db, "announcements"), (snap) => {
  announcements = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    announcements.push({
      id: docSnap.id,
      title: d.title,
      body: d.body,
      createdAt: d.createdAt || 0,
    });
  });
});

// ========== DASHBOARD ==========
const overallProgressEl = qs("#overallProgress");
const recentActivityEl = qs("#recentActivity");
const currentClassLabelEl = qs("#currentClassLabel");

qsa(".pathway-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    const level = btn.dataset.class;
    openClass(level);
    switchView("courseView");
  });
});

qs("#startStudy").addEventListener("click", () => {
  openClass("10");
  switchView("courseView");
});

// ========== COURSE VIEW ==========
const batchSelect = qs("#batchSelect");
const subjectSelect = qs("#subjectSelect");
const chapterListEl = qs("#chapterList");
const chapterTitleEl = qs("#chapterTitle");
const chapterDescEl = qs("#chapterDesc");
const chapterProgressEl = qs("#chapterProgress");

const lectureListEl = qs("#lectureList");
const notesListEl = qs("#notesList");
const dppListEl = qs("#dppList");
const solutionsListEl = qs("#solutionsList");
const testsListEl = qs("#testsList");

// Tabs in course view
const tabButtons = qsa(".tab");
const tabPanels = qsa(".tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.id === tabId)
    );
  });
});

// Video modal
const videoModal = qs("#videoModal");
const videoFrame = qs("#videoFrame");
const videoTitleEl = qs("#videoTitle");
const closeVideoBtn = qs("#closeVideo");
const markCompleteBtn = qs("#markCompleteBtn");
const videoStatusEl = qs("#videoStatus");

closeVideoBtn.addEventListener("click", closeVideo);
videoModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) closeVideo();
});

function openVideoModal() {
  videoModal.classList.remove("hidden");
}
function closeVideo() {
  videoModal.classList.add("hidden");
  videoFrame.src = "";
  currentPlayingLectureKey = null;
}

function openClass(level) {
  currentClassLevel = level;
  currentClassLabelEl.textContent =
    level === "10" ? "Class 10 (Secondary)" : "Class 12 (Senior Secondary)";

  const batches = getBatchesByClass(level);
  batchSelect.innerHTML = "";
  if (!batches.length) {
    batchSelect.innerHTML = `<option>No batches</option>`;
    subjectSelect.innerHTML = "";
    chapterListEl.innerHTML =
      "<li class='muted small'>No batches created for this class yet.</li>";
    return;
  }
  batches.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    batchSelect.appendChild(opt);
  });
  currentBatchId = batches[0].id;

  populateSubjectSelect();
  renderChapterList();
}

function populateSubjectSelect() {
  const batch = getBatchById(currentBatchId);
  subjectSelect.innerHTML = "";
  if (!batch || !batch.subjects.length) {
    subjectSelect.innerHTML = `<option>No subjects</option>`;
    chapterListEl.innerHTML =
      "<li class='muted small'>No subjects created for this batch yet.</li>";
    return;
  }
  batch.subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    subjectSelect.appendChild(opt);
  });
  currentSubjectId = batch.subjects[0].id;
}

batchSelect.addEventListener("change", () => {
  currentBatchId = batchSelect.value;
  populateSubjectSelect();
  renderChapterList();
});

subjectSelect.addEventListener("change", () => {
  currentSubjectId = subjectSelect.value;
  renderChapterList();
});

function renderChapterList() {
  chapterListEl.innerHTML = "";
  const batch = getBatchById(currentBatchId);
  const subj = getSubject(batch, currentSubjectId);
  if (!subj) {
    chapterListEl.innerHTML =
      "<li class='muted small'>No subject selected.</li>";
    return;
  }

  subj.chapters.forEach((ch) => {
    const li = document.createElement("li");
    li.className = "chapter-item";
    li.dataset.chapterId = ch.id;
    li.textContent = ch.name;
    if (ch.id === currentChapterId) li.classList.add("active");
    li.addEventListener("click", () =>
      onChapterSelected(batch.id, subj.id, ch.id)
    );
    chapterListEl.appendChild(li);
  });

  if (!subj.chapters.length) {
    chapterListEl.innerHTML =
      "<li class='muted small'>No chapters. Use Admin to add.</li>";
  }
}

function onChapterSelected(batchId, subjectId, chapterId) {
  currentBatchId = batchId;
  currentSubjectId = subjectId;
  currentChapterId = chapterId;

  qsa(".chapter-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.chapterId === chapterId);
  });

  const ch = getChapter(batchId, subjectId, chapterId);
  if (!ch) return;
  chapterTitleEl.textContent = ch.name;
  chapterDescEl.textContent = ch.description || "";

  renderChapterContent(ch);
  updateChapterProgress();
}

function renderChapterContent(ch) {
  // Lectures
  lectureListEl.innerHTML = "";
  ch.lectures.forEach((lec) => {
    const li = document.createElement("li");
    li.className = "list-item-row";
    const main = document.createElement("div");
    main.className = "list-main";
    main.innerHTML = `<div class="list-title">${lec.title}</div>
      <div class="list-meta">YouTube Lecture</div>`;
    const status = document.createElement("div");
    status.className = "list-status";

    const key = lectureKey(currentBatchId, currentSubjectId, ch.id, lec.id);
    if (userProgress.completedLectures[key]) {
      status.textContent = "Completed ✓";
    }

    li.appendChild(main);
    li.appendChild(status);

    li.addEventListener("click", () =>
      playLecture(currentBatchId, currentSubjectId, ch.id, lec)
    );

    lectureListEl.appendChild(li);
  });

  if (!ch.lectures.length) {
    lectureListEl.innerHTML =
      "<li class='muted small'>No lectures yet for this chapter.</li>";
  }

  // Resources
  fillResourceList(notesListEl, ch.notes, "Notes PDF");
  fillResourceList(dppListEl, ch.dpp, "DPP PDF");
  fillResourceList(solutionsListEl, ch.solutions, "Solution PDF");
  fillResourceList(testsListEl, ch.tests, "Test PDF");
}

function fillResourceList(container, arr, label) {
  container.innerHTML = "";
  if (!arr || !arr.length) {
    container.innerHTML = "<li class='muted small'>None</li>";
    return;
  }
  arr.forEach((res) => {
    const li = document.createElement("li");
    li.className = "list-item-row";
    const main = document.createElement("div");
    main.className = "list-main";
    main.innerHTML = `<div class="list-title">${res.title}</div>
      <div class="list-meta">${label}</div>`;

    const status = document.createElement("div");
    status.className = "list-status";
    status.textContent = "Open ↗";

    li.appendChild(main);
    li.appendChild(status);

    li.addEventListener("click", () => {
      if (res.url) window.open(res.url, "_blank");
    });

    container.appendChild(li);
  });
}

function playLecture(batchId, subjectId, chapterId, lecture) {
  const id = lecture.youtubeId || lecture.id;
  const url = buildYoutubeEmbedUrl(id);
  videoTitleEl.textContent = lecture.title;
  videoFrame.src = url;
  currentPlayingLectureKey = lectureKey(batchId, subjectId, chapterId, lecture.id);
  updateVideoStatus();
  openVideoModal();

  recentActivityEl.textContent = `Watching: ${lecture.title} (${chapterTitleEl.textContent})`;
}

function buildYoutubeEmbedUrl(input) {
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
  } catch (e) {
    // not URL, maybe direct ID
  }
  return `https://www.youtube.com/embed/${input}`;
}

markCompleteBtn.addEventListener("click", () => {
  if (!currentPlayingLectureKey) return;
  userProgress.completedLectures[currentPlayingLectureKey] = true;
  saveToStorage("praxis-progress", userProgress);
  updateVideoStatus();
  updateChapterProgress();
  updateOverallProgress();
});

function updateVideoStatus() {
  if (!currentPlayingLectureKey) {
    videoStatusEl.textContent = "";
    return;
  }
  const done = !!userProgress.completedLectures[currentPlayingLectureKey];
  videoStatusEl.textContent = done ? "Marked as completed ✓" : "";
}

function updateChapterProgress() {
  if (!currentChapterId) {
    chapterProgressEl.textContent = "0% complete";
    return;
  }
  const ch = getChapter(currentBatchId, currentSubjectId, currentChapterId);
  if (!ch || !ch.lectures.length) {
    chapterProgressEl.textContent = "No lectures";
    return;
  }
  let completed = 0;
  ch.lectures.forEach((lec) => {
    const key = lectureKey(
      currentBatchId,
      currentSubjectId,
      currentChapterId,
      lec.id
    );
    if (userProgress.completedLectures[key]) completed++;
  });
  const pct = Math.round((completed / ch.lectures.length) * 100);
  chapterProgressEl.textContent = `${pct}% complete`;
}

// ========== ANALYSIS ==========
const analysisContentEl = qs("#analysisContent");

function computeStats() {
  let totalLect = 0;
  let doneLect = 0;

  courseData.batches.forEach((b) => {
    b.subjects.forEach((s) => {
      s.chapters.forEach((c) => {
        c.lectures.forEach((lec) => {
          totalLect++;
          const key = lectureKey(b.id, s.id, c.id, lec.id);
          if (userProgress.completedLectures[key]) doneLect++;
        });
      });
    });
  });

  return { totalLect, doneLect };
}

function updateOverallProgress() {
  const stats = computeStats();
  if (!stats.totalLect) {
    overallProgressEl.textContent = "0%";
    analysisContentEl.textContent =
      "No lectures configured yet. Use Admin to add.";
    return;
  }
  const pct = Math.round((stats.doneLect / stats.totalLect) * 100);
  overallProgressEl.textContent = `${pct}%`;
  renderAnalysisDetail();
}

function renderAnalysisDetail() {
  const statsPerChapter = [];
  courseData.batches.forEach((b) => {
    b.subjects.forEach((s) => {
      s.chapters.forEach((c) => {
        let total = c.lectures.length;
        let done = 0;
        c.lectures.forEach((lec) => {
          const key = lectureKey(b.id, s.id, c.id, lec.id);
          if (userProgress.completedLectures[key]) done++;
        });
        statsPerChapter.push({
          name: `${b.name} / ${s.name} / ${c.name}`,
          total,
          done,
        });
      });
    });
  });

  if (!statsPerChapter.length) {
    analysisContentEl.textContent =
      "No chapters/lectures configured. Use Admin to add.";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "grid";
  statsPerChapter.forEach((row) => {
    const card = document.createElement("div");
    card.className = "card";
    const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
    card.innerHTML = `
      <div class="list-title">${row.name}</div>
      <div class="list-meta">${row.done}/${row.total} lectures • ${pct}%</div>
      <div style="height:6px;border-radius:999px;background:var(--bg-soft);margin-top:6px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent);"></div>
      </div>
    `;
    wrapper.appendChild(card);
  });

  analysisContentEl.innerHTML = "";
  analysisContentEl.appendChild(wrapper);
}

// ========== ADMIN PANEL ==========

function requireAdmin() {
  if (!currentUser || !isAdmin) {
    alert("Only admins can perform this action.");
    return false;
  }
  return true;
}

// DOM refs for admin
const adminBatchClass = qs("#adminBatchClass");
const adminNewBatchName = qs("#adminNewBatchName");
const adminAddBatchBtn = qs("#adminAddBatch");
const adminBatchSelect = qs("#adminBatchSelect");
const adminDeleteBatchBtn = qs("#adminDeleteBatch");
const adminBatchMsg = qs("#adminBatchMsg");

const adminSubjectBatch = qs("#adminSubjectBatch");
const adminNewSubjectName = qs("#adminNewSubjectName");
const adminAddSubjectBtn = qs("#adminAddSubject");
const adminSubjectSelect = qs("#adminSubjectSelect");
const adminDeleteSubjectBtn = qs("#adminDeleteSubject");
const adminSubjectMsg = qs("#adminSubjectMsg");

const adminChapterBatch = qs("#adminChapterBatch");
const adminChapterSubject = qs("#adminChapterSubject");
const adminNewChapterName = qs("#adminNewChapterName");
const adminNewChapterDesc = qs("#adminNewChapterDesc");
const adminAddChapterBtn = qs("#adminAddChapter");
const adminChapterSelect = qs("#adminChapterSelect");
const adminDeleteChapterBtn = qs("#adminDeleteChapter");
const adminChapterMsg = qs("#adminChapterMsg");

const lecBatch = qs("#lecBatch");
const lecSubject = qs("#lecSubject");
const lecChapter = qs("#lecChapter");
const lecTitle = qs("#lecTitle");
const lecYT = qs("#lecYT");
const addLectureBtn = qs("#addLectureBtn");
const lecSelect = qs("#lecSelect");
const deleteLectureBtn = qs("#deleteLectureBtn");
const adminLectureMsg = qs("#adminLectureMsg");

const resBatch = qs("#resBatch");
const resSubject = qs("#resSubject");
const resChapter = qs("#resChapter");
const resType = qs("#resType");
const resTitle = qs("#resTitle");
const resUrl = qs("#resUrl");
const addResBtn = qs("#addResBtn");
const resSelect = qs("#resSelect");
const delResBtn = qs("#delResBtn");
const adminResMsg = qs("#adminResMsg");

// Announcement admin
const annTitleInput = qs("#annTitle");
const annBodyInput = qs("#annBody");
const createAnnBtn = qs("#createAnnBtn");
const adminAnnSelect = qs("#adminAnnSelect");
const deleteAnnBtn = qs("#deleteAnnBtn");
const adminAnnMsg = qs("#adminAnnMsg");

// Firestore path helpers
function batchDoc(batchId) {
  return doc(db, "batches", batchId);
}
function subjectDoc(batchId, subjectId) {
  return doc(db, "batches", batchId, "subjects", subjectId);
}
function chapterDoc(batchId, subjectId, chapterId) {
  return doc(db, "batches", batchId, "subjects", subjectId, "chapters", chapterId);
}
function lectureDoc(batchId, subjectId, chapterId, lectureId) {
  return doc(
    db,
    "batches",
    batchId,
    "subjects",
    subjectId,
    "chapters",
    chapterId,
    "lectures",
    lectureId
  );
}
function resourceDoc(batchId, subjectId, chapterId, resourceId) {
  return doc(
    db,
    "batches",
    batchId,
    "subjects",
    subjectId,
    "chapters",
    chapterId,
    "resources",
    resourceId
  );
}

// Populate admin selectors from courseData
function populateAdminSelectors() {
  [adminBatchSelect, adminSubjectBatch, adminChapterBatch, lecBatch, resBatch].forEach(
    (sel) => (sel.innerHTML = "")
  );

  courseData.batches.forEach((b) => {
    [adminBatchSelect, adminSubjectBatch, adminChapterBatch, lecBatch, resBatch].forEach(
      (sel) => {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = `${b.name} (${b.classLevel})`;
        sel.appendChild(opt);
      }
    );
  });

  populateAdminSubjectSelects();
  populateAdminChapterSelects();
  populateLectureDropdowns();
  populateResourceDropdowns();
}

// Subjects selects (admin + lecture/res)
function populateAdminSubjectSelects() {
  adminSubjectSelect.innerHTML = "";
  adminChapterSubject.innerHTML = "";
  lecSubject.innerHTML = "";
  resSubject.innerHTML = "";

  const batchId =
    adminSubjectBatch.value ||
    (courseData.batches[0] && courseData.batches[0].id);
  if (!batchId) return;
  const batch = getBatchById(batchId);
  if (!batch) return;

  batch.subjects.forEach((s) => {
    [adminSubjectSelect, adminChapterSubject, lecSubject, resSubject].forEach(
      (sel) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      }
    );
  });
}

adminSubjectBatch.addEventListener("change", () => {
  populateAdminSubjectSelects();
  populateAdminChapterSelects();
  populateLectureDropdowns();
  populateResourceDropdowns();
});
adminChapterBatch.addEventListener("change", () => {
  populateAdminSubjectSelects();
  populateAdminChapterSelects();
  populateLectureDropdowns();
  populateResourceDropdowns();
});
lecBatch.addEventListener("change", () => {
  populateAdminSubjectSelects();
  populateAdminChapterSelects();
  populateLectureDropdowns();
});
resBatch.addEventListener("change", () => {
  populateAdminSubjectSelects();
  populateAdminChapterSelects();
  populateResourceDropdowns();
});

function populateAdminChapterSelects() {
  adminChapterSelect.innerHTML = "";
  lecChapter.innerHTML = "";
  resChapter.innerHTML = "";

  const batchId = adminChapterBatch.value;
  const subjectId = adminChapterSubject.value;
  const batch = getBatchById(batchId);
  const subj = getSubject(batch, subjectId);

  if (!subj) return;
  subj.chapters.forEach((c) => {
    [adminChapterSelect, lecChapter, resChapter].forEach((sel) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  });
}

adminChapterSubject.addEventListener("change", () => {
  populateAdminChapterSelects();
  populateLectureDropdowns();
  populateResourceDropdowns();
});
lecSubject.addEventListener("change", () => {
  populateAdminChapterSelects();
  populateLectureDropdowns();
});
resSubject.addEventListener("change", () => {
  populateAdminChapterSelects();
  populateResourceDropdowns();
});

function populateLectureDropdowns() {
  lecSelect.innerHTML = "";
  const batchId = lecBatch.value;
  const subjectId = lecSubject.value;
  const chapterId = lecChapter.value;
  if (!batchId || !subjectId || !chapterId) return;
  const ch = getChapter(batchId, subjectId, chapterId);
  if (!ch) return;
  ch.lectures.forEach((lec) => {
    const opt = document.createElement("option");
    opt.value = lec.id;
    opt.textContent = lec.title;
    lecSelect.appendChild(opt);
  });
}

lecChapter.addEventListener("change", populateLectureDropdowns);

function populateResourceDropdowns() {
  resSelect.innerHTML = "";
  const batchId = resBatch.value;
  const subjectId = resSubject.value;
  const chapterId = resChapter.value;
  const type = resType.value;
  if (!batchId || !subjectId || !chapterId) return;
  const ch = getChapter(batchId, subjectId, chapterId);
  if (!ch) return;
  const arr =
    type === "notes"
      ? ch.notes
      : type === "dpp"
      ? ch.dpp
      : type === "solutions"
      ? ch.solutions
      : ch.tests;
  arr.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.title;
    resSelect.appendChild(opt);
  });
}
resType.addEventListener("change", populateResourceDropdowns);
resChapter.addEventListener("change", populateResourceDropdowns);

// Batch actions
adminAddBatchBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const level = adminBatchClass.value;
  const name = adminNewBatchName.value.trim();
  if (!name) {
    adminBatchMsg.textContent = "Enter batch name.";
    return;
  }
  const id = `${level}-${Date.now()}`;
  try {
    await setDoc(batchDoc(id), { name, classLevel: level });
    adminNewBatchName.value = "";
    adminBatchMsg.textContent = "Batch created (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (currentClassLevel === level) {
      openClass(level);
    }
  } catch (e) {
    adminBatchMsg.textContent = "Error: " + e.message;
  }
});

adminDeleteBatchBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const id = adminBatchSelect.value;
  if (!id) {
    adminBatchMsg.textContent = "Select batch.";
    return;
  }
  try {
    await deleteDoc(batchDoc(id));
    adminBatchMsg.textContent =
      "Batch deleted. (Note: subcollections must be cleaned manually for full cleanup.)";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    renderChapterList();
    updateOverallProgress();
  } catch (e) {
    adminBatchMsg.textContent = "Error: " + e.message;
  }
});

// Subject actions
adminAddSubjectBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = adminSubjectBatch.value;
  const name = adminNewSubjectName.value.trim();
  if (!batchId || !name) {
    adminSubjectMsg.textContent = "Select batch & enter subject name.";
    return;
  }
  const id = name.toLowerCase().replace(/\s+/g, "") + Date.now();
  try {
    await setDoc(subjectDoc(batchId, id), { name });
    adminNewSubjectName.value = "";
    adminSubjectMsg.textContent = "Subject created (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (currentBatchId === batchId) {
      populateSubjectSelect();
      renderChapterList();
    }
  } catch (e) {
    adminSubjectMsg.textContent = "Error: " + e.message;
  }
});

adminDeleteSubjectBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = adminSubjectBatch.value;
  const subjId = adminSubjectSelect.value;
  if (!batchId || !subjId) {
    adminSubjectMsg.textContent = "Select subject.";
    return;
  }
  try {
    await deleteDoc(subjectDoc(batchId, subjId));
    adminSubjectMsg.textContent =
      "Subject deleted. (Note: subcollections not auto-deleted.)";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (currentBatchId === batchId) {
      populateSubjectSelect();
      renderChapterList();
    }
    updateOverallProgress();
  } catch (e) {
    adminSubjectMsg.textContent = "Error: " + e.message;
  }
});

// Chapter actions
adminAddChapterBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = adminChapterBatch.value;
  const subjId = adminChapterSubject.value;
  const name = adminNewChapterName.value.trim();
  const desc = adminNewChapterDesc.value.trim();
  if (!batchId || !subjId || !name) {
    adminChapterMsg.textContent = "Select batch/subject & enter name.";
    return;
  }
  const id = name.toLowerCase().replace(/\s+/g, "-") + Date.now();
  try {
    await setDoc(chapterDoc(batchId, subjId, id), {
      name,
      description: desc,
    });
    adminNewChapterName.value = "";
    adminNewChapterDesc.value = "";
    adminChapterMsg.textContent = "Chapter created (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (currentBatchId === batchId && currentSubjectId === subjId) {
      renderChapterList();
    }
    updateOverallProgress();
  } catch (e) {
    adminChapterMsg.textContent = "Error: " + e.message;
  }
});

adminDeleteChapterBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = adminChapterBatch.value;
  const subjId = adminChapterSubject.value;
  const chapterId = adminChapterSelect.value;
  if (!batchId || !subjId || !chapterId) {
    adminChapterMsg.textContent = "Select chapter.";
    return;
  }
  try {
    await deleteDoc(chapterDoc(batchId, subjId, chapterId));
    adminChapterMsg.textContent =
      "Chapter deleted. (Note: subcollections not auto-deleted.)";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (currentBatchId === batchId && currentSubjectId === subjId) {
      renderChapterList();
    }
    updateOverallProgress();
  } catch (e) {
    adminChapterMsg.textContent = "Error: " + e.message;
  }
});

// Lecture actions
addLectureBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = lecBatch.value;
  const subjId = lecSubject.value;
  const chapterId = lecChapter.value;
  const title = lecTitle.value.trim();
  const yt = lecYT.value.trim();
  if (!batchId || !subjId || !chapterId || !title || !yt) {
    adminLectureMsg.textContent = "Fill all lecture fields.";
    return;
  }
  const lectureId = `L${Date.now()}`;
  try {
    await setDoc(lectureDoc(batchId, subjId, chapterId, lectureId), {
      title,
      youtubeId: yt,
    });
    lecTitle.value = "";
    lecYT.value = "";
    adminLectureMsg.textContent = "Lecture added (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (
      currentBatchId === batchId &&
      currentSubjectId === subjId &&
      currentChapterId === chapterId
    ) {
      const ch = getChapter(batchId, subjId, chapterId);
      renderChapterContent(ch);
    }
    updateOverallProgress();
  } catch (e) {
    adminLectureMsg.textContent = "Error: " + e.message;
  }
});

deleteLectureBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = lecBatch.value;
  const subjId = lecSubject.value;
  const chapterId = lecChapter.value;
  const lectureId = lecSelect.value;
  if (!batchId || !subjId || !chapterId || !lectureId) {
    adminLectureMsg.textContent = "Select lecture.";
    return;
  }
  try {
    await deleteDoc(lectureDoc(batchId, subjId, chapterId, lectureId));
    adminLectureMsg.textContent = "Lecture deleted (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (
      currentBatchId === batchId &&
      currentSubjectId === subjId &&
      currentChapterId === chapterId
    ) {
      const ch = getChapter(batchId, subjId, chapterId);
      renderChapterContent(ch);
    }
    updateOverallProgress();
  } catch (e) {
    adminLectureMsg.textContent = "Error: " + e.message;
  }
});

// Resource actions (PDFs)
addResBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = resBatch.value;
  const subjId = resSubject.value;
  const chapterId = resChapter.value;
  const type = resType.value;
  const title = resTitle.value.trim();
  const url = resUrl.value.trim();
  if (!batchId || !subjId || !chapterId || !type || !title || !url) {
    adminResMsg.textContent = "Fill all resource fields.";
    return;
  }
  const resId = `${type}-${Date.now()}`;
  try {
    await setDoc(resourceDoc(batchId, subjId, chapterId, resId), {
      title,
      url,
      type,
    });
    resTitle.value = "";
    resUrl.value = "";
    adminResMsg.textContent = "Resource added (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (
      currentBatchId === batchId &&
      currentSubjectId === subjId &&
      currentChapterId === chapterId
    ) {
      const ch = getChapter(batchId, subjId, chapterId);
      renderChapterContent(ch);
    }
  } catch (e) {
    adminResMsg.textContent = "Error: " + e.message;
  }
});

delResBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const batchId = resBatch.value;
  const subjId = resSubject.value;
  const chapterId = resChapter.value;
  const resId = resSelect.value;
  if (!batchId || !subjId || !chapterId || !resId) {
    adminResMsg.textContent = "Select resource.";
    return;
  }
  try {
    await deleteDoc(resourceDoc(batchId, subjId, chapterId, resId));
    adminResMsg.textContent = "Resource deleted (global).";
    await loadCourseFromFirestore();
    populateAdminSelectors();
    if (
      currentBatchId === batchId &&
      currentSubjectId === subjId &&
      currentChapterId === chapterId
    ) {
      const ch = getChapter(batchId, subjId, chapterId);
      renderChapterContent(ch);
    }
  } catch (e) {
    adminResMsg.textContent = "Error: " + e.message;
  }
});

// Announcements (admin)
createAnnBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const title = annTitleInput.value.trim();
  const body = annBodyInput.value.trim();
  if (!title || !body) {
    adminAnnMsg.textContent = "Fill title and message.";
    return;
  }
  const id = `ann-${Date.now()}`;
  try {
    await setDoc(doc(db, "announcements", id), {
      title,
      body,
      createdAt: Date.now(),
    });
    annTitleInput.value = "";
    annBodyInput.value = "";
    adminAnnMsg.textContent = "Announcement created (global).";
  } catch (e) {
    adminAnnMsg.textContent = "Error: " + e.message;
  }
});

deleteAnnBtn.addEventListener("click", async () => {
  if (!requireAdmin()) return;
  const id = adminAnnSelect.value;
  if (!id) {
    adminAnnMsg.textContent = "Select an announcement.";
    return;
  }
  try {
    await deleteDoc(doc(db, "announcements", id));
    adminAnnMsg.textContent = "Announcement deleted.";
  } catch (e) {
    adminAnnMsg.textContent = "Error: " + e.message;
  }
});

// Keep admin announcements dropdown in sync
function populateAdminAnnouncements() {
  if (!adminAnnSelect) return;
  adminAnnSelect.innerHTML = "";
  announcements
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((ann) => {
      const opt = document.createElement("option");
      opt.value = ann.id;
      opt.textContent = ann.title;
      adminAnnSelect.appendChild(opt);
    });
}
onSnapshot(collection(db, "announcements"), (snap) => {
  announcements = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    announcements.push({
      id: docSnap.id,
      title: d.title,
      body: d.body,
      createdAt: d.createdAt || 0,
    });
  });
  populateAdminAnnouncements();
});

// ========== INIT ==========
window.addEventListener("load", async () => {
  try {
    await loadCourseFromFirestore();
  } catch (e) {
    console.error("Error loading Firestore data:", e);
  }
  populateAdminSelectors();
  updateOverallProgress();
});
