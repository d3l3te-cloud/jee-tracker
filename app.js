// app.js
// Praxis main logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ============ FIREBASE CONFIG ===================
const firebaseConfig = {
  apiKey: "AIzaSyAO6lAxJ8DTqRq62E-8PIxnwBBWm-vZ-d4",
  authDomain: "praxis-cd621.firebaseapp.com",
  projectId: "praxis-cd621",
  storageBucket: "praxis-cd621.firebasestorage.app",
  messagingSenderId: "924385334052",
  appId: "1:924385334052:web:89ff6ab687f2dd769e19b1",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============ DEMO CONTENT DATA ==================

const courseData = {
  batches: [
    {
      id: "batch10-2025",
      name: "Class 10 – Board Booster",
      classLevel: "10",
      subjects: [
        {
          id: "math10",
          name: "Mathematics",
          chapters: [
            {
              id: "math10-real-numbers",
              name: "Chapter 1: Real Numbers",
              description:
                "Euclid's division lemma, fundamental theorem of arithmetic, revisiting irrational numbers and decimal expansions.",
              lectures: [
                {
                  id: "L1",
                  title: "Introduction to Real Numbers & Theorem",
                  youtubeId: "dQw4w9WgXcQ", // placeholder
                  duration: "45:00",
                  level: "Easy",
                },
                {
                  id: "L2",
                  title: "Fundamental Theorem of Arithmetic",
                  youtubeId: "eY52Zsg-KVI", // placeholder
                  duration: "55:00",
                  level: "Medium",
                },
              ],
              notes: [
                {
                  id: "N1",
                  title: "Real Numbers – Short Notes",
                  url: "https://example.com/real-numbers-notes.pdf",
                },
              ],
              dpp: [
                {
                  id: "D1",
                  title: "Real Numbers – DPP 01",
                  url: "https://example.com/real-numbers-dpp1.pdf",
                },
              ],
              solutions: [
                {
                  id: "S1",
                  title: "Real Numbers – DPP 01 Solutions",
                  url: "https://example.com/real-numbers-dpp1-solutions.pdf",
                },
              ],
              tests: [
                {
                  id: "T1",
                  title: "Real Numbers – Chapter Test",
                  paperUrl: "https://example.com/real-numbers-test.pdf",
                  solutionUrl:
                    "https://example.com/real-numbers-test-solutions.pdf",
                },
              ],
            },
          ],
        },
        {
          id: "sci10",
          name: "Science (Placeholder)",
          chapters: [],
        },
      ],
    },
    {
      id: "batch12-placeholder",
      name: "Class 12 – Coming Soon",
      classLevel: "12",
      subjects: [
        {
          id: "math12",
          name: "Mathematics",
          chapters: [],
        },
      ],
    },
  ],
};

// announcements stored locally for now
let announcements = [];

// Admin emails for demo
const ADMIN_EMAILS = ["you@example.com", "hello@gmail.com"];

// ============ STATE ==========================================
let currentUser = null;
let userProgress = {
  completedLectures: {},
  completedDpp: {},
};

let currentClassLevel = null;
let currentBatchId = null;
let currentSubjectId = null;
let currentChapterId = null;
let currentLectureKey = null;

// Helper to build unique keys
function lectureKey(batchId, subjectId, chapterId, lectureId) {
  return `${batchId}|${subjectId}|${chapterId}|${lectureId}`;
}

// Helpers to find data
function getBatchById(batchId) {
  return courseData.batches.find((b) => b.id === batchId) || null;
}

function getBatchesByClass(level) {
  return courseData.batches.filter((b) => b.classLevel === level);
}

function getSubject(batch, subjectId) {
  if (!batch) return null;
  if (subjectId) {
    const found = batch.subjects.find((s) => s.id === subjectId);
    if (found) return found;
  }
  return batch.subjects[0] || null;
}

function getChapter(batchId, subjectId, chapterId) {
  const batch = getBatchById(batchId);
  if (!batch) return null;
  const subject = getSubject(batch, subjectId);
  if (!subject) return null;
  return subject.chapters.find((c) => c.id === chapterId) || null;
}

// ============ DOM SHORTCUTS ================================

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// Views
const views = {
  dashboardView: qs("#dashboardView"),
  courseView: qs("#courseView"),
  analysisView: qs("#analysisView"),
  adminView: qs("#adminView"),
};

// Topnav buttons
qsa(".topnav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    qsa(".topnav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.values(views).forEach((v) => v.classList.remove("active"));
    views[view].classList.add("active");

    if (view === "courseView" && !currentClassLevel) {
      openClass("10");
    }
  });
});

function switchView(viewId) {
  qsa(".topnav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === viewId)
  );
  Object.entries(views).forEach(([id, el]) =>
    el.classList.toggle("active", id === viewId)
  );
}

// Theme toggle ================================================
const themeToggle = qs("#themeToggle");
const themeIcon = qs("#themeIcon");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
}

const savedTheme = localStorage.getItem("praxis-theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const newTheme =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  applyTheme(newTheme);
  localStorage.setItem("praxis-theme", newTheme);
});

// ============ AUTH UI =======================================

