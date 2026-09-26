const toast = document.querySelector(".toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

window.showToast = showToast;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("복사했습니다.");
  } catch {
    showToast(text);
  }
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copy));
});

document.querySelectorAll("[data-share]").forEach((button) => {
  button.addEventListener("click", async () => {
    /* 공유는 항상 정식 주소로. 현재 주소를 그대로 쓰면 ?v=5 같은 캐시무효화
       쿼리까지 하객에게 퍼진다. og:url을 정본으로 삼고 없으면 현재 주소를 쓴다. */
    const canonical =
      document.querySelector('meta[property="og:url"]')?.content ||
      window.location.origin + window.location.pathname;
    const shareData = {
      title: "장시영 · 이근영 결혼식에 초대합니다",
      text: "2026년 10월 10일 토요일 낮 12시 30분, 용인 코티지 보타닉 하우스",
      url: canonical,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyText(canonical);
        showToast("청첩장 주소를 복사했습니다.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        showToast("공유하지 못했습니다.");
      }
    }
  });
});

const countdown = document.querySelector("[data-countdown]");
if (countdown) {
  const weddingAt = new Date("2026-10-10T12:30:00+09:00");
  const days = Math.ceil((weddingAt.getTime() - Date.now()) / 86400000);

  if (days > 0) {
    countdown.textContent = `결혼식까지 D-${days}`;
  } else if (days === 0) {
    countdown.textContent = "오늘, 저희 결혼합니다";
  } else {
    countdown.textContent = "함께해 주셔서 감사합니다";
  }
}

/* ---------- 배경음악(자동재생 시도 + 반복 + 토글) ---------- */
(function initBgm() {
  const audio = document.getElementById("wedding-bgm");
  const btn = document.querySelector("[data-bgm-toggle]");
  if (!audio || !btn) return;
  audio.volume = 0.5;
  let userPaused = false;

  function reflect() {
    const on = !audio.paused;
    btn.classList.toggle("playing", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // 브라우저 자동재생 정책상 소리 있는 자동재생은 첫 사용자 상호작용이 필요할 수 있다.
  audio.play().then(reflect).catch(() => {});

  const kick = (e) => {
    if (btn.contains(e.target)) return; // 토글 버튼 클릭은 자체 핸들러가 처리
    if (userPaused) return;
    audio.play().then(() => {
      reflect();
      if (!audio.paused) {
        ["pointerdown", "touchstart", "keydown", "click", "scroll"].forEach((ev) =>
          window.removeEventListener(ev, kick, true),
        );
      }
    }).catch(() => {});
  };
  ["pointerdown", "touchstart", "keydown", "click", "scroll"].forEach((ev) =>
    window.addEventListener(ev, kick, { capture: true, passive: true }),
  );

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (audio.paused) {
      userPaused = false;
      audio.play().then(reflect).catch(() => {});
    } else {
      userPaused = true;
      audio.pause();
      reflect();
    }
  });
  audio.addEventListener("play", reflect);
  audio.addEventListener("pause", reflect);
  reflect();
})();

/* ---------- 스크롤 등장 ----------
   섹션이 뷰포트에 들어올 때 한 번만 살짝 올라오며 나타난다.
   JS가 동작할 때만 숨기므로(js-reveal), 스크립트가 실패해도 내용은 그대로 보인다. */
(() => {
  const targets = document.querySelectorAll(
    ".invitation-copy, .story-ai-card, .date-section, .rsvp-section, .location, .account-section, .guestbook, .closing"
  );
  if (!targets.length) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  document.documentElement.classList.add("js-reveal");
  targets.forEach((el) => el.classList.add("reveal"));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.06 }
  );
  targets.forEach((el) => io.observe(el));

  /* 안전장치: 관찰이 어떤 이유로든 동작하지 않아도 스크롤만 하면 드러나게 한다.
     (일정 시간 뒤 전부 보이게 하면 연출 자체가 사라지므로 그렇게 하지 않는다) */
  let left = targets.length;
  const sweep = () => {
    targets.forEach((el) => {
      if (el.classList.contains("is-in")) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
        el.classList.add("is-in");
        left -= 1;
      }
    });
    if (left <= 0) window.removeEventListener("scroll", sweep);
  };
  window.addEventListener("scroll", sweep, { passive: true });
  sweep();
})();

/* ---------- 웨딩 갤러리: 청첩장 위 전체 화면으로 열기 ----------
   페이지를 떠나지 않으므로 배경음악이 끊기지 않는다. 갤러리는 ?embedded=1 로 열려 자기 음악을 쓰지 않는다.
   히스토리 1개를 쌓고 휴대폰 뒤로가기 = 닫기. 스크립트가 없거나 실패하면 링크가 그대로 갤러리로 이동한다. */
