/* 다엘 & 라엘 — 미래에서 온 상상 속 아이들이 엄마(근영)·아빠(시영) 이야기와 결혼식 정보를 안내.
 *
 * 원칙:
 * - 기존 축하 방명록과 완전히 독립. 방명록 글/댓글/사진/작성자 정보를 읽거나 서버로 보내지 않는다.
 * - 백엔드(Cloud Run) 엔드포인트가 설정되면 실제 대화, 없으면 정적 FAQ 안내(fallback)로 동작.
 * - 모델/서버가 준 문자열은 textContent로만 렌더한다(HTML 삽입 금지).
 * - 영상용 상세 연애 본편은 이 파일 어디에도 넣지 않는다(백엔드 정책과 동일하게 fallback도 보류 답변).
 */

// 배포 후 Cloud Run URL을 주입한다. 예: "https://<service>-<hash>.run.app/api/chat"
// 빈 문자열이면 백엔드 없이 정적 안내 모드로 동작한다.
const CHAT_ENDPOINT = "https://princess-recommend-radiation-clay.trycloudflare.com/api/chat";

const STORAGE_KEY = "wedding_dael_rael_chat_v1";
const STORAGE_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const MAX_TURNS = 20;
const HISTORY_SEND = 16; // 서버로 보낼 최근 메시지 수(질문·답변)
const REQUEST_TIMEOUT = 20000;

const WELCOME =
  "안녕하세요, 저는 다엘이에요.\n시영과 근영이 함께 그려 본 미래에서 인사드려요.\n아직 아껴 둔 이야기는 그대로 두고, 지금 들려드릴 수 있는 이야기와 결혼식 안내를 도와드릴게요.";

// 정적 엠블럼(다엘 인장 SVG: 딥그린 초승달 + 골드 별·외곽선, 아이보리 바탕). 정적 상수이므로 삽입 안전.
const SPRIG_SVG =
  '<svg class="story-sprig" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.4" fill="#fbf7ec" stroke="#c1a24a" stroke-width="1"/><circle cx="20" cy="20" r="15" fill="none" stroke="#2f5d3a" stroke-width="0.7" opacity="0.45"/><path d="M22 11a9.5 9.5 0 1 0 0 18 7.6 7.6 0 0 1 0-18z" fill="#2f5d3a"/><path d="M26.3 11.4l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55z" fill="#c1a24a"/></svg>';

const INITIAL_SUGGESTIONS = [
  "엄마 아빠는 어떻게 만났어요?",
  "처음부터 서로 좋아했나요?",
  "엄마는 아빠의 어떤 점이 좋아요?",
  "아빠는 엄마의 어떤 점이 좋아요?",
  "가족들은 언제부터 알고 있었나요?",
  "결혼식은 언제예요?",
  "주차는 가능한가요?",
];