const authArea = qs("#authArea");
const authModal = qs("#authModal");
const authModalClose = qs("#authModalClose");
const googleSignInBtn = qs("#googleSignInBtn");
const emailLoginBtn = qs("#emailLoginBtn");
const emailSignupBtn = qs("#emailSignupBtn");
const guestSignInBtn = qs("#guestSignInBtn");
const continueAsGuestBtn = qs("#continueAsGuestBtn");
const authEmail = qs("#authEmail");
const authPassword = qs("#authPassword");
const authError = qs("#authError");
const userProfileSummary = qs("#userProfileSummary");
const adminGuard = qs("#adminGuard");
const adminPanels = qs("#adminPanels");
const heroOverallPctEl = qs("#heroOverallPct");
const lastActivityBody = qs("#lastActivityBody");

function openAuthModal() {
  authModal.classList.remove("hidden");
  authError.textContent = "";
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

authModalClose.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => {
  if (e.target === authModal.querySelector(".modal-backdrop")) {
    closeAuthModal();
  }
});

function renderAuthArea() {
  authArea.innerHTML = "";
  if (currentUser) {
    const avatarBtn = document.createElement("button");
    avatarBtn.className = "btn-secondary small";
    avatarBtn.textContent = currentUser.isAnonymous
      ? "Guest – Sign out"
      : `${currentUser.email || "User"} – Sign out`;
    avatarBtn.addEventListener("click", () => signOut(auth));
    authArea.appendChild(avatarBtn);
  } else {
    const btn = document.createElement("button");
    btn.id = "loginBtn";
    btn.className = "btn-primary";
    btn.textContent = "Sign in";
    btn.addEventListener("click", openAuthModal);
    authArea.appendChild(btn);
  }

  // hide "continue as guest" on dashboard if signed in
  if (continueAsGuestBtn) {
    continueAsGuestBtn.style.display = currentUser ? "none" : "inline-flex";
  }
}

// Auth handlers ----------------------------------------------
googleSignInBtn.addEventListener("click", async () => {
  authError.textContent = "";
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
  }
});

emailSignupBtn.addEventListener("click", async () => {
  authError.textContent = "";
  try {
    await createUserWithEmailAndPassword(
      auth,
      authEmail.value,
      authPassword.value
    );
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
  }
});

emailLoginBtn.addEventListener("click", async () => {
  authError.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value);
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
  }
});

guestSignInBtn.addEventListener("click", async () => {
  authError.textContent = "";
  try {
    await signInAnonymously(auth);
    closeAuthModal();
  } catch (err) {
    authError.textContent = err.message;
  }
});

if (continueAsGuestBtn) {
  continueAsGuestBtn.addEventListener("click", async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      alert(err.message);
    }
  });
}

// Hero buttons
qs("#heroStartStudy").addEventListener("click", () => {
  openClass("10");
  switchView("courseView");
});
qs("#heroOpenAnalysis").addEventListener("click", () => {
  switchView("analysisView");
});
qs("#class10Btn").addEventListener("click", () => {
  openClass("10");
  switchView("courseView");
});
qs("#class12Btn").addEventListener("click", () => {
  openClass("12");
  switchView("courseView");
});

// ============ ANNOUNCEMENTS UI ==============================

const announcementBell = qs("#announcementBell");
const announcementBadge = qs("#announcementBadge");
const announcementModal = qs("#announcementModal");
const announcementModalClose = qs("#announcementModalClose");
const announcementList = qs("#announcementList");

announcementBell.addEventListener("click", () => {
  announcementModal.classList.remove("hidden");
  announcementBadge.classList.add("hidden");
});

announcementModalClose.addEventListener("click", () => {
  announcementModal.classList.add("hidden");
});

announcementModal.addEventListener("click", (e) => {
  if (e.target === announcementModal.querySelector(".modal-backdrop")) {
    announcementModal.classList.add("hidden");
  }
});

function renderAnnouncements() {
  announcementList.innerHTML = "";
  if (!announcements.length) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.textContent = "No announcements yet.";
    announcementList.appendChild(empty);
    return;
  }

  announcements
    .slice()
    .reverse()
    .forEach((a) => {
      const row = document.createElement("div");
      row.className = "list-item-row";
      const main = document.createElement("div");
      main.className = "list-item-main";
      main.innerHTML = `<div class="list-item-title">${a.title}</div>
                        <div class="list-item-meta">${a.body}</div>`;
      row.appendChild(main);
      announcementList.appendChild(row);
    });
}

function pushAnnouncementNotification(a) {
  // show red dot
  announcementBadge.classList.remove("hidden");

  // basic browser notification (works when tab is open and permission granted)
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(a.title, { body: a.body });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          new Notification(a.title, { body: a.body });
        }
      });
    }
  }
}

// ============ PROGRESS STORAGE (FIRESTORE) ==================

async function loadUserProgress(uid) {
  const ref = doc(db, "userProgress", uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    userProgress = snapshot.data();
  } else {
    userProgress = {};
  }
  if (!userProgress.completedLectures) userProgress.completedLectures = {};
  if (!userProgress.completedDpp) userProgress.completedDpp = {};
}

async function saveUserProgress() {
  if (!currentUser) return;
  const ref = doc(db, "userProgress", currentUser.uid);
  await setDoc(ref, userProgress, { merge: true });
  renderAnalysis();
  renderChapterProgress();
}

