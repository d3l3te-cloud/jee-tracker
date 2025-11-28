// ===== Local data & state =====================================

// Initial demo data
const defaultCourseData = {
  batches: [
    {
      id: "class10-main",
      name: "Class 10 – Board Booster",
      classLevel: "10",
      subjects: [
        {
          id: "math10",
          name: "Mathematics",
          chapters: [
            {
              id: "math10-real",
              name: "Chapter 1: Real Numbers",
              description: "Euclid's division lemma, fundamental theorem of arithmetic…",
              lectures: [
                {
                  id: "L1",
                  title: "Introduction to Real Numbers",
                  youtubeId: "dQw4w9WgXcQ",
                },
              ],
              notes: [],
              dpp: [],
              solutions: [],
              tests: [],
            },
          ],
        },
      ],
    },
    {
      id: "class12-main",
      name: "Class 12 – Placeholder Batch",
      classLevel: "12",
      subjects: [],
    },
  ],
};

let courseData = loadFromStorage("praxis-course-data", defaultCourseData);
let userProgress = loadFromStorage("praxis-progress", {
  completedLectures: {},
});

let currentClassLevel = null;
let currentBatchId = null;
let currentSubjectId = null;
let currentChapterId = null;
let currentPlayingLectureKey = null;

// ===== Utility ================================================

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}
function loadFromStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
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

// ===== DOM shortcuts ==========================================

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// Views & nav
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

// Mobile nav toggle
const navToggle = qs("#navToggle");
const topbarEl = qs(".topbar");
if (navToggle && topbarEl) {
  navToggle.addEventListener("click", () => {
    topbarEl.classList.toggle("nav-open");
  });
}

// Theme toggle
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

// ===== Dashboard ==============================================

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
  // default to class 10
  openClass("10");
  switchView("courseView");
});

function switchView(viewId) {
  qsa(".topnav-item").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.view === viewId)
  );
  Object.entries(views).forEach(([id, el]) =>
    el.classList.toggle("active", id === viewId)
  );
}

// ===== Course view ============================================

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

// Tabs
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

