import { firebaseConfig } from "./firebase-config.js";

/* 참석 의사 전달 (RSVP)
 * - 스몰웨딩 참석 인원 정확 파악: 참석여부 / 대표자 / 신랑·신부측 / 연락처 / 총인원 / 참석자 이름목록 / 전달사항
 * - 저장: Firestore 컬렉션 rsvp_submissions (방명록과 완전 독립). config 미설정 시 preview(localStorage) 폴백.
 * - 개인정보(이름·연락처) 수집 → 공개 조회 금지. 규칙(firestore.rules)에서 read:false.
 * - 핵심 검증: 참석가능이면 party_size>=1 && 이름목록 개수==party_size, 이름 공란 불가.
 */

const SDK_VERSION = "10.14.1";
const APP_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`;
const FS_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`;
const SDK_TIMEOUT = 15000;

const NAME_MAX = 20;
const MSG_MAX = 200;
const PARTY_MAX = 20;
const SOURCE = "wedding_invitation_web";
const COLLECTION = "rsvp_submissions";
const PREVIEW_KEY = "wed-rsvp-preview";

const CONFIG_READY =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.length > 0 &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

// §13 운영 환경 판별: 오직 localhost/127.0.0.1(또는 명시적 ?rsvp_dev)에서만 preview(localStorage) 허용.
// 운영(GitHub Pages 등)에서는 Firebase 실패 시 preview 폴백/가짜 성공 절대 금지 → 제출 불가.
const IS_DEV =
  ["localhost", "127.0.0.1"].includes(location.hostname) ||
  new URLSearchParams(location.search).has("rsvp_dev");

const toast = (message) => {
  if (typeof window.showToast === "function") window.showToast(message);
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms)),
  ]);
}

function normalizePhone(raw) {
  return (raw || "").replace(/[^0-9]/g, "");
}

/* ---------- 저장소: Firebase ---------- */
async function makeFirebaseStore() {
  const [{ initializeApp }, fs] = await Promise.all([
    withTimeout(import(APP_URL), SDK_TIMEOUT, "app"),
    withTimeout(import(FS_URL), SDK_TIMEOUT, "firestore"),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const col = fs.collection(db, COLLECTION);
  return {
    mode: "firebase",
    async add(payload) {
      // 원장(연락처 포함) — 비공개(read:false). 신랑/신부만 인증 후 관리자 화면/콘솔에서 열람.
      await fs.addDoc(col, {
        ...payload,
        created_at: fs.serverTimestamp(),
        updated_at: fs.serverTimestamp(),
      });
    },
  };
}

/* ---------- 저장소: 미리보기(로컬) ---------- */
function makePreviewStore() {
  return {
    mode: "preview",
    async add(payload) {
      let all = [];
      try {
        all = JSON.parse(localStorage.getItem(PREVIEW_KEY)) || [];
      } catch {
        all = [];
      }
      all.push({ ...payload, created_at: Date.now(), updated_at: Date.now() });
      try {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(all));
      } catch {
        throw new Error("PREVIEW_QUOTA");
      }
    },
  };
}

/* ---------- DOM ---------- */
const mainEl = document.querySelector("main.invitation");
const section = document.querySelector(".rsvp-section");
const toggleBtn = document.querySelector("[data-rsvp-toggle]");
const modal = document.querySelector("[data-rsvp-modal]");
const panel = modal?.querySelector(".rsvp-panel");
const closeButtons = document.querySelectorAll("[data-rsvp-close]");
const form = document.querySelector("[data-rsvp-form]");
const commonBox = document.querySelector("[data-rsvp-common]");
const attendingBox = document.querySelector("[data-rsvp-attending]");
const decliningBox = document.querySelector("[data-rsvp-declining]");
const attendeesBox = document.querySelector("[data-rsvp-attendees]");
const partyInput = form?.querySelector("input[name='party_size']");
const minusBtn = document.querySelector("[data-rsvp-minus]");
const plusBtn = document.querySelector("[data-rsvp-plus]");
const errorEl = document.querySelector("[data-rsvp-error]");
const submitBtn = document.querySelector("[data-rsvp-submit]");
const modeNote = document.querySelector("[data-rsvp-mode]");
const successEl = document.querySelector("[data-rsvp-success]");
const successTitle = document.querySelector("[data-rsvp-success-title]");
const againBtn = document.querySelector("[data-rsvp-again]");

let store = null;
let submitting = false;
let attendeeNames = [""];
let lastAutoName = "";

/* ---------- 상태 분기 ---------- */
function currentStatus() {
  const checked = form?.querySelector("input[name='status']:checked");
  return checked ? checked.value : "";
}

function applyStatus() {
  const status = currentStatus();
  if (commonBox) commonBox.hidden = !status;
  if (attendingBox) attendingBox.hidden = status !== "attending";
  if (decliningBox) decliningBox.hidden = status !== "not_attending";
  if (submitBtn) {
    submitBtn.textContent = status === "not_attending" ? "응답 전달하기" : "참석 의사 전달하기";
  }
  if (status === "attending") renderAttendees();
}

/* ---------- 참석자 이름란 ---------- */
function partySize() {
  const n = parseInt(partyInput?.value || "1", 10);
  return Number.isFinite(n) ? Math.min(PARTY_MAX, Math.max(1, n)) : 1;
}

function setPartySize(n) {
  const size = Math.min(PARTY_MAX, Math.max(1, n));
  if (partyInput) partyInput.value = String(size);
  if (attendeeNames.length < size) {
    while (attendeeNames.length < size) attendeeNames.push("");
  } else if (attendeeNames.length > size) {
    attendeeNames = attendeeNames.slice(0, size);
  }
  renderAttendees();
}

function renderAttendees() {
  if (!attendeesBox) return;
  const size = partySize();
  while (attendeeNames.length < size) attendeeNames.push("");
  attendeeNames = attendeeNames.slice(0, size);
  attendeesBox.replaceChildren();
  for (let i = 0; i < size; i += 1) {
    const row = document.createElement("label");
    row.className = "rsvp-attendee-row";
    const tag = document.createElement("span");
    tag.className = "rsvp-attendee-tag";
    tag.textContent = `참석자 ${i + 1}`;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = NAME_MAX;
    input.className = "rsvp-attendee-input";
    input.value = attendeeNames[i] || "";
    input.placeholder = i === 0 ? "대표자 본인 이름" : "함께 오시는 분 이름";
    input.setAttribute("aria-label", `참석자 ${i + 1} 이름`);
    input.addEventListener("input", () => {
      attendeeNames[i] = input.value;
      if (i === 0) lastAutoName = ""; // 사용자가 직접 수정하면 자동채움 해제
    });
    row.append(tag, input);
    attendeesBox.append(row);
  }
}

/* 대표자 성함 입력 → 첫 참석자 자동 반영(사용자가 직접 안 바꾼 경우) */
function syncRespondentToFirstAttendee() {
  const nameInput = form?.querySelector("input[name='respondent_name']");
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (attendeeNames.length === 0) attendeeNames = [""];
  if (!attendeeNames[0] || attendeeNames[0] === lastAutoName) {
    attendeeNames[0] = name;
    lastAutoName = name;
    if (currentStatus() === "attending") renderAttendees();
  }
}

/* ---------- 오류 ---------- */
function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function clearError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = "";
}