// ============ AUTH STATE LISTENER ===========================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderAuthArea();

  if (user) {
    await loadUserProgress(user.uid);
    userProfileSummary.textContent = user.isAnonymous
      ? "Guest mode: progress is saved on this device but not tied to an email."
      : `Signed in as ${user.email}. Progress will sync across devices.`;

    const isAdmin = !user.isAnonymous && ADMIN_EMAILS.includes(user.email);
    if (isAdmin) {
      adminGuard.textContent = `Admin: ${user.email}`;
      adminPanels.classList.remove("hidden");
    } else {
      adminGuard.textContent =
        "You are not an admin. Change ADMIN_EMAILS in app.js for your account.";
      adminPanels.classList.add("hidden");
    }
  } else {
    userProfileSummary.textContent =
      "Not signed in. Progress is only stored temporarily.";
    adminPanels.classList.add("hidden");
  }

  populateAdminSelectors();
  renderAnalysis();
  renderChapterProgress();
});

// ============ TABS ==========================================

const tabButtons = qsa(".tab");
const tabPanels = qsa(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.id === targetId)
    );
  });
});

// ============ COURSE VIEW ===================================

const batchSelect = qs("#batchSelect");
const subjectSelect = qs("#subjectSelect");
const chapterListEl = qs("#chapterList");
const currentClassLabel = qs("#currentClassLabel");

const chapterTitleEl = qs("#chapterTitle");
const chapterInfoEl = qs("#chapterInfo");
const chapterProgressBadge = qs("#chapterProgressBadge");

const lectureList = qs("#lectureList");
const notesList = qs("#notesList");
const dppList = qs("#dppList");
const solutionsList = qs("#solutionsList");
const testsList = qs("#testsList");

// Video modal
const playerModal = qs("#playerModal");
const playerModalClose = qs("#playerModalClose");
const playerTitle = qs("#playerTitle");
const lecturePlayer = qs("#lecturePlayer");
const markLectureDoneBtn = qs("#markLectureDoneBtn");
const lectureDoneStatus = qs("#lectureDoneStatus");

playerModalClose.addEventListener("click", closePlayerModal);
playerModal.addEventListener("click", (e) => {
  if (e.target === playerModal.querySelector(".modal-backdrop")) {
    closePlayerModal();
  }
});

function openPlayerModal() {
  playerModal.classList.remove("hidden");
}
function closePlayerModal() {
  playerModal.classList.add("hidden");
  lecturePlayer.src = "";
}

// Open a class (10 / 12)
function openClass(level) {
  currentClassLevel = level;
  currentClassLabel.textContent =
    level === "10" ? "Class 10 (Secondary)" : "Class 12 (Senior Secondary)";

  const batches = getBatchesByClass(level);
  batchSelect.innerHTML = "";
  if (!batches.length) {
    chapterListEl.innerHTML =
      "<div class='muted small'>No batches configured yet for this class.</div>";
    subjectSelect.innerHTML = "";
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

  const batch = getBatchById(currentBatchId);
  const subject = getSubject(batch, currentSubjectId);
  if (subject && subject.chapters.length) {
    onChapterSelected(currentBatchId, subject.id, subject.chapters[0].id);
  } else {
    clearChapterContent();
  }
}

function clearChapterContent() {
  chapterTitleEl.textContent = "Select a chapter";
  chapterInfoEl.textContent =
    "Choose a chapter on the left to see lectures and material.";
  lectureList.innerHTML = "";
  notesList.innerHTML = "";
  dppList.innerHTML = "";
  solutionsList.innerHTML = "";
  testsList.innerHTML = "";
}

// populate subjects based on batch
function populateSubjectSelect() {
  const batch = getBatchById(currentBatchId);
  subjectSelect.innerHTML = "";
  if (!batch || !batch.subjects.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No subjects";
    subjectSelect.appendChild(opt);
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
  const batch = getBatchById(currentBatchId);
  const subject = getSubject(batch, currentSubjectId);
  if (subject && subject.chapters.length) {
    onChapterSelected(currentBatchId, subject.id, subject.chapters[0].id);
  } else {
    clearChapterContent();
  }
});

subjectSelect.addEventListener("change", () => {
  currentSubjectId = subjectSelect.value;
  renderChapterList();
  const batch = getBatchById(currentBatchId);
  const subject = getSubject(batch, currentSubjectId);
  if (subject && subject.chapters.length) {
    onChapterSelected(currentBatchId, subject.id, subject.chapters[0].id);
  } else {
    clearChapterContent();
  }
});

function renderChapterList() {
  chapterListEl.innerHTML = "";
  const batch = getBatchById(currentBatchId);
  const subject = getSubject(batch, currentSubjectId);
  if (!subject) {
    chapterListEl.innerHTML =
      "<div class='muted small'>No subject/chapters configured.</div>";
    return;
  }

  subject.chapters.forEach((chapter) => {
    const div = document.createElement("div");
    div.className = "chapter-item";
    div.dataset.chapterId = chapter.id;
    div.innerHTML = `<span>${chapter.name}</span>`;
    if (chapter.id === currentChapterId) {
      div.classList.add("active");
    }
    div.addEventListener("click", () =>
      onChapterSelected(batch.id, subject.id, chapter.id)
    );
    chapterListEl.appendChild(div);
  });

  if (!subject.chapters.length) {
    chapterListEl.innerHTML =
      "<div class='muted small'>No chapters yet. Use Admin to add.</div>";
  }
}

function onChapterSelected(batchId, subjectId, chapterId) {
  currentBatchId = batchId;
  currentSubjectId = subjectId;
  currentChapterId = chapterId;

  qsa(".chapter-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.chapterId === chapterId);
  });

  const chapter = getChapter(batchId, subjectId, chapterId);
  if (!chapter) return;

  chapterTitleEl.textContent = chapter.name;
  chapterInfoEl.textContent = chapter.description || "";
  renderChapterProgress();

  // Lectures
  lectureList.innerHTML = "";
  chapter.lectures.forEach((lec) => {
    const li = document.createElement("li");
    li.className = "list-item-row lecture-card";

    const thumb = document.createElement("div");
    thumb.className = "lecture-thumb";
    const img = document.createElement("img");
    img.src = `https://img.youtube.com/vi/${lec.youtubeId}/mqdefault.jpg`;
    img.alt = lec.title;
    thumb.appendChild(img);

    const main = document.createElement("div");
    main.className = "list-item-main";
    main.innerHTML = `
      <div class="list-item-title">${lec.title}</div>
      <div class="list-item-meta">${lec.duration || ""} · ${
      lec.level || ""
    }</div>
    `;

    const status = document.createElement("div");
    status.className = "list-item-status";
    const key = lectureKey(batchId, subjectId, chapterId, lec.id);
    status.textContent = userProgress.completedLectures?.[key]
      ? "Completed ✓"
      : "";

    li.appendChild(thumb);
    li.appendChild(main);
    li.appendChild(status);

    li.addEventListener("click", () =>
      playLecture(batchId, subjectId, chapterId, lec)
    );

    lectureList.appendChild(li);
  });

  // Notes, DPP, Solutions, Tests
  populateResourceList(notesList, chapter.notes, "Notes");
  populateResourceList(dppList, chapter.dpp, "DPP");
  populateResourceList(solutionsList, chapter.solutions, "Solution");
  populateTestsList(testsList, chapter.tests);

  currentLectureKey = null;
  markLectureDoneBtn.disabled = true;
  lectureDoneStatus.textContent = "";
}

