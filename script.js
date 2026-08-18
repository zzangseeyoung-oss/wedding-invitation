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
