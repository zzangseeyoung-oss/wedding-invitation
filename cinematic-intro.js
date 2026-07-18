/*
 * 시네마틱 인트로 — 시간 기반 자동 재생(스크롤 비의존).
 * 타임라인(초): 0~2.5 외관 접근 → 2.2~4.8 실내 크로스페이드/전진 → 4.5~7.2 청첩장 줌인 → 7.2~ "초대장 펼치기" 버튼.
 * 버튼 클릭: 아이보리로 부드럽게 디졸브 → 모시는 글로 이동. 스크롤은 막지 않고, 임계값 넘으면 인트로 즉시 완료.
 * 무 JS / prefers-reduced-motion: 외관 정지 화면 + 본문 접근으로 폴백.
 */
(function () {
  "use strict";

  const intro = document.querySelector("[data-cine]");
  if (!intro) return;

  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scenes = [...intro.querySelectorAll(".cine-scene")];
  if (!scenes.length) return;
  const imgs = scenes.map((s) => s.querySelector(".cine-img"));
  const copies = scenes.map((s) => s.querySelector(".cine-copy"));

  // 이미지 로드 상태(실패해도 LQIP 배경/본문 유지)
  imgs.forEach((img) => {
    if (!img) return;
    if (img.complete && img.naturalWidth) img.classList.add("loaded");
    else {
      img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
      img.addEventListener("error", () => img.classList.add("loaded"), { once: true });
    }
  });

  intro.classList.add("js-on");

  // 자동재생 끝 "초대장 펼치기" 버튼
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cine-open";
  btn.innerHTML = '<span class="ico" aria-hidden="true">✦</span><span>초대장 펼치기</span>';
  intro.appendChild(btn);

  // 아이보리 디졸브 커버
  const cover = document.createElement("div");
  cover.className = "cine-cover";
  cover.setAttribute("aria-hidden", "true");
  document.body.appendChild(cover);

  const target = document.querySelector("#invitation-title");

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const smooth = (v) => v * v * (3 - 2 * v);
  const mix = (a, b, t) => a + (b - a) * t;

  function setScene(scene, opacity) {
    const vis = opacity > 0.002;
    scene.style.opacity = opacity.toFixed(4);
    scene.style.visibility = vis ? "visible" : "hidden";
    scene.style.zIndex = vis ? String(Math.round(opacity * 10) + 1) : "0";
  }

  // 시간(초) → 장면 상태
  function render(t) {
    // 외관: 입구 쪽으로 서서히 접근하다 실내와 겹치며 사라짐
    const eOut = smooth(range(t, 2.2, 3.0));
    setScene(scenes[0], 1 - eOut);
    if (imgs[0]) {
      const z = mix(1.03, 1.17, smooth(range(t, 0, 3.0)));
      const y = mix(0, -2.0, range(t, 0, 3.0));
      imgs[0].style.transform = `scale(${z}) translate3d(0, ${y}%, 0)`;
      imgs[0].style.filter = `brightness(${mix(1, 0.9, eOut)})`;
    }
    if (copies[0]) {
      const ci = smooth(range(t, 0.5, 1.4));
      const co = smooth(range(t, 2.0, 2.7));
      copies[0].style.opacity = (ci * (1 - co)).toFixed(4);
      copies[0].style.transform = `translate3d(0, ${mix(14, -14, ci)}px, 0)`;
    }

    // 실내: 외관 뒤에서 나타나 아일 안쪽으로 전진, 청첩장과 교차
    const iIn = smooth(range(t, 2.2, 3.2));
    const iOut = smooth(range(t, 4.5, 5.3));
    setScene(scenes[1], iIn * (1 - iOut));
    if (imgs[1]) {
      const z = mix(1.06, 1.18, smooth(range(t, 2.2, 5.3)));
      const y = mix(1.5, -2.5, range(t, 2.2, 5.3));
      imgs[1].style.transform = `scale(${z}) translate3d(0, ${y}%, 0)`;
      imgs[1].style.filter = `brightness(${mix(0.92, 1.02, iIn)})`;
    }
    if (copies[1]) {
      const ci = smooth(range(t, 3.0, 3.9));
      const co = smooth(range(t, 4.2, 4.9));
      copies[1].style.opacity = (ci * (1 - co)).toFixed(4);
      copies[1].style.transform = `translate3d(0, ${mix(16, -12, ci)}px, 0)`;
    }

    // 청첩장: 식탁 위 카드가 나타나 줌인, 카피는 잠깐 보였다 버튼에 자리를 내줌
    const vIn = smooth(range(t, 4.5, 5.5));
    setScene(scenes[2], vIn);
    if (imgs[2]) {
      const zp = smooth(range(t, 4.7, 7.2));
      const z = mix(1.05, 1.28, zp);
      const x = mix(0, -1.2, zp);
      const y = mix(0.8, -2.6, zp);
      imgs[2].style.transform = `scale(${z}) translate3d(${x}%, ${y}%, 0)`;
      imgs[2].style.filter = `brightness(${mix(0.92, 1.03, vIn)})`;
    }
    if (copies[2]) {
      const ci = smooth(range(t, 5.5, 6.3));
      const co = smooth(range(t, 6.6, 7.05));
      copies[2].style.opacity = (ci * (1 - co)).toFixed(4);
      copies[2].style.transform = `translate3d(0, ${mix(18, -10, ci)}px, 0)`;
    }
  }

  const END = 7.3; // 초
  let done = false;
  let rafId = 0;
  let startTs = 0;
  let buttonShown = false;

  function showButton() {
    if (buttonShown) return;
    buttonShown = true;
    btn.classList.add("show");
  }

  // 애니 종료 후 GPU 승격 해제(모바일 합성/메모리 절약)
  function releaseWillChange() {
    imgs.forEach((im) => { if (im) im.style.willChange = "auto"; });
    copies.forEach((c) => { if (c) c.style.willChange = "auto"; });
  }

  function finishAtEnd() {
    render(END);
    showButton();
    releaseWillChange();
  }

  function loop(now) {
    if (!startTs) startTs = now;
    const t = (now - startTs) / 1000;
    render(Math.min(t, END));
    if (t >= 7.2) showButton();
    if (t < END && !done) {
      rafId = requestAnimationFrame(loop);
    } else if (!done) {
      finishAtEnd();
    }
  }

  // 인트로 → 본문: 아이보리 디졸브 후 모시는 글로 이동
  function goToBody(animated) {
    if (animated) {
      cover.classList.add("on");
      window.setTimeout(() => {
        if (target) target.scrollIntoView({ block: "start" });
        requestAnimationFrame(() => cover.classList.remove("on"));
      }, 480);
    } else if (target) {
      target.scrollIntoView({ block: "start" });
    }
  }

  function dismiss() {
    if (done) { goToBody(!reduce); return; }
    done = true;
    if (rafId) cancelAnimationFrame(rafId);
    render(END);
    showButton();
    releaseWillChange();
    goToBody(!reduce);
  }

  btn.addEventListener("click", dismiss);

  // 스크롤을 막지 않되, 임계값 이상이면 인트로를 즉시 완료 처리(강제 이동은 하지 않음)
  let scrollHandled = false;
  function onScroll() {
    if (scrollHandled) return;
    if (window.scrollY > 56) {
      scrollHandled = true;
      window.removeEventListener("scroll", onScroll);
      if (reduce || done) return;
      done = true;
      if (rafId) cancelAnimationFrame(rafId);
      render(END);
      showButton();
      releaseWillChange();
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── 시작 ──
  if (reduce) {
    // 정지: 외관 + 버튼 즉시, 애니 없음
    scenes.forEach((s, i) => setScene(s, i === 0 ? 1 : 0));
    if (imgs[0]) { imgs[0].style.transform = "none"; imgs[0].style.filter = "none"; }
    releaseWillChange();
    showButton();
    return;
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    rafId = requestAnimationFrame(loop);
  }
  // 외관 이미지가 준비되면 시작(최대 1.2s 후 폴백 시작)
  if (imgs[0] && imgs[0].complete && imgs[0].naturalWidth) start();
  else {
    if (imgs[0]) imgs[0].addEventListener("load", start, { once: true });
    window.setTimeout(start, 1200);
  }
})();