function playLecture(batchId, subjectId, chapterId, lecture) {
  playerTitle.textContent = lecture.title;
  const url = `https://www.youtube.com/embed/${lecture.youtubeId}?rel=0`;
  lecturePlayer.src = url;

  currentLectureKey = lectureKey(batchId, subjectId, chapterId, lecture.id);
  markLectureDoneBtn.disabled = false;
  updateLectureStatus();

  lastActivityBody.textContent = `Watching: ${lecture.title} (${chapterTitleEl.textContent})`;

  openPlayerModal();
}

function updateLectureStatus() {
  if (!currentLectureKey) {
    lectureDoneStatus.textContent = "";
    return;
  }
  const done = !!userProgress.completedLectures?.[currentLectureKey];
  lectureDoneStatus.textContent = done ? "Marked as completed ✓" : "";
}

markLectureDoneBtn.addEventListener("click", async () => {
  if (!currentLectureKey) return;
  if (!userProgress.completedLectures) userProgress.completedLectures = {};
  userProgress.completedLectures[currentLectureKey] = true;
  await saveUserProgress();
  updateLectureStatus();
  if (currentBatchId && currentSubjectId && currentChapterId) {
    onChapterSelected(currentBatchId, currentSubjectId, currentChapterId);
  }
});

// Resource lists – entire row is clickable
function populateResourceList(ul, items, typeLabel) {
  ul.innerHTML = "";
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.textContent = "No material added yet.";
    ul.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item-row";
    const main = document.createElement("div");
    main.className = "list-item-main";
    main.innerHTML = `<div class="list-item-title">${item.title}</div>
                      <div class="list-item-meta">${typeLabel}</div>`;

    const actions = document.createElement("div");
    actions.className = "list-item-status";
    actions.textContent = "Open PDF ↗";

    li.appendChild(main);
    li.appendChild(actions);
    li.addEventListener("click", () => {
      window.open(item.url, "_blank");
    });

    ul.appendChild(li);
  });
}

function populateTestsList(ul, tests) {
  ul.innerHTML = "";
  if (!tests || tests.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.textContent = "No tests added yet.";
    ul.appendChild(empty);
    return;
  }

  tests.forEach((test) => {
    const li = document.createElement("li");
    li.className = "list-item-row";

    const main = document.createElement("div");
    main.className = "list-item-main";
    main.innerHTML = `<div class="list-item-title">${test.title}</div>`;

    const actions = document.createElement("div");
    actions.className = "list-item-status";
    actions.textContent = "Open test ↗";

    li.appendChild(main);
    li.appendChild(actions);
    li.addEventListener("click", () => {
      window.open(test.paperUrl, "_blank");
    });

    ul.appendChild(li);
  });
}

// ============ ANALYSIS ======================================

