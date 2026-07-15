import { firebaseConfig } from "./firebase-config.js";

/* 축하의 마음 방명록
 * - 이름 + 비밀번호(본인 삭제용) + 축하 글 + 사진(선택)
 * - 사진은 업로드 전 브라우저에서 리사이즈·압축해 Firestore 문서에 data URL로 저장(Storage/카드 불필요)
 * - 페이지네이션(커서 기반, 한 번에 한 페이지 이미지만 내려받음)
 * - config 미설정 시 "미리보기 모드"(이 기기에만 저장)로 동작 — 실서비스는 config 주입 후 배포 */

const SDK_VERSION = "10.14.1";
const APP_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`;
const FS_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`;
const SDK_TIMEOUT = 15000;

const PAGE = 4;
const IMG_MAX_LEN = 1000000; // data URL 문자 길이 상한(문서 1MiB 한도 안전 마진)
const IMG_TARGET_LEN = 720000; // 압축 목표 길이
const NAME_MAX = 20;
const MSG_MAX = 500;
const PW_MIN = 4;

const CONFIG_READY =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.length > 0 &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

const toast = (message) => {
  if (typeof window.showToast === "function") window.showToast(message);
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms)),
  ]);
}

/* ---------- 비밀번호 해시 (문서별 salt) ---------- */
function makeSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(`${salt || ""}::wed-gb::${pw}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- 이미지 압축 ---------- */
async function fileToBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through */
    }
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_LOAD"));
    };
    img.src = url;
  });
}

function drawToDataUrl(source, maxDim, quality) {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

async function compressImage(file) {
  const bitmap = await fileToBitmap(file);
  let maxDim = 1000;
  let quality = 0.75;
  let dataUrl = drawToDataUrl(bitmap, maxDim, quality);
  let guard = 0;
  while (dataUrl.length > IMG_TARGET_LEN && guard < 12) {
    if (quality > 0.45) {
      quality -= 0.08;
    } else {
      maxDim = Math.round(maxDim * 0.85);
      quality = 0.6;
    }
    if (maxDim < 320) break;
    dataUrl = drawToDataUrl(bitmap, maxDim, quality);
    guard += 1;
  }
  if (bitmap.close) bitmap.close();
  if (dataUrl.length > IMG_MAX_LEN) throw new Error("IMAGE_TOO_BIG");
  return dataUrl;
}

/* ---------- 저장소: Firebase ---------- */
async function makeFirebaseStore() {
  const [{ initializeApp }, fs] = await Promise.all([
    withTimeout(import(APP_URL), SDK_TIMEOUT, "app"),
    withTimeout(import(FS_URL), SDK_TIMEOUT, "firestore"),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const col = fs.collection(db, "guestbook");

  function toItem(docSnap) {
    const x = docSnap.data();
    return {
      id: docSnap.id,
      name: x.name || "",
      message: x.message || "",
      image: typeof x.image === "string" ? x.image : null,
      pwHash: x.pw || "",
      salt: x.salt || "",
      createdAt: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : null,
    };
  }

  return {
    mode: "firebase",
    async count() {
      const snap = await fs.getCountFromServer(col);
      return snap.data().count;
    },
    async list(after) {
      const base = [fs.orderBy("createdAt", "desc")];
      const q = after
        ? fs.query(col, ...base, fs.startAfter(after), fs.limit(PAGE))
        : fs.query(col, ...base, fs.limit(PAGE));
      const snap = await fs.getDocs(q);
      const items = snap.docs.map(toItem);
      const last = snap.docs[snap.docs.length - 1] || null;
      return { items, nextCursor: last, hasMore: snap.docs.length === PAGE };
    },
    async add({ name, message, pw, salt, image }) {
      await fs.addDoc(col, {
        name,
        message,
        pw,
        salt,
        image: image || null,
        createdAt: fs.serverTimestamp(),
      });
    },
    async remove(item, password) {
      const h = await hashPw(password, item.salt);
      if (h !== item.pwHash) return false;
      await fs.deleteDoc(fs.doc(db, "guestbook", item.id));
      return true;
    },
  };
}

/* ---------- 저장소: 미리보기(로컬) ---------- */
function makePreviewStore() {
  const KEY = "wed-guestbook-preview";
  const readAll = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  };
  const writeAll = (arr) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
    } catch {
      throw new Error("PREVIEW_QUOTA");
    }
  };

  return {
    mode: "preview",
    async count() {
      return readAll().length;
    },
    async list(after) {
      const all = readAll().sort((a, b) => b.createdAt - a.createdAt);
      const start = typeof after === "number" ? after : 0;
      const slice = all.slice(start, start + PAGE).map((x) => ({
        ...x,
        createdAt: new Date(x.createdAt),
      }));
      const next = start + PAGE;
      return { items: slice, nextCursor: next, hasMore: next < all.length };
    },
    async add({ name, message, pw, salt, image }) {
      const all = readAll();
      all.push({
        id: `p${Date.now()}_${Math.round(performance.now())}`,
        name,
        message,
        pwHash: pw,
        salt,
        image: image || null,
        createdAt: Date.now(),
      });
      writeAll(all);
    },
    async remove(item, password) {
      const h = await hashPw(password, item.salt);
      if (h !== item.pwHash) return false;
      writeAll(readAll().filter((x) => x.id !== item.id));
      return true;
    },
  };
}

/* ---------- DOM ---------- */
const mainEl = document.querySelector("main.invitation");
const feedEl = document.querySelector("[data-guestbook-feed]");
const pagerEl = document.querySelector("[data-guestbook-pager]");
const prevBtn = document.querySelector("[data-page-prev]");
const nextBtn = document.querySelector("[data-page-next]");
const pageInfo = document.querySelector("[data-page-info]");
const modeNote = document.querySelector("[data-guestbook-mode]");

const toggleBtn = document.querySelector("[data-guestbook-toggle]");
const compose = document.querySelector("[data-guestbook-compose]");
const closeButtons = document.querySelectorAll("[data-guestbook-close]");
const form = document.querySelector("[data-guestbook-form]");
const errorEl = document.querySelector("[data-compose-error]");
const submitBtn = document.querySelector("[data-compose-submit]");
const photoInput = document.querySelector("[data-photo-input]");
const photoPreview = document.querySelector("[data-photo-preview]");
const photoPreviewImg = document.querySelector("[data-photo-preview-img]");
const photoRemove = document.querySelector("[data-photo-remove]");
const photoPickLabel = document.querySelector(".photo-pick-label");

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

let store = null;
let selectedFile = null;
let previewUrl = null;
const pageCursors = { 1: null };
const paginator = { page: 1, totalPages: 1 };

function renderStatus(message) {
  if (!feedEl) return;
  feedEl.replaceChildren();
  const p = document.createElement("p");
  p.className = "guestbook-status";
  p.textContent = message;
  feedEl.append(p);
}

function safeImageSrc(value) {
  return typeof value === "string" && value.startsWith("data:image/") ? value : null;
}

function makeCard(item) {
  const article = document.createElement("article");
  article.className = "gb-card";

  const src = safeImageSrc(item.image);
  if (src) {
    const photo = document.createElement("div");
    photo.className = "gb-photo";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = `${item.name || "축하 손님"}님이 남긴 사진`;
    img.src = src;
    photo.append(img);
    article.append(photo);
  }

  const body = document.createElement("div");
  body.className = "gb-body";

  const head = document.createElement("header");
  head.className = "gb-head";
  const name = document.createElement("strong");
  name.className = "gb-name";
  name.textContent = item.name || "축하 손님";
  const time = document.createElement("time");
  time.className = "gb-date";
  if (item.createdAt) {
    time.dateTime = item.createdAt.toISOString();
    time.textContent = dateFormatter.format(item.createdAt);
  }
  head.append(name, time);
  body.append(head);

  if (item.message) {
    const msg = document.createElement("p");
    msg.className = "gb-msg";
    msg.textContent = item.message;
    body.append(msg);
  }

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "gb-delete";
  delBtn.textContent = "삭제";

  const delRow = document.createElement("div");
  delRow.className = "gb-delrow";
  delRow.hidden = true;
  const pwInput = document.createElement("input");
  pwInput.type = "password";
  pwInput.className = "gb-delpw";
  pwInput.maxLength = 128;
  pwInput.placeholder = "비밀번호";
  pwInput.autocomplete = "off";
  pwInput.setAttribute("aria-label", "글 삭제 비밀번호");
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "gb-delconfirm";
  confirmBtn.textContent = "삭제";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "gb-delcancel";
  cancelBtn.textContent = "취소";
  delRow.append(pwInput, confirmBtn, cancelBtn);

  delBtn.addEventListener("click", () => {
    delRow.hidden = false;
    delBtn.hidden = true;
    pwInput.focus();
  });
  cancelBtn.addEventListener("click", () => {
    delRow.hidden = true;
    delBtn.hidden = false;
    pwInput.value = "";
  });
  confirmBtn.addEventListener("click", async () => {
    if (!pwInput.value) {
      toast("비밀번호를 입력해주세요.");
      pwInput.focus();
      return;
    }
    confirmBtn.disabled = true;
    let removed = false;
    try {
      removed = await store.remove(item, pwInput.value);
    } catch (err) {
      console.error(err);
      toast("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
      confirmBtn.disabled = false;
      return;
    }
    if (!removed) {
      toast("비밀번호가 일치하지 않습니다.");
      confirmBtn.disabled = false;
      return;
    }
    toast("삭제했습니다.");
    try {
      await refreshAfterDelete();
    } catch (err) {
      console.error(err);
      article.remove(); // 삭제는 성공했으므로 최소한 화면에서 제거
    }
  });

  body.append(delBtn, delRow);
  article.append(body);
  return article;
}

function renderFeed(items, total) {
  if (!feedEl) return;
  if (!items.length) {
    renderStatus(
      total
        ? "이 페이지에는 축하 글이 없습니다."
        : "아직 남겨진 축하 글이 없습니다. 첫 번째 마음을 남겨주세요.",
    );
    return;
  }
  feedEl.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "gb-list-heading";
  const title = document.createElement("strong");
  title.textContent = "도착한 축하 글";
  const count = document.createElement("span");
  count.textContent = `${total}개의 마음`;
  heading.append(title, count);
  feedEl.append(heading);
  items.forEach((item) => feedEl.append(makeCard(item)));
}

function updatePager(hasMore) {
  if (!pagerEl) return;
  const multi = paginator.totalPages > 1;
  pagerEl.hidden = !multi;
  if (prevBtn) prevBtn.disabled = paginator.page <= 1;
  if (nextBtn) nextBtn.disabled = paginator.page >= paginator.totalPages || !hasMore;
  if (pageInfo) pageInfo.textContent = `${paginator.page} / ${paginator.totalPages}`;
}

async function showPage(target, options = {}) {
  if (!store) return;
  if (options.reset) {
    for (const key of Object.keys(pageCursors)) delete pageCursors[key];
    pageCursors[1] = null;
    target = 1;
  }
  const total = await store.count();
  paginator.totalPages = Math.max(1, Math.ceil(total / PAGE));
  if (target > paginator.totalPages) target = paginator.totalPages;
  if (target < 1) target = 1;
  const after = target === 1 ? null : pageCursors[target] ?? null;
  const { items, nextCursor, hasMore } = await store.list(after);
  pageCursors[target + 1] = nextCursor;
  paginator.page = target;
  renderFeed(items, total);
  updatePager(hasMore);
}

async function refreshAfterDelete() {
  const total = await store.count();
  paginator.totalPages = Math.max(1, Math.ceil(total / PAGE));
  let target = Math.min(paginator.page, paginator.totalPages);
  const after = target === 1 ? null : pageCursors[target] ?? null;
  const { items, nextCursor, hasMore } = await store.list(after);
  if (!items.length && target > 1) {
    await showPage(target - 1);
    return;
  }
  pageCursors[target + 1] = nextCursor;
  paginator.page = target;
  renderFeed(items, total);
  updatePager(hasMore);
}

prevBtn?.addEventListener("click", () => {
  if (paginator.page > 1) showPage(paginator.page - 1).catch(handlePageError);
});
nextBtn?.addEventListener("click", () => {
  if (paginator.page < paginator.totalPages) showPage(paginator.page + 1).catch(handlePageError);
});

function handlePageError(err) {
  console.error(err);
  renderStatus("축하 글을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
}

/* ---------- 작성창(모달) ---------- */
function syncComposeViewport() {
  if (!compose || compose.hidden || !window.visualViewport) return;
  const vv = window.visualViewport;
  compose.style.top = `${vv.offsetTop}px`;
  compose.style.height = `${vv.height}px`;
  compose.style.bottom = "auto";
}

function resetComposeViewport() {
  if (!compose) return;
  compose.style.top = "";
  compose.style.height = "";
  compose.style.bottom = "";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncComposeViewport);
  window.visualViewport.addEventListener("scroll", syncComposeViewport);
}

function setComposeOpen(open) {
  if (!compose || !toggleBtn) return;
  compose.hidden = !open;
  document.body.classList.toggle("guestbook-is-open", open);
  toggleBtn.setAttribute("aria-expanded", String(open));
  if (mainEl) mainEl.inert = open; // 배경 콘텐츠 포커스/AT 차단
  if (open) {
    syncComposeViewport();
    // 사용자 제스처 안에서 동기 포커스 → iOS에서 키보드 즉시 표시
    form?.querySelector("input[name='name']")?.focus();
  } else {
    resetComposeViewport();
    toggleBtn.focus();
  }
}

toggleBtn?.addEventListener("click", () => setComposeOpen(true));
closeButtons.forEach((btn) => btn.addEventListener("click", () => setComposeOpen(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && compose && !compose.hidden) setComposeOpen(false);
});

/* ---------- 사진 선택 ---------- */
function clearPhoto() {
  selectedFile = null;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  if (photoInput) photoInput.value = "";
  if (photoPreview) photoPreview.hidden = true;
  if (photoPreviewImg) photoPreviewImg.removeAttribute("src");
  if (photoPickLabel) photoPickLabel.textContent = "사진 선택";
}

photoInput?.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) {
    clearPhoto();
    return;
  }
  // 일부 정상 이미지(HEIC 등)는 type이 빈 문자열 → 디코딩 단계에서 최종 판정
  if (file.type && !file.type.startsWith("image/")) {
    showError("이미지 파일만 첨부할 수 있습니다.");
    clearPhoto();
    return;
  }
  clearError();
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  if (photoPreviewImg) photoPreviewImg.src = previewUrl;
  if (photoPreview) photoPreview.hidden = false;
  if (photoPickLabel) photoPickLabel.textContent = "다른 사진 선택";
});

photoRemove?.addEventListener("click", clearPhoto);

/* ---------- 오류 표시 ---------- */
function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}
function clearError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = "";
}

/* ---------- 작성 제출 ---------- */
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!store) {
    showError("지금은 축하 글을 등록할 수 없습니다. 잠시 후 다시 시도해주세요.");
    return;
  }
  if (submitBtn.disabled) return; // 중복 제출 방지
  clearError();

  const name = form.name.value.trim();
  const password = form.password.value;
  const message = form.message.value.trim();

  if (!name) return showError("이름을 입력해주세요.");
  if (name.length > NAME_MAX) return showError(`이름은 ${NAME_MAX}자 이내로 입력해주세요.`);
  if (password.length < PW_MIN) return showError(`비밀번호를 ${PW_MIN}자 이상 입력해주세요.`);
  if (message.length > MSG_MAX) return showError(`축하 글은 ${MSG_MAX}자 이내로 입력해주세요.`);
  if (!message && !selectedFile) return showError("축하 글이나 사진을 남겨주세요.");

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "등록 중…";

  try {
    let image = null;
    if (selectedFile) {
      submitBtn.textContent = "사진 처리 중…";
      image = await compressImage(selectedFile);
    }
    const salt = makeSalt();
    const pw = await hashPw(password, salt);
    submitBtn.textContent = "등록 중…";
    await store.add({ name, message, pw, salt, image });
    form.reset();
    clearPhoto();
    setComposeOpen(false);
    toast("축하 글을 남겼습니다. 감사합니다.");
    await showPage(1, { reset: true });
  } catch (err) {
    console.error(err);
    if (err.message === "IMAGE_TOO_BIG") {
      showError("사진 용량이 너무 커서 등록하지 못했습니다. 다른 사진을 선택해주세요.");
    } else if (err.message === "IMAGE_LOAD") {
      showError("사진을 불러오지 못했습니다. 다른 사진을 선택해주세요.");
    } else if (err.message === "PREVIEW_QUOTA") {
      showError("미리보기 저장 공간이 가득 찼습니다. (실서비스에서는 제한 없이 저장됩니다)");
    } else {
      showError("등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

/* ---------- 초기화 ---------- */
function disableComposeWithError(message) {
  if (toggleBtn) toggleBtn.disabled = true;
  if (modeNote) {
    modeNote.hidden = false;
    modeNote.textContent = message;
    modeNote.classList.add("is-error");
  }
}

async function init() {
  if (!feedEl) return;
  try {
    store = CONFIG_READY ? await makeFirebaseStore() : makePreviewStore();
  } catch (err) {
    console.error(err);
    renderStatus("방명록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    disableComposeWithError("지금은 축하 글을 등록할 수 없습니다. 네트워크 상태를 확인한 뒤 새로고침해주세요.");
    return;
  }
  if (store.mode === "preview" && modeNote) {
    modeNote.hidden = false;
    modeNote.textContent = "미리보기 모드 · 이 기기에만 저장됩니다 (실서비스 준비 중)";
  }
  await showPage(1, { reset: true });
}

init().catch(handlePageError);