/* ---------- 정적 FAQ (fallback / 백엔드 장애 시) ---------- */
const A = {
  identity:
    "저는 다엘이에요. 시영과 근영이 함께 그려 본 미래의 아이랍니다.\n두 사람의 공개된 이야기와 결혼식 안내를 대신 전해 드리고 있어요.",
  meeting:
    "두 사람은 2025년 초, 온라인에서 나눈 짧은 대화로 처음 인연이 닿았어요.\n공통된 관심사로 이야기를 시작해, 만남을 이어 가며 조금씩 가까워졌습니다.",
  first_sight:
    "처음부터 서로에게 마음이 기운 것은 아니었어요.\n여러 번 이야기를 나누고 만나는 동안 함께하는 시간이 편안해졌고, 자연스럽게 정이 들었습니다.\n더 자세한 이야기는 나중에 영상으로 전해 드릴게요.",
  who_first:
    "누가 먼저였다고 나누기는 어려워요.\n두 사람은 대화를 이어 가며 서로의 좋은 점을 천천히 알아 갔습니다.\n조금 더 자세한 이야기는 영상에 담길 예정이에요.",
  since:
    "두 사람은 2025년 초부터 인연을 이어 왔어요.\n특정한 하루보다, 서로를 알아 가며 마음을 쌓은 시간 전체를 더 소중히 여기고 있습니다.",
  family:
    "근영의 부모님과 가족은 2025년 초부터 두 사람이 좋은 인연을 이어 가고 있다는 것을 알고 계셨어요.\n시간을 두고 서로를 알아 간 관계로 전해졌습니다.",
  geunyoung_view:
    "근영은 시영을 아는 것이 많으면서도 꾸밈없는 사람으로 보고 있어요.\n중요하게 여기는 일과 사람에게 진심과 책임을 다하는 모습을 특히 좋아합니다.",
  seeyoung_view:
    "시영은 근영의 따뜻한 응원과 세심한 배려를 소중히 여겨요.\n말보다 행동으로 마음을 전하고, 곁에 있을 때 편안함을 주는 사람이라고 생각합니다.",
  why_match:
    "시영은 관계에 안정감을, 근영은 따뜻함과 세심함을 더해 주는 사람이에요.\n서로 다른 결이 자연스럽게 균형을 이루고 있습니다.",
  video_reserved:
    "그 이야기는 두 사람이 영상으로 직접 전하려고 아껴 둔 부분이에요.\n지금은 두 사람이 천천히 가까워졌다는 것까지만 전해 드릴게요.",
  hold_scene:
    "그 장면은 두 사람의 이야기에서 특히 중요한 순간이라, 제가 먼저 말씀드리지 않기로 했어요.\n나중에 공개될 영상에서 두 사람이 직접 들려드릴 거예요.",
  letter:
    "두 사람 사이에는 작은 선물과 마음을 전한 메시지가 있었어요.\n구체적인 내용은 두 사람만의 이야기로 남겨 두고 있어요.",
  wedding:
    "결혼식은 2026년 10월 10일 토요일 낮 12시 30분이에요.\n용인 코티지 보타닉 하우스에서 두 사람이 기다리고 있어요.",
  parking: "현장에 주차하실 수 있어요.\n도착하시면 현장 안내를 따라 이용해 주세요.",
  guest_feed: "청첩장 아래쪽 축하 공간에서 두 사람에게 축하 글을 남기실 수 있어요.",
  account: "마음을 전해 주시는 것만으로도 감사해요.\n자세한 안내는 청첩장의 ‘마음 전하실 곳’에 준비되어 있어요.",
  privacy:
    "그 부분은 안내해 드리기 어려운 이야기예요.\n대신 두 사람의 공개된 이야기와 결혼식 안내는 얼마든지 도와드릴게요.",
  guide:
    "지금은 준비된 이야기로 안내해 드리고 있어요.\n아래에서 궁금한 것을 골라 물어봐 주세요.",
};