const analysisContent = qs("#analysisContent");

function computeStats() {
  const stats = {
    totalLectures: 0,
    completedLectures: 0,
    perChapter: {},
  };

  courseData.batches.forEach((batch) => {
    batch.subjects.forEach((subject) => {
      subject.chapters.forEach((chapter) => {
        const chapterKey = chapter.id;
        const lectures = chapter.lectures || [];
        stats.totalLectures += lectures.length;

        let completed = 0;
        lectures.forEach((lec) => {
          const key = lectureKey(batch.id, subject.id, chapter.id, lec.id);
          if (userProgress.completedLectures?.[key]) completed++;
        });

        stats.perChapter[chapterKey] = {
          name: chapter.name,
          totalLectures: lectures.length,
          completedLectures: completed,
        };
        stats.completedLectures += completed;
      });
    });
  });

  return stats;
}

function renderChapterProgress() {
  if (!currentChapterId) {
    chapterProgressBadge.textContent = "0% complete";
    return;
  }
  const stats = computeStats();
  const chapterStats = stats.perChapter[currentChapterId];
  if (!chapterStats || chapterStats.totalLectures === 0) {
    chapterProgressBadge.textContent = "No lectures";
    return;
  }
  const pct = Math.round(
    (chapterStats.completedLectures / chapterStats.totalLectures) * 100
  );
  chapterProgressBadge.textContent = `${pct}% complete`;
}

function renderAnalysis() {
  const stats = computeStats();

  if (stats.totalLectures === 0) {
    analysisContent.textContent =
      "No lectures configured yet. Add content from the Admin panel or edit courseData in app.js.";
    if (heroOverallPctEl) heroOverallPctEl.textContent = "0%";
    return;
  }

  const overallPct = Math.round(
    (stats.completedLectures / stats.totalLectures) * 100
  );

  if (heroOverallPctEl) {
    heroOverallPctEl.textContent = `${overallPct}%`;
  }

  const container = document.createElement("div");
  container.className = "grid";

  Object.values(stats.perChapter).forEach((ch) => {
    const pct =
      ch.totalLectures === 0
        ? 0
        : Math.round((ch.completedLectures / ch.totalLectures) * 100);

    const card = document.createElement("div");
    card.className = "card small-card";
    card.innerHTML = `
      <div class="list-item-title">${ch.name}</div>
      <div class="list-item-meta">
        ${ch.completedLectures}/${ch.totalLectures} lectures · ${pct}%
      </div>
      <div style="margin-top:6px;height:6px;border-radius:999px;background:var(--bg-soft);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent);transition:width .2s;"></div>
      </div>
    `;
    container.appendChild(card);
  });

  analysisContent.innerHTML = "";
  analysisContent.appendChild(container);
}

renderAnalysis();

// ============ ADMIN LOCAL EDITING ===========================

// Batch management
const adminBatchId = qs("#adminBatchId");
const adminBatchName = qs("#adminBatchName");
const adminBatchClass = qs("#adminBatchClass");
const adminCreateBatchBtn = qs("#adminCreateBatchBtn");
const adminBatchDeleteSelect = qs("#adminBatchDeleteSelect");
const adminDeleteBatchBtn = qs("#adminDeleteBatchBtn");
const adminBatchMsg = qs("#adminBatchMsg");

// Subject management
const adminSubjectBatch = qs("#adminSubjectBatch");
const adminSubjectId = qs("#adminSubjectId");
const adminSubjectName = qs("#adminSubjectName");
const adminCreateSubjectBtn = qs("#adminCreateSubjectBtn");
const adminSubjectDeleteSelect = qs("#adminSubjectDeleteSelect");
const adminDeleteSubjectBtn = qs("#adminDeleteSubjectBtn");
const adminSubjectMsg = qs("#adminSubjectMsg");

// Chapters & lectures & PDFs
const adminChapterBatch = qs("#adminChapterBatch");
const adminChapterSubject = qs("#adminChapterSubject");
const adminNewChapterId = qs("#adminNewChapterId");
const adminNewChapterName = qs("#adminNewChapterName");
const adminNewChapterDescription = qs("#adminNewChapterDescription");
const adminCreateChapterBtn = qs("#adminCreateChapterBtn");
const adminChapterMsg = qs("#adminChapterMsg");

const adminLectureChapterSelect = qs("#adminLectureChapter");
const adminLectureTitle = qs("#adminLectureTitle");
const adminLectureUrl = qs("#adminLectureUrl");
const adminAddLectureBtn = qs("#adminAddLectureBtn");
const adminDeleteLectureId = qs("#adminDeleteLectureId");
const adminDeleteLectureBtn = qs("#adminDeleteLectureBtn");
const adminLectureMsg = qs("#adminLectureMsg");

const adminPdfChapterSelect = qs("#adminPdfChapter");
const adminPdfType = qs("#adminPdfType");
const adminPdfTitle = qs("#adminPdfTitle");
const adminPdfUrl = qs("#adminPdfUrl");
const adminAddPdfBtn = qs("#adminAddPdfBtn");
const adminDeletePdfId = qs("#adminDeletePdfId");
const adminDeletePdfBtn = qs("#adminDeletePdfBtn");
const adminPdfMsg = qs("#adminPdfMsg");

