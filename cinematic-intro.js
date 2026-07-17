/* 시네마틱 인트로 — 점진적 향상(Progressive Enhancement).
 * JS 없이도 모든 씬/카피가 보이고 본문 접근 가능. JS는 페이드·리빌·미세 parallax만 추가.
 * 기능(RSVP/방명록/음악/지도)과 완전 분리. */
(function () {
  const intro = document.querySelector("[data-cine]");
  if (!intro) return;

  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  intro.classList.add("js-on");

  // 이미지 로드 시 페이드인(blur-up)
  const imgs = [...intro.querySelectorAll(".cine-img")];
  imgs.forEach((img) => {
    if (img.complete && img.naturalWidth) img.classList.add("loaded");
    else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
    img.addEventListener("error", () => img.classList.add("loaded"), { once: true });
  });

  // 스크롤 리빌
  const scenes = [...intro.querySelectorAll("[data-reveal]")];
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.28 },
    );
    scenes.forEach((s) => io.observe(s));
  } else {
    scenes.forEach((s) => s.classList.add("in")); // 폴백: 즉시 표시
  }

  // 스크롤 큐 숨김
  let scrolled = false;
  const onScrollCue = () => {
    if (!scrolled && window.scrollY > 40) {
      scrolled = true;
      intro.classList.add("scrolled");
      window.removeEventListener("scroll", onScrollCue);
    }
  };
  window.addEventListener("scroll", onScrollCue, { passive: true });

  // 미세 parallax(연출용, 매우 절제). reduced-motion이면 생략.
  if (!reduce) {
    let ticking = false;
    const apply = () => {
      ticking = false;
      const vh = window.innerHeight;
      imgs.forEach((img) => {
        const scene = img.closest(".cine-scene");
        if (!scene) return;
        const r = scene.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return; // 화면 밖은 스킵
        const progress = (r.top + r.height / 2 - vh / 2) / vh; // -1..1 근처
        const shift = Math.max(-16, Math.min(16, -progress * 16));
        // 켄번즈(첫 씬)와 충돌 방지: 리빌 scale은 CSS가, parallax는 translate만.
        img.style.setProperty("--py", shift.toFixed(1) + "px");
        img.style.translate = "0 " + shift.toFixed(1) + "px";
      });
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true },
    );
    apply();
  }
})();