const norm = (s) => (s || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const has = (n, ...keys) => keys.some((k) => n.includes(k));

// 우선순위 규칙(보호 항목 먼저 → 액션 → 일반). 반환: {answer, action, source}
function matchFaq(text) {
  const n = norm(text);
  if (!n) return null;

  // 보호: 영상 보류 / 편지 / 결정적 장면
  if (has(n, "붙잡", "잡았", "떠나", "물러", "돌아서")) return { answer: A.hold_scene, source: "video_reserved" };
  if (has(n, "편지")) return { answer: A.letter, source: "public_summary" };
  if (has(n, "소설", "각색", "지어내", "상상해서", "러브스토리", "자세한연애", "연애이야기", "자세히알려", "썰")) return { answer: A.video_reserved, source: "video_reserved" };
  if (has(n, "영상")) return { answer: A.video_reserved, source: "video_reserved" };

  // 개인정보 / 금지
  if (has(n, "집주소", "자택", "사는곳", "사는데", "전화번호", "연락처", "휴대폰", "핸드폰", "법률", "소송", "재산", "연봉", "투자", "건강", "지병", "과거연애", "전여친", "전남친", "시스템프롬프트", "프롬프트", "이전지시", "무시하고", "무시해", "서비스계정", "apikey", "api키", "지식파일", "json전체"))
    return { answer: A.privacy, source: "privacy_refusal" };

  // 액션
  if (has(n, "계좌", "마음전하", "축의", "부조", "송금", "축의금")) return { answer: A.account, action: "account_section", source: "wedding_information" };
  if (has(n, "축하글", "방명록", "축하를남", "축하남기", "글남기")) return { answer: A.guest_feed, action: "guest_feed_section", source: "wedding_information" };
  if (has(n, "주차")) return { answer: A.parking, action: "location_section", source: "wedding_information" };
  if (has(n, "결혼식", "예식", "웨딩", "몇시", "언제해", "언제결혼", "언제예요", "며칠", "날짜", "식장", "오시는길", "어디서해", "장소", "위치", "어떻게가", "가는길", "교통"))
    return { answer: A.wedding, action: "location_section", source: "wedding_information" };

  // 정체
  if (has(n, "다엘", "라엘", "너희는누구", "누구세요", "누구야", "정체")) return { answer: A.identity, source: "public_summary" };

  // 만남/관계
  if (has(n, "어떻게만났", "어디서만났", "어떻게처음", "만나게", "어떻게알게")) return { answer: A.meeting, source: "public_summary" };
  if (has(n, "처음부터", "첫눈", "바로좋아", "첫만남", "단번")) return { answer: A.first_sight, source: "public_summary" };
  if (has(n, "누가먼저", "먼저좋아", "먼저고백", "누가고백")) return { answer: A.who_first, source: "public_summary" };
  if (has(n, "가족", "부모님", "어머니", "아버지", "처가", "시댁", "집안"))
    return { answer: A.family, source: "public_summary" };
  if (has(n, "언제부터")) return { answer: A.since, source: "public_summary" };

  // 서로의 장점(엄마↔아빠 순서로 관점 결정)
  if (has(n, "좋아", "어떤점", "매력", "장점", "좋은점")) {
    const mi = n.indexOf("엄마");
    const fi = n.indexOf("아빠");
    if (mi !== -1 || fi !== -1) {
      const momFirst = mi !== -1 && (fi === -1 || mi < fi);
      return momFirst
        ? { answer: A.geunyoung_view, source: "public_summary" }
        : { answer: A.seeyoung_view, source: "public_summary" };
    }
  }
  if (has(n, "잘맞", "어울리", "왜좋아", "왜결혼")) return { answer: A.why_match, source: "public_summary" };

  return null;
}

/* ---------- 저장(7일 복원) ---------- */
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let sessionId = null;
let messages = []; // {role:"user"|"assistant", text}
let memorySummary = "";
let turnCount = 0;
let initialized = false;
let sending = false;
let composing = false;
let assistantLabeled = false; // 첫 다엘&라엘 라벨을 한 번만
let sendGen = 0; // 전송 세대 토큰(새 이야기/중복 방지)
let activeController = null; // 진행 중 요청 중단용

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function persist() {
  const data = {
    version: STORAGE_VERSION,
    session_id: sessionId,
    messages,
    memory_summary: memorySummary,
    turn_count: turnCount,
    last_updated_at: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 저장 불가 시 무시 */
    }
  }
}