// Announcements
const adminAnnouncementTitle = qs("#adminAnnouncementTitle");
const adminAnnouncementBody = qs("#adminAnnouncementBody");
const adminAddAnnouncementBtn = qs("#adminAddAnnouncementBtn");
const adminAnnouncementDeleteSelect = qs("#adminAnnouncementDeleteSelect");
const adminDeleteAnnouncementBtn = qs("#adminDeleteAnnouncementBtn");
const adminAnnouncementMsg = qs("#adminAnnouncementMsg");

// Flatten helpers for selects
function getAllChaptersFlat() {
  const list = [];
  courseData.batches.forEach((b) => {
    b.subjects.forEach((s) => {
      s.chapters.forEach((c) => {
        list.push({ batchId: b.id, subjectId: s.id, chapter: c });
      });
    });
  });
  return list;
}

// Populate Admin selects
function populateAdminSelectors() {
  // batches
  adminBatchDeleteSelect.innerHTML = "";
  adminSubjectBatch.innerHTML = "";
  adminChapterBatch.innerHTML = "";

  courseData.batches.forEach((b) => {
    const label = `${b.name} (${b.classLevel})`;

    const opt1 = document.createElement("option");
    opt1.value = b.id;
    opt1.textContent = label;
    adminBatchDeleteSelect.appendChild(opt1);

    const opt2 = opt1.cloneNode(true);
    adminSubjectBatch.appendChild(opt2);

    const opt3 = opt1.cloneNode(true);
    adminChapterBatch.appendChild(opt3);
  });

  populateAdminSubjectDeleteSelect();
  populateAdminChapterSubjectSelect();
  populateAdminChapterDropdowns();

  // announcements delete select
  adminAnnouncementDeleteSelect.innerHTML = "";
  announcements.forEach((a, index) => {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = a.title;
    adminAnnouncementDeleteSelect.appendChild(opt);
  });
}

function populateAdminSubjectDeleteSelect() {
  adminSubjectDeleteSelect.innerHTML = "";
  const batchId = adminSubjectBatch.value;
  const batch = getBatchById(batchId);
  if (!batch) return;
  batch.subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = `${batchId}|${s.id}`;
    opt.textContent = `${s.name} [${s.id}]`;
    adminSubjectDeleteSelect.appendChild(opt);
  });
}

function populateAdminChapterSubjectSelect() {
  adminChapterSubject.innerHTML = "";
  const batchId = adminChapterBatch.value;
  const batch = getBatchById(batchId);
  if (!batch) return;
  batch.subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    adminChapterSubject.appendChild(opt);
  });
}

function populateAdminChapterDropdowns() {
  const chapters = getAllChaptersFlat();
  adminLectureChapterSelect.innerHTML = "";
  adminPdfChapterSelect.innerHTML = "";
  chapters.forEach((info) => {
    const label = `${info.chapter.name} [${info.batchId}/${info.subjectId}]`;
    const opt1 = document.createElement("option");
    opt1.value = info.chapter.id;
    opt1.textContent = label;
    opt1.dataset.batchId = info.batchId;
    opt1.dataset.subjectId = info.subjectId;
    adminLectureChapterSelect.appendChild(opt1);

    const opt2 = opt1.cloneNode(true);
    adminPdfChapterSelect.appendChild(opt2);
  });
}

// When changing batch selection in admin subject/chapter sections
adminSubjectBatch.addEventListener("change", populateAdminSubjectDeleteSelect);
adminChapterBatch.addEventListener("change", populateAdminChapterSubjectSelect);

// Batch create/delete
adminCreateBatchBtn.addEventListener("click", () => {
  const id = adminBatchId.value.trim();
  const name = adminBatchName.value.trim();
  const level = adminBatchClass.value;
  if (!id || !name) {
    adminBatchMsg.textContent = "Please enter both ID and name.";
    return;
  }
  if (courseData.batches.some((b) => b.id === id)) {
    adminBatchMsg.textContent = "Batch ID already exists.";
    return;
  }
  courseData.batches.push({
    id,
    name,
    classLevel: level,
    subjects: [],
  });

  adminBatchMsg.textContent =
    "Batch created locally. Select the class and batch in Batches view to see it.";
  adminBatchId.value = "";
  adminBatchName.value = "";

  populateAdminSelectors();
});

adminDeleteBatchBtn.addEventListener("click", () => {
  const id = adminBatchDeleteSelect.value;
  if (!id) {
    adminBatchMsg.textContent = "No batch selected.";
    return;
  }
  const index = courseData.batches.findIndex((b) => b.id === id);
  if (index === -1) {
    adminBatchMsg.textContent = "Batch not found.";
    return;
  }
  courseData.batches.splice(index, 1);
  adminBatchMsg.textContent =
    "Batch deleted locally. If it was current, please choose another batch.";
  populateAdminSelectors();
  renderAnalysis();
});