/* ---------- 모달 열고 닫기 (iOS 키보드/inert 대응) ---------- */
function syncViewport() {
  if (!modal || modal.hidden || !window.visualViewport) return;
  const vv = window.visualViewport;
  modal.style.top = `${vv.offsetTop}px`;
  modal.style.height = `${vv.height}px`;
  modal.style.bottom = "auto";
}
function resetViewport() {
  if (!modal) return;
  modal.style.top = "";
  modal.style.height = "";
  modal.style.bottom = "";
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}

function closeGuestbookIfOpen() {
  const gb = document.querySelector("[data-guestbook-compose]");
  if (gb && !gb.hidden) {
    const btn = gb.querySelector("[data-guestbook-close]");
    if (btn) btn.click();
  }
}

function setOpen(open) {
  if (!modal || !toggleBtn) return;
  if (open) closeGuestbookIfOpen();
  modal.hidden = !open;
  document.body.classList.toggle("rsvp-is-open", open);
  toggleBtn.setAttribute("aria-expanded", String(open));
  if (mainEl) mainEl.inert = open;
  if (open) {
    syncViewport();
    if (panel) panel.focus();
  } else {
    resetViewport();
    toggleBtn.focus();
  }
}

function resetForm() {
  if (form) form.reset();
  attendeeNames = [""];
  lastAutoName = "";
  if (partyInput) partyInput.value = "1";
  clearError();
  applyStatus();
  if (successEl) successEl.hidden = true;
  if (form) form.hidden = false;
  if (commonBox) commonBox.hidden = true;
}