// handle classes
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
      "<li class='muted small'>No chapters. Create from Admin panel.</li>";
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
      <div class="list-meta">YouTube</div>`;
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

// play lecture
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

// ===== Analysis ===============================================

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

// ===== Admin panel ============================================

// DOM refs
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

// Populate admin selects
function populateAdminSelectors() {
  // batches
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

function populateAdminSubjectSelects() {
  adminSubjectSelect.innerHTML = "";
  adminChapterSubject.innerHTML = "";
  lecSubject.innerHTML = "";
  resSubject.innerHTML = "";

  const batchId = adminSubjectBatch.value || (courseData.batches[0] && courseData.batches[0].id);
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
  arr.forEach((r, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = r.title;
    resSelect.appendChild(opt);
  });
}
resType.addEventListener("change", populateResourceDropdowns);
resChapter.addEventListener("change", populateResourceDropdowns);

// Batch actions
adminAddBatchBtn.addEventListener("click", () => {
  const level = adminBatchClass.value;
  const name = adminNewBatchName.value.trim();
  if (!name) {
    adminBatchMsg.textContent = "Enter batch name.";
    return;
  }
  const id = `${level}-${Date.now()}`;
  courseData.batches.push({
    id,
    name,
    classLevel: level,
    subjects: [],
  });
  adminNewBatchName.value = "";
  adminBatchMsg.textContent = "Batch created.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
});

adminDeleteBatchBtn.addEventListener("click", () => {
  const id = adminBatchSelect.value;
  const idx = courseData.batches.findIndex((b) => b.id === id);
  if (idx === -1) {
    adminBatchMsg.textContent = "Batch not found.";
    return;
  }
  courseData.batches.splice(idx, 1);
  adminBatchMsg.textContent = "Batch deleted.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
  renderChapterList();
});

// Subject actions
adminAddSubjectBtn.addEventListener("click", () => {
  const batchId = adminSubjectBatch.value;
  const name = adminNewSubjectName.value.trim();
  if (!batchId || !name) {
    adminSubjectMsg.textContent = "Select batch & enter subject name.";
    return;
  }
  const batch = getBatchById(batchId);
  if (!batch) {
    adminSubjectMsg.textContent = "Batch not found.";
    return;
  }
  const id = name.toLowerCase().replace(/\s+/g, "") + Date.now();
  batch.subjects.push({ id, name, chapters: [] });
  adminNewSubjectName.value = "";
  adminSubjectMsg.textContent = "Subject created.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
});

adminDeleteSubjectBtn.addEventListener("click", () => {
  const batchId = adminSubjectBatch.value;
  const subjId = adminSubjectSelect.value;
  const batch = getBatchById(batchId);
  if (!batch) {
    adminSubjectMsg.textContent = "Batch not found.";
    return;
  }
  const idx = batch.subjects.findIndex((s) => s.id === subjId);
  if (idx === -1) {
    adminSubjectMsg.textContent = "Subject not found.";
    return;
  }
  batch.subjects.splice(idx, 1);
  adminSubjectMsg.textContent = "Subject deleted.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
  renderChapterList();
});

// Chapter actions
adminAddChapterBtn.addEventListener("click", () => {
  const batchId = adminChapterBatch.value;
  const subjId = adminChapterSubject.value;
  const name = adminNewChapterName.value.trim();
  const desc = adminNewChapterDesc.value.trim();
  const batch = getBatchById(batchId);
  const subj = getSubject(batch, subjId);
  if (!batch || !subj) {
    adminChapterMsg.textContent = "Batch/subject not found.";
    return;
  }
  if (!name) {
    adminChapterMsg.textContent = "Enter chapter name.";
    return;
  }
  const id = name.toLowerCase().replace(/\s+/g, "-") + Date.now();
  subj.chapters.push({
    id,
    name,
    description: desc,
    lectures: [],
    notes: [],
    dpp: [],
    solutions: [],
    tests: [],
  });
  adminNewChapterName.value = "";
  adminNewChapterDesc.value = "";
  adminChapterMsg.textContent = "Chapter created.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
  renderChapterList();
});

adminDeleteChapterBtn.addEventListener("click", () => {
  const batchId = adminChapterBatch.value;
  const subjId = adminChapterSubject.value;
  const chapterId = adminChapterSelect.value;
  const batch = getBatchById(batchId);
  const subj = getSubject(batch, subjId);
  if (!subj) {
    adminChapterMsg.textContent = "Subject not found.";
    return;
  }
  const idx = subj.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) {
    adminChapterMsg.textContent = "Chapter not found.";
    return;
  }
  subj.chapters.splice(idx, 1);
  adminChapterMsg.textContent = "Chapter deleted.";
  saveToStorage("praxis-course-data", courseData);
  populateAdminSelectors();
  renderChapterList();
});

// Lecture actions
addLectureBtn.addEventListener("click", () => {
  const batchId = lecBatch.value;
  const subjId = lecSubject.value;
  const chapterId = lecChapter.value;
  const title = lecTitle.value.trim();
  const yt = lecYT.value.trim();
  if (!batchId || !subjId || !chapterId || !title || !yt) {
    adminLectureMsg.textContent = "Fill all lecture fields.";
    return;
  }
  const ch = getChapter(batchId, subjId, chapterId);
  if (!ch) {
    adminLectureMsg.textContent = "Chapter not found.";
    return;
  }
  const id = `L${Date.now()}`;
  ch.lectures.push({
    id,
    title,
    youtubeId: yt,
  });
  lecTitle.value = "";
  lecYT.value = "";
  adminLectureMsg.textContent = "Lecture added.";
  saveToStorage("praxis-course-data", courseData);
  populateLectureDropdowns();
  if (
    currentBatchId === batchId &&
    currentSubjectId === subjId &&
    currentChapterId === chapterId
  ) {
    renderChapterContent(ch);
  }
});

deleteLectureBtn.addEventListener("click", () => {
  const batchId = lecBatch.value;
  const subjId = lecSubject.value;
  const chapterId = lecChapter.value;
  const lectureId = lecSelect.value;
  const ch = getChapter(batchId, subjId, chapterId);
  if (!ch) {
    adminLectureMsg.textContent = "Chapter not found.";
    return;
  }
  const idx = ch.lectures.findIndex((l) => l.id === lectureId);
  if (idx === -1) {
    adminLectureMsg.textContent = "Lecture not found.";
    return;
  }
  ch.lectures.splice(idx, 1);
  adminLectureMsg.textContent = "Lecture deleted.";
  saveToStorage("praxis-course-data", courseData);
  populateLectureDropdowns();
  if (
    currentBatchId === batchId &&
    currentSubjectId === subjId &&
    currentChapterId === chapterId
  ) {
    renderChapterContent(ch);
  }
});

// Resource actions
addResBtn.addEventListener("click", () => {
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
  const ch = getChapter(batchId, subjId, chapterId);
  if (!ch) {
    adminResMsg.textContent = "Chapter not found.";
    return;
  }
  const obj = { title, url };
  if (type === "notes") ch.notes.push(obj);
  else if (type === "dpp") ch.dpp.push(obj);
  else if (type === "solutions") ch.solutions.push(obj);
  else ch.tests.push(obj);

  resTitle.value = "";
  resUrl.value = "";
  adminResMsg.textContent = "Resource added.";
  saveToStorage("praxis-course-data", courseData);
  populateResourceDropdowns();
  if (
    currentBatchId === batchId &&
    currentSubjectId === subjId &&
    currentChapterId === chapterId
  ) {
    const updated = getChapter(batchId, subjId, chapterId);
    renderChapterContent(updated);
  }
});

delResBtn.addEventListener("click", () => {
  const batchId = resBatch.value;
  const subjId = resSubject.value;
  const chapterId = resChapter.value;
  const type = resType.value;
  const idx = parseInt(resSelect.value, 10);
  const ch = getChapter(batchId, subjId, chapterId);
  if (!ch) {
    adminResMsg.textContent = "Chapter not found.";
    return;
  }
  let arr =
    type === "notes"
      ? ch.notes
      : type === "dpp"
      ? ch.dpp
      : type === "solutions"
      ? ch.solutions
      : ch.tests;
  if (isNaN(idx) || idx < 0 || idx >= arr.length) {
    adminResMsg.textContent = "Resource not found.";
    return;
  }
  arr.splice(idx, 1);
  adminResMsg.textContent = "Resource deleted.";
  saveToStorage("praxis-course-data", courseData);
  populateResourceDropdowns();
  if (
    currentBatchId === batchId &&
    currentSubjectId === subjId &&
    currentChapterId === chapterId
  ) {
    const updated = getChapter(batchId, subjId, chapterId);
    renderChapterContent(updated);
  }
});

// ===== Init ===================================================

function init() {
  populateAdminSelectors();
  updateOverallProgress();
}
init();