// Subject create/delete
adminCreateSubjectBtn.addEventListener("click", () => {
  const batchId = adminSubjectBatch.value;
  const batch = getBatchById(batchId);
  if (!batch) {
    adminSubjectMsg.textContent = "Batch not found.";
    return;
  }

  const id = adminSubjectId.value.trim();
  const name = adminSubjectName.value.trim();
  if (!id || !name) {
    adminSubjectMsg.textContent = "Enter both subject ID and name.";
    return;
  }
  if (batch.subjects.some((s) => s.id === id)) {
    adminSubjectMsg.textContent = "Subject ID already exists in this batch.";
    return;
  }

  batch.subjects.push({
    id,
    name,
    chapters: [],
  });

  adminSubjectMsg.textContent =
    "Subject created locally. It will appear in Batches view subject dropdown.";
  adminSubjectId.value = "";
  adminSubjectName.value = "";

  populateAdminSelectors();
  if (currentBatchId === batchId) {
    populateSubjectSelect();
    renderChapterList();
  }
});

adminDeleteSubjectBtn.addEventListener("click", () => {
  const value = adminSubjectDeleteSelect.value; // batchId|subjectId
  if (!value) {
    adminSubjectMsg.textContent = "No subject selected.";
    return;
  }
  const [batchId, subjectId] = value.split("|");
  const batch = getBatchById(batchId);
  if (!batch) {
    adminSubjectMsg.textContent = "Batch not found.";
    return;
  }
  const idx = batch.subjects.findIndex((s) => s.id === subjectId);
  if (idx === -1) {
    adminSubjectMsg.textContent = "Subject not found.";
    return;
  }

  batch.subjects.splice(idx, 1);
  adminSubjectMsg.textContent =
    "Subject deleted locally (with all its chapters).";
  populateAdminSelectors();

  if (currentBatchId === batchId) {
    populateSubjectSelect();
    renderChapterList();
    clearChapterContent();
  }
  renderAnalysis();
});

// Create chapter
adminCreateChapterBtn.addEventListener("click", () => {
  const batchId = adminChapterBatch.value;
  const subjectId = adminChapterSubject.value;
  const batch = getBatchById(batchId);
  const subject = getSubject(batch, subjectId);
  if (!subject) {
    adminChapterMsg.textContent = "Subject not found.";
    return;
  }

  const id = adminNewChapterId.value.trim();
  const name = adminNewChapterName.value.trim();
  const desc = adminNewChapterDescription.value.trim();
  if (!id || !name) {
    adminChapterMsg.textContent = "Please fill at least ID and name.";
    return;
  }

  if (subject.chapters.some((c) => c.id === id)) {
    adminChapterMsg.textContent = "Chapter ID already exists.";
    return;
  }

  subject.chapters.push({
    id,
    name,
    description: desc,
    lectures: [],
    notes: [],
    dpp: [],
    solutions: [],
    tests: [],
  });

  adminChapterMsg.textContent =
    "Chapter added locally. It is now visible in chapter list.";
  adminNewChapterId.value = "";
  adminNewChapterName.value = "";
  adminNewChapterDescription.value = "";

  populateAdminSelectors();
  if (currentBatchId === batchId && currentSubjectId === subjectId) {
    renderChapterList();
  }
  renderAnalysis();
});

// Parse YouTube id from URL
function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
  } catch (e) {
    // not a valid URL or already an ID
  }
  return url;
}

// Add lecture
adminAddLectureBtn.addEventListener("click", () => {
  const sel =
    adminLectureChapterSelect.options[adminLectureChapterSelect.selectedIndex];
  if (!sel) {
    adminLectureMsg.textContent = "No chapter selected.";
    return;
  }
  const chapterId = sel.value;
  const batchId = sel.dataset.batchId;
  const subjectId = sel.dataset.subjectId;

  const title = adminLectureTitle.value.trim();
  const url = adminLectureUrl.value.trim();
  if (!chapterId || !title || !url) {
    adminLectureMsg.textContent = "Please fill all fields.";
    return;
  }
  const youtubeId = extractYoutubeId(url);

  const chapter = getChapter(batchId, subjectId, chapterId);
  if (!chapter) {
    adminLectureMsg.textContent = "Chapter not found.";
    return;
  }

  const newId = `L${(chapter.lectures.length || 0) + 1}`;
  chapter.lectures.push({
    id: newId,
    title,
    youtubeId,
    duration: "",
    level: "",
  });

  adminLectureMsg.textContent =
    "Lecture added locally. Reload that chapter in Batches view to see it.";
  adminLectureTitle.value = "";
  adminLectureUrl.value = "";

  renderAnalysis();
});

// Delete lecture
adminDeleteLectureBtn.addEventListener("click", () => {
  const sel =
    adminLectureChapterSelect.options[adminLectureChapterSelect.selectedIndex];
  if (!sel) {
    adminLectureMsg.textContent = "No chapter selected.";
    return;
  }
  const chapterId = sel.value;
  const batchId = sel.dataset.batchId;
  const subjectId = sel.dataset.subjectId;
  const lectureId = adminDeleteLectureId.value.trim();

  if (!lectureId) {
    adminLectureMsg.textContent = "Enter lecture ID to delete (e.g. L1).";
    return;
  }

  const chapter = getChapter(batchId, subjectId, chapterId);
  if (!chapter) {
    adminLectureMsg.textContent = "Chapter not found.";
    return;
  }

  const idx = chapter.lectures.findIndex((l) => l.id === lectureId);
  if (idx === -1) {
    adminLectureMsg.textContent = "Lecture ID not found in this chapter.";
    return;
  }

  chapter.lectures.splice(idx, 1);
  adminLectureMsg.textContent =
    "Lecture deleted locally. Reload that chapter in Batches view.";
  adminDeleteLectureId.value = "";

  renderAnalysis();
  if (
    currentBatchId === batchId &&
    currentSubjectId === subjectId &&
    currentChapterId === chapterId
  ) {
    onChapterSelected(batchId, subjectId, chapterId);
  }
});