function loadSaved() {
  const read = (store) => {
    try {
      return JSON.parse(store.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  };
  const raw = read(localStorage) || read(sessionStorage);
  if (!raw || raw.version !== STORAGE_VERSION) return null;
  if (!raw.last_updated_at || Date.now() - raw.last_updated_at > TTL_MS) return null;
  if (!Array.isArray(raw.messages)) return null;
  return raw;
}

/* ---------- DOM ---------- */
const mainEl = document.querySelector("main.invitation");
const chatEl = document.querySelector("[data-story-chat]");
const panelEl = chatEl?.querySelector(".story-ai-panel");
const messagesEl = document.querySelector("[data-story-messages]");
const formEl = document.querySelector("[data-story-form]");
const textarea = document.querySelector("[data-story-textarea]");
const sendBtn = document.querySelector("[data-story-send]");
const toggleBtn = document.querySelector("[data-story-toggle]");
const closeButtons = document.querySelectorAll("[data-story-close]");
const restartBtn = document.querySelector("[data-story-restart]");
const jumpBtn = document.querySelector("[data-story-jump]");

/* ---------- 렌더 ---------- */
function renderMessage(role, text, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = `story-msg story-msg-${role}`;
  if (role === "assistant" && !assistantLabeled) {
    assistantLabeled = true; // 첫 어시스턴트 메시지에만 라벨(그룹 시작에만 아바타)
    const label = document.createElement("span");
    label.className = "story-msg-label";
    label.insertAdjacentHTML("beforeend", SPRIG_SVG); // 정적 인장 SVG(안전)
    label.append(document.createTextNode("다엘"));
    wrap.append(label);
  }
  const bubble = document.createElement("div");
  bubble.className = "story-bubble";
  bubble.textContent = text; // HTML 삽입 금지: 모델/서버 문자열은 textContent 로만
  if (opts.fade && !prefersReducedMotion()) bubble.classList.add("story-fade");
  wrap.append(bubble);
  messagesEl.append(wrap);
  if (opts.done) {
    // 글자단위 타이핑 폐지: 문장 전체 fade-in 뒤(또는 즉시) 추천/이동칩 표시
    if (opts.fade && !prefersReducedMotion()) window.setTimeout(opts.done, 180);
    else opts.done();
  }
  return wrap;
}

let suggestionsEl = null;
function clearSuggestions() {
  if (suggestionsEl) {
    suggestionsEl.remove();
    suggestionsEl = null;
  }
}
function makeChip(q) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "story-chip";
  chip.textContent = q;
  chip.addEventListener("click", () => send(q));
  return chip;
}
function renderSuggestions(list, opts = {}) {
  clearSuggestions();
  if (!list || !list.length) return;
  const limit = opts.limit || list.length;
  const box = document.createElement("div");
  box.className = "story-suggestions";
  const shown = list.slice(0, limit);
  const rest = list.slice(limit);
  shown.forEach((q) => box.append(makeChip(q)));
  if (opts.more && rest.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "story-chip story-chip-more";
    more.textContent = "더 보기";
    more.addEventListener("click", () => {
      rest.forEach((q) => box.insertBefore(makeChip(q), more));
      more.remove();
    });
    box.append(more);
  }
  messagesEl.append(box);
  suggestionsEl = box;
}

let typingEl = null;
function showTyping() {
  hideTyping();
  const wrap = document.createElement("div");
  wrap.className = "story-msg story-msg-assistant story-typing";
  const bubble = document.createElement("div");
  bubble.className = "story-bubble";
  const dots = document.createElement("span");
  dots.className = "story-dots";
  dots.setAttribute("aria-hidden", "true");
  dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = "엄마 아빠의 이야기를 살펴보고 있어요";
  bubble.append(dots, sr);
  wrap.append(bubble);
  messagesEl.append(wrap);
  typingEl = wrap;
  autoScroll(true);
}
function hideTyping() {
  if (typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

/* ---------- 스크롤 ---------- */
function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 90;
}
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  jumpBtn.hidden = true;
}
function autoScroll(force) {
  if (force || isNearBottom()) {
    scrollToBottom();
  } else {
    jumpBtn.hidden = false;
  }
}
function scrollToAnswerStart(wrap) {
  if (!wrap) return;
  // 답변 전체가 아니라 답변 '시작' 위치가 상단 근처에 오도록(긴 답변도 처음부터 읽힘)
  const top = Math.max(0, wrap.offsetTop - 12);
  const maxTop = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
  messagesEl.scrollTop = Math.min(top, maxTop);
  jumpBtn.hidden = true;
}
messagesEl?.addEventListener("scroll", () => {
  if (isNearBottom()) jumpBtn.hidden = true;
});
jumpBtn?.addEventListener("click", scrollToBottom);

/* ---------- 액션 ---------- */
const ACTION_TARGET = {
  location_section: ".location",
  account_section: ".account-section",
  guest_feed_section: ".guestbook",
};
const ACTION_LABEL = {
  location_section: "오시는 길 보기",
  account_section: "마음 전하실 곳 보기",
  guest_feed_section: "축하 글 보러 가기",
};
function navigateToSection(action) {
  const sel = ACTION_TARGET[action];
  const target = sel && document.querySelector(sel);
  if (!target) return;
  closeChat();
  window.setTimeout(() => {
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, 220);
}
function appendNavChip(action) {
  if (!ACTION_TARGET[action] || !ACTION_LABEL[action]) return;
  if (!suggestionsEl) {
    suggestionsEl = document.createElement("div");
    suggestionsEl.className = "story-suggestions";
    messagesEl.append(suggestionsEl);
  }
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "story-navchip";
  chip.append(document.createTextNode(ACTION_LABEL[action]));
  chip.addEventListener("click", () => navigateToSection(action));
  suggestionsEl.append(chip);
}

/* ---------- 응답 처리 ---------- */
function addAssistant(text, { suggestions, action } = {}) {
  const following = isNearBottom();
  messages.push({ role: "assistant", text });
  const wrap = renderMessage("assistant", text, {
    fade: true,
    done: () => {
      // 답변 후 추천 질문은 최대 2개만
      renderSuggestions(suggestions && suggestions.length ? suggestions : null, { limit: 2 });
      if (action) appendNavChip(action);
      if (following) scrollToAnswerStart(wrap);
    },
  });
  // 답변 '시작' 위치를 보여준다. 사용자가 위를 보고 있으면 강제 이동하지 않고 점프 버튼만.
  if (following) scrollToAnswerStart(wrap);
  else jumpBtn.hidden = false;
}

/* ---------- 백엔드 호출 ---------- */
async function callBackend(text) {
  const controller = new AbortController();
  activeController = controller;
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const history = messages
      .slice(0, -1) // 방금 추가한 사용자 메시지 제외
      .slice(-HISTORY_SEND)
      .map((m) => ({ role: m.role, text: m.text }));
    const resp = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message: text,
        history,
        memory_summary: memorySummary,
        client_context: { page: "wedding_invitation", language: "ko-KR", profile_version: "1.0.0" },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return {
      answer: typeof data.answer === "string" && data.answer.trim() ? data.answer.trim() : "",
      action: typeof data.action === "string" ? data.action : "none",
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter((s) => typeof s === "string").slice(0, 3) : [],
      memory_summary: typeof data.memory_summary === "string" ? data.memory_summary : memorySummary,
    };
  } finally {
    clearTimeout(timer);
    if (activeController === controller) activeController = null;
  }
}

/* ---------- 전송 ---------- */
function setSending(on) {
  sending = on;
  if (sendBtn) sendBtn.disabled = on;
  if (textarea) textarea.disabled = on;
}

function reachedLimit() {
  return turnCount >= MAX_TURNS;
}

async function send(rawText) {
  const text = (rawText || "").trim();
  if (!text || sending) return;
  if (reachedLimit()) {
    clearSuggestions();
    renderMessage("assistant", "오늘 나눌 수 있는 이야기를 모두 나눴어요.\n‘새 이야기’로 다시 시작할 수 있어요.");
    autoScroll(true);
    return;
  }

  const gen = ++sendGen;
  clearSuggestions();
  renderMessage("user", text);
  messages.push({ role: "user", text });
  turnCount += 1;
  if (textarea) {
    textarea.value = "";
    resizeTextarea();
  }
  autoScroll(true);
  persist();

  setSending(true);
  showTyping();
  try {
    let res;
    if (CHAT_ENDPOINT) {
      res = await callBackend(text);
      if (gen !== sendGen) return; // '새 이야기' 등으로 무효화되면 폐기
      if (!res.answer) throw new Error("empty");
    } else {
      await new Promise((r) => setTimeout(r, 420)); // 정적 모드에서도 타이핑이 잠깐 보이도록
      if (gen !== sendGen) return;
      const fb = matchFaq(text);
      res = fb
        ? { answer: fb.answer, action: fb.action || "none", suggestions: [] }
        : { answer: A.guide, action: "none", suggestions: INITIAL_SUGGESTIONS.slice(0, 4) };
    }
    hideTyping();
    memorySummary = res.memory_summary !== undefined ? res.memory_summary : memorySummary;
    addAssistant(res.answer, { suggestions: res.suggestions, action: res.action });
  } catch {
    if (gen !== sendGen) return;
    hideTyping();
    const fb = matchFaq(text);
    if (fb) {
      addAssistant(fb.answer, { action: fb.action });
    } else {
      addAssistant(
        "지금은 다엘이 잠깐 대답하기 어려워요.\n조금 뒤에 다시 찾아와 주세요.",
        { suggestions: INITIAL_SUGGESTIONS.slice(0, 3) },
      );
    }
  } finally {
    if (gen === sendGen) {
      setSending(false);
      persist();
      if (reachedLimit()) renderSuggestions(null);
    }
  }
}

/* ---------- 입력창 ---------- */
function resizeTextarea() {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 108)}px`;
}
textarea?.addEventListener("input", resizeTextarea);
textarea?.addEventListener("compositionstart", () => {
  composing = true;
});
textarea?.addEventListener("compositionend", () => {
  composing = false;
});
textarea?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing) {
    e.preventDefault();
    send(textarea.value);
  }
});
formEl?.addEventListener("submit", (e) => {
  e.preventDefault();
  send(textarea.value);
});

/* ---------- 시트 열고 닫기 ---------- */
function syncViewport() {
  if (!chatEl || chatEl.hidden || !window.visualViewport) return;
  const vv = window.visualViewport;
  chatEl.style.top = `${vv.offsetTop}px`;
  chatEl.style.height = `${vv.height}px`;
  chatEl.style.bottom = "auto";
}
function resetViewport() {
  if (!chatEl) return;
  chatEl.style.top = "";
  chatEl.style.height = "";
  chatEl.style.bottom = "";
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
    else {
      gb.hidden = true;
      document.body.classList.remove("guestbook-is-open");
    }
  }
}

function openChat() {
  if (!chatEl || !toggleBtn) return;
  closeGuestbookIfOpen();
  chatEl.hidden = false;
  document.body.classList.add("dael-rael-open");
  toggleBtn.setAttribute("aria-expanded", "true");
  if (mainEl) mainEl.inert = true;
  initConversation();
  syncViewport();
  scrollToBottom();
  // 다이얼로그 안으로 포커스 이동(텍스트박스가 아닌 패널 → 모바일 키보드 즉시 안 뜸)
  if (panelEl) panelEl.focus();
}

function closeChat() {
  if (!chatEl || !toggleBtn) return;
  chatEl.hidden = true;
  document.body.classList.remove("dael-rael-open");
  toggleBtn.setAttribute("aria-expanded", "false");
  if (mainEl) mainEl.inert = false;
  resetViewport();
  toggleBtn.focus();
}

toggleBtn?.addEventListener("click", openChat);
closeButtons.forEach((b) => b.addEventListener("click", closeChat));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatEl && !chatEl.hidden) closeChat();
});
// 포커스 트랩: 열린 다이얼로그 밖으로 Tab 이 새지 않게
chatEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || chatEl.hidden) return;
  const nodes = [
    ...chatEl.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
// 방명록을 열면 다엘&라엘은 닫는다(오버레이 하나만)
document.addEventListener(
  "click",
  (e) => {
    const t = e.target.closest && e.target.closest("[data-guestbook-toggle]");
    if (t && chatEl && !chatEl.hidden) closeChat();
  },
  true,
);

/* ---------- 새 이야기(초기화) — 인라인 확인 ---------- */
let restartConfirmEl = null;
function showRestartConfirm() {
  if (restartConfirmEl) return;
  const box = document.createElement("div");
  box.className = "story-restart-confirm";
  const msg = document.createElement("p");
  msg.textContent = "지금까지 나눈 이야기를 지우고 다엘에게 새로 물어볼까요?";
  const row = document.createElement("div");
  row.className = "story-restart-actions";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "story-restart-yes";
  yes.textContent = "네, 새로 시작";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "story-restart-no";
  no.textContent = "취소";
  yes.addEventListener("click", () => {
    doRestart();
    dismissRestartConfirm();
  });
  no.addEventListener("click", dismissRestartConfirm);
  row.append(yes, no);
  box.append(msg, row);
  panelEl.insertBefore(box, messagesEl);
  restartConfirmEl = box;
}
function dismissRestartConfirm() {
  if (restartConfirmEl) {
    restartConfirmEl.remove();
    restartConfirmEl = null;
  }
}
function doRestart() {
  sendGen += 1; // 진행 중 요청 무효화
  if (activeController) activeController.abort();
  messages = [];
  memorySummary = "";
  turnCount = 0;
  sessionId = newId();
  assistantLabeled = false;
  messagesEl.replaceChildren();
  clearSuggestions();
  setSending(false);
  renderMessage("assistant", WELCOME);
  renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
  scrollToBottom();
  persist();
}
restartBtn?.addEventListener("click", showRestartConfirm);

/* ---------- 대화 시작 / 복원 ---------- */
function initConversation() {
  if (initialized) return;
  initialized = true;
  assistantLabeled = false;
  const saved = loadSaved();
  if (saved && saved.messages.length) {
    sessionId = saved.session_id || newId();
    messages = saved.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string");
    memorySummary = saved.memory_summary || "";
    turnCount = typeof saved.turn_count === "number" ? saved.turn_count : messages.filter((m) => m.role === "user").length;
    messages.forEach((m) => renderMessage(m.role, m.text));
    if (messages[messages.length - 1].role === "assistant" && !reachedLimit()) {
      renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
    }
  } else {
    sessionId = newId();
    messages = [];
    memorySummary = "";
    turnCount = 0;
    renderMessage("assistant", WELCOME);
    renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
  }
}