(function initGalleryOverlay() {
  const link = document.querySelector(".gallery-link-button");
  if (!link || typeof history.pushState !== "function" || typeof URL !== "function") return;
  const audio = document.getElementById("wedding-bgm");
  const pageBgmBtn = document.querySelector("[data-bgm-toggle]");
  let overlay = null;
  let frame = null;
  let musicBtn = null;
  let closeBtn = null;
  let isOpen = false;
  let returnY = 0;
  let inerted = [];
  let fallback = null;
  let readyTimer = null;
  const galleryOrigin = new URL(link.href).origin;

  function frameSrc() {
    const u = new URL(link.href);
    u.searchParams.set("embedded", "1");
    return u.href;
  }

  function reflectMusic() {
    if (!musicBtn || !audio) return;
    const on = !audio.paused;
    musicBtn.classList.toggle("playing", on);
    musicBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "gallery-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "웨딩 갤러리");
    const bar = document.createElement("div");
    bar.className = "gallery-overlay-bar";
    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "gallery-overlay-close";
    closeBtn.textContent = "닫기";
    closeBtn.addEventListener("click", requestClose);
    const title = document.createElement("span");
    title.className = "gallery-overlay-title";
    title.textContent = "웨딩 갤러리";
    bar.append(closeBtn, title);
    if (audio && pageBgmBtn) {
      // 청첩장 음악 버튼과 같은 동작(같은 음악, 일시정지 기억)을 겹쳐진 화면에서도 쓸 수 있게 한다.
      musicBtn = pageBgmBtn.cloneNode(true);
      musicBtn.removeAttribute("data-bgm-toggle");
      musicBtn.className = "gallery-overlay-music";
      musicBtn.addEventListener("click", () => pageBgmBtn.click());
      audio.addEventListener("play", reflectMusic);
      audio.addEventListener("pause", reflectMusic);
      bar.append(musicBtn);
    }
    // 갤러리가 열리지 않을 때(연결 문제 등) 원래 주소로 바로 가는 길
    fallback = document.createElement("p");
    fallback.className = "gallery-overlay-fallback";
    fallback.hidden = true;
    const direct = document.createElement("a");
    direct.href = link.href;
    direct.textContent = "갤러리로 바로 가기";
    fallback.append("갤러리가 열리지 않나요? ", direct);
    overlay.append(bar, fallback);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); requestClose(); }
    });
    document.body.append(overlay);
  }

  function openOverlay() {
    if (isOpen) return;
    if (!overlay) build();
    isOpen = true;
    returnY = window.scrollY;
    frame = document.createElement("iframe");
    frame.className = "gallery-overlay-frame";
    frame.title = "웨딩 갤러리";
    frame.src = frameSrc();
    overlay.append(frame);
    fallback.hidden = true;
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => { if (isOpen) fallback.hidden = false; }, 8000);
    inerted = [];
    for (const el of document.body.children) {
      if (el !== overlay && !el.inert) { el.inert = true; inerted.push(el); }
    }
    document.documentElement.classList.add("gallery-overlay-open");
    overlay.hidden = false;
    reflectMusic();
    closeBtn.focus({ preventScroll: true });
  }

  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;
    overlay.hidden = true;
    clearTimeout(readyTimer);
    if (frame) { frame.remove(); frame = null; }
    inerted.forEach((el) => { el.inert = false; });
    inerted = [];
    document.documentElement.classList.remove("gallery-overlay-open");
    window.scrollTo({ top: returnY, behavior: "instant" });
    link.focus({ preventScroll: true });
  }

  // 닫기 = 뒤로가기. 갤러리 안에서 사진 보기·올리기 화면이 열려 있으면 그 기록이 먼저 닫히므로 몇 번까지 이어서 뒤로 간다.
  // 갤러리가 확인 창(올리는 중·고른 사진 있음)을 띄우면 더 누르지 않고 그 선택에 맡긴다.
  function requestClose() {
    if (!isOpen) return;
    let tries = 0;
    const step = () => {
      if (!isOpen || tries >= 3) return;
      tries += 1;
      history.back();
      setTimeout(step, 450);
    };
    step();
  }

  link.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (isOpen) return;
    history.pushState({ wgGallery: 1 }, "");
    openOverlay();
  });

  window.addEventListener("message", (e) => {
    if (frame && e.source === frame.contentWindow && e.origin === galleryOrigin && e.data && e.data.wg === "gallery-ready") {
      clearTimeout(readyTimer);
      fallback.hidden = true;
    }
  });

  window.addEventListener("popstate", () => {
    const here = history.state && history.state.wgGallery;
    if (isOpen && !here) closeOverlay();
    else if (!isOpen && here) openOverlay(); // 앞으로 가기로 다시 온 경우
  });

  // 새로고침 뒤 남은 갤러리 기록은 평범한 기록으로 바꾼다(다시 열려 있는 척하지 않음).
  if (history.state && history.state.wgGallery) history.replaceState(null, "");
})();