// Add PDF resource
adminAddPdfBtn.addEventListener("click", () => {
  const sel =
    adminPdfChapterSelect.options[adminPdfChapterSelect.selectedIndex];
  if (!sel) {
    adminPdfMsg.textContent = "No chapter selected.";
    return;
  }
  const chapterId = sel.value;
  const batchId = sel.dataset.batchId;
  const subjectId = sel.dataset.subjectId;

  const type = adminPdfType.value;
  const title = adminPdfTitle.value.trim();
  const url = adminPdfUrl.value.trim();
  if (!chapterId || !title || !url) {
    adminPdfMsg.textContent = "Please fill all fields.";
    return;
  }

  const chapter = getChapter(batchId, subjectId, chapterId);
  if (!chapter) {
    adminPdfMsg.textContent = "Chapter not found.";
    return;
  }

  let arrayRef;
  if (type === "notes") arrayRef = chapter.notes || (chapter.notes = []);
  else if (type === "dpp") arrayRef = chapter.dpp || (chapter.dpp = []);
  else if (type === "solutions")
    arrayRef = chapter.solutions || (chapter.solutions = []);
  else if (type === "tests") arrayRef = chapter.tests || (chapter.tests = []);

  const newIdPrefix =
    type === "tests" ? "T" : type === "notes" ? "N" : type === "dpp" ? "D" : "S";
  const newId = `${newIdPrefix}${(arrayRef.length || 0) + 1}`;

  if (type === "tests") {
    arrayRef.push({
      id: newId,
      title,
      paperUrl: url,
      solutionUrl: url,
    });
  } else {
    arrayRef.push({
      id: newId,
      title,
      url,
    });
  }

  adminPdfMsg.textContent =
    "PDF link added locally. Reload that chapter in Batches view to see it.";
  adminPdfTitle.value = "";
  adminPdfUrl.value = "";
});

// Delete PDF resource
adminDeletePdfBtn.addEventListener("click", () => {
  const sel =
    adminPdfChapterSelect.options[adminPdfChapterSelect.selectedIndex];
  if (!sel) {
    adminPdfMsg.textContent = "No chapter selected.";
    return;
  }
  const chapterId = sel.value;
  const batchId = sel.dataset.batchId;
  const subjectId = sel.dataset.subjectId;

  const type = adminPdfType.value;
  const resId = adminDeletePdfId.value.trim();
  if (!resId) {
    adminPdfMsg.textContent = "Enter PDF ID to delete (e.g. N1, D1, S1, T1).";
    return;
  }

  const chapter = getChapter(batchId, subjectId, chapterId);
  if (!chapter) {
    adminPdfMsg.textContent = "Chapter not found.";
    return;
  }

  let arrayRef;
  if (type === "notes") arrayRef = chapter.notes;
  else if (type === "dpp") arrayRef = chapter.dpp;
  else if (type === "solutions") arrayRef = chapter.solutions;
  else if (type === "tests") arrayRef = chapter.tests;

  if (!arrayRef) {
    adminPdfMsg.textContent = "No such resources in this chapter.";
    return;
  }

  const idx = arrayRef.findIndex((r) => r.id === resId);
  if (idx === -1) {
    adminPdfMsg.textContent = "PDF ID not found in this chapter.";
    return;
  }

  arrayRef.splice(idx, 1);
  adminPdfMsg.textContent =
    "PDF deleted locally. Reload that chapter in Batches view.";
  adminDeletePdfId.value = "";
});

// Announcements add/delete
adminAddAnnouncementBtn.addEventListener("click", () => {
  const title = adminAnnouncementTitle.value.trim();
  const body = adminAnnouncementBody.value.trim();
  if (!title || !body) {
    adminAnnouncementMsg.textContent = "Enter both title and message.";
    return;
  }

  const obj = { title, body, createdAt: Date.now() };
  announcements.push(obj);
  adminAnnouncementMsg.textContent =
    "Announcement added (local). It appears under the bell icon.";
  adminAnnouncementTitle.value = "";
  adminAnnouncementBody.value = "";

  populateAdminSelectors();
  renderAnnouncements();
  pushAnnouncementNotification(obj);
});

adminDeleteAnnouncementBtn.addEventListener("click", () => {
  const idx = parseInt(adminAnnouncementDeleteSelect.value, 10);
  if (isNaN(idx)) {
    adminAnnouncementMsg.textContent = "No announcement selected.";
    return;
  }
  announcements.splice(idx, 1);
  adminAnnouncementMsg.textContent = "Announcement deleted.";
  populateAdminSelectors();
  renderAnnouncements();
});

// Initial admin selector population
populateAdminSelectors();
renderAnnouncements();