/* ---------- 제출 ---------- */
async function handleSubmit(event) {
  event.preventDefault();
  if (submitting) return;
  clearError();
  // §13: 운영에서는 Firebase가 준비돼야만 제출 가능(폴백/가짜성공 없음). 실패 시 재시도 안내.
  const activeStore = await ensureStore();
  if (!activeStore) {
    return showError("현재 참석 의사를 전달할 수 없습니다.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  const status = currentStatus();
  if (!status) return showError("참석 여부를 선택해 주세요.");

  const respondentName = (form.respondent_name.value || "").trim();
  const sideChecked = form.querySelector("input[name='side']:checked");
  const side = sideChecked ? sideChecked.value : "";
  const phoneDigits = normalizePhone(form.phone.value);
  const consent = form.privacy_consent.checked;

  if (!respondentName) return showError("성함을 입력해 주세요.");
  if (respondentName.length > NAME_MAX) return showError(`성함은 ${NAME_MAX}자 이내로 입력해 주세요.`);
  if (!side) return showError("신랑측 / 신부측을 선택해 주세요.");
  if (phoneDigits.length < 9 || phoneDigits.length > 11) return showError("연락 가능한 휴대폰 번호를 정확히 입력해 주세요.");

  let partyCount = 0;
  let attendees = [];
  let message = "";

  if (status === "attending") {
    partyCount = partySize();
    if (partyCount < 1) return showError("총 참석 인원은 1명 이상이어야 해요.");
    const names = attendeeNames.slice(0, partyCount).map((n) => (n || "").trim());
    if (names.length !== partyCount || names.some((n) => !n)) {
      return showError(`참석자 이름을 인원 수(${partyCount}명)만큼 모두 입력해 주세요.`);
    }
    attendees = names.map((n) => ({ name: n }));
    message = (form.message_attending.value || "").trim();
  } else {
    partyCount = 0;
    attendees = [];
    message = (form.message_declining.value || "").trim();
  }
  if (message.length > MSG_MAX) return showError(`전달사항은 ${MSG_MAX}자 이내로 입력해 주세요.`);

  // 개인정보 동의는 최종 게이트(모든 항목 확인 후 마지막에 확인)
  if (!consent) return showError("개인정보 수집·이용에 동의해 주셔야 전달할 수 있어요.");

  const payload = {
    status,
    side,
    respondent_name: respondentName,
    phone: phoneDigits,
    party_size: partyCount,
    attendees,
    message,
    privacy_consent: true,
    source: SOURCE,
  };

  submitting = true;
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "전송 중입니다…";

  try {
    // §13: 오프라인/차단 시 Firestore는 즉시 실패하지 않고 대기할 수 있으므로 타임아웃으로 실패 처리.
    await withTimeout(activeStore.add(payload), SDK_TIMEOUT, "submit");
    showSuccess(status);
  } catch (err) {
    console.error(err);
    if (err.message === "PREVIEW_QUOTA") {
      showError("미리보기 저장 공간이 가득 찼습니다. (실서비스에서는 제한 없이 저장됩니다)");
    } else {
      showError("현재 참석 의사를 전달할 수 없습니다.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
    }
  } finally {
    submitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function showSuccess(status) {
  if (form) form.hidden = true;
  if (successEl) successEl.hidden = false;
  if (successTitle) {
    successTitle.textContent =
      status === "not_attending"
        ? "응답이 정상적으로 전달되었습니다."
        : "참석 의사가 정상적으로 전달되었습니다.";
  }
  const sub = document.querySelector(".rsvp-success-sub");
  if (sub) {
    sub.textContent = status === "not_attending" ? "마음 전해주셔서 감사합니다." : "소중한 답변 감사합니다.";
  }
}

/* ---------- 이벤트 ---------- */
form?.querySelectorAll("input[name='status']").forEach((r) => r.addEventListener("change", () => {
  clearError();
  applyStatus();
}));
form?.querySelector("input[name='respondent_name']")?.addEventListener("input", syncRespondentToFirstAttendee);
minusBtn?.addEventListener("click", () => setPartySize(partySize() - 1));
plusBtn?.addEventListener("click", () => setPartySize(partySize() + 1));
form?.querySelector("input[name='phone']")?.addEventListener("input", (e) => {
  // 숫자·하이픈만 남겨 입력 보정(저장은 숫자만)
  e.target.value = e.target.value.replace(/[^0-9-]/g, "");
});
form?.addEventListener("submit", handleSubmit);
againBtn?.addEventListener("click", resetForm);

toggleBtn?.addEventListener("click", () => { resetForm(); setOpen(true); });
closeButtons.forEach((b) => b.addEventListener("click", () => setOpen(false)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.hidden) setOpen(false);
});
// 포커스 트랩
modal?.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || modal.hidden) return;
  const nodes = [...modal.querySelectorAll('button, input, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
// 방명록 열리면 RSVP 닫기(오버레이 하나만)
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-guestbook-toggle]");
  if (t && modal && !modal.hidden) setOpen(false);
}, true);

/* ---------- 저장소 확보 (§13: 운영은 Firebase만, 실패 시 폴백 없음) ---------- */
async function ensureStore() {
  if (store) return store;
  if (CONFIG_READY) {
    try {
      store = await makeFirebaseStore();
      return store;
    } catch (err) {
      console.error("firebase init failed", err);
      store = null;
    }
  }
  // preview(localStorage)는 개발 환경에서만. 운영에서는 절대 폴백하지 않는다.
  if (!store && IS_DEV) store = makePreviewStore();
  return store;
}

/* ---------- 초기화 ---------- */
async function init() {
  if (!section || !toggleBtn) return;
  await ensureStore();
  if (store && store.mode === "preview" && modeNote) {
    modeNote.hidden = false;
    modeNote.textContent = "미리보기 모드 · 이 기기에만 저장됩니다 (개발 환경 전용)";
  }
  applyStatus();
}

init();
