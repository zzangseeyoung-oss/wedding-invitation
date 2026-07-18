/*
 * 시네마틱 인트로 V3 — 하나의 연속 카메라: 외관 접근 → 문 통과(도어 아이리스) → 실내 →
 * 식탁(루미넌스 푸시) → 청첩장 줌인 → (버튼) 실제 카드 열림 → 안쪽 종이 확대 →
 * 실제 .invitation-copy 로 모프(레이아웃 점프 0). 자동 재생. reduce/no-JS 폴백.
 */
(function () {
  "use strict";

  const intro = document.querySelector("[data-cine]");
  if (!intro) return;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scenes = [...intro.querySelectorAll(".cine-scene")];
  if (scenes.length < 3) return;
  const imgs = scenes.map((s) => s.querySelector(".cine-img"));
  const copies = scenes.map((s) => s.querySelector(".cine-copy"));
  const realCopy = document.querySelector(".invitation-copy");
  const bodyTarget = document.querySelector("#invitation-title");

  imgs.forEach((img) => {
    if (!img) return;
    if (img.complete && img.naturalWidth) img.classList.add("loaded");
    else {
      img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
      img.addEventListener("error", () => img.classList.add("loaded"), { once: true });
    }
  });

  intro.classList.add("js-on");

  // 도어 프레임 비네트 + 루미넌스 스윕(전환 마스크)
  const doorframe = document.createElement("div");
  doorframe.className = "cine-doorframe"; doorframe.setAttribute("aria-hidden", "true");
  scenes[1].appendChild(doorframe);
  const lumina = document.createElement("div");
  lumina.className = "cine-lumina"; lumina.setAttribute("aria-hidden", "true");
  scenes[2].appendChild(lumina);

  // ── DOM 카드(표지+안쪽) ──
  const cardStage = document.createElement("div");
  cardStage.className = "cine-card-stage"; cardStage.setAttribute("aria-hidden", "true");
  cardStage.innerHTML =
    '<div class="cine-card">' +
      '<div class="cine-card-face cine-card-inside"></div>' +
      '<div class="cine-card-face cine-card-cover">' +
        '<svg class="cc-sprig" viewBox="0 0 40 40" aria-hidden="true"><path d="M13 9 C 17 19, 18 26, 20 31.5" fill="none" stroke="#3d6a54" stroke-width="2.2" stroke-linecap="round"/><path d="M27 9 C 23 19, 22 26, 20 31.5" fill="none" stroke="#c1a24a" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '<p class="cc-kicker">Wedding Invitation</p>' +
        '<p class="cc-names">장시영 <i>·</i> 이근영</p>' +
        '<p class="cc-date">2026. 10. 10.</p>' +
        '<div class="cc-back" aria-hidden="true"></div>' +
      '</div>' +
    '</div>';
  intro.appendChild(cardStage);
  const card = cardStage.querySelector(".cine-card");
  const cardInside = cardStage.querySelector(".cine-card-inside");

  // ── 본문 모프 오버레이(.invitation 폭 + 실제 클론) ──
  const morph = document.createElement("div");
  morph.className = "cine-morph"; morph.setAttribute("aria-hidden", "true");
  const morphCol = document.createElement("div");
  morphCol.className = "cine-morph-col";
  morph.appendChild(morphCol);
  document.body.appendChild(morph);

  function cloneCopy() {
    if (!realCopy) return null;
    const c = realCopy.cloneNode(true);
    c.removeAttribute("aria-labelledby");
    const h = c.querySelector("#invitation-title");
    if (h) h.removeAttribute("id");
    return c;
  }
  // 안쪽 미리보기(카드 크기에 맞춰 축소된 실제 페이지 상단)
  const insideClone = cloneCopy();
  if (insideClone) {
    const wrap = document.createElement("div");
    wrap.className = "cine-card-clone";
    wrap.style.width = "520px";
    wrap.appendChild(insideClone);
    cardInside.appendChild(wrap);
  }
  // 모프용 전체 클론
  const morphClone = cloneCopy();
  if (morphClone) morphCol.appendChild(morphClone);

  // 초대장 펼치기 버튼
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "cine-open";
  btn.innerHTML = '<span class="ico" aria-hidden="true">✦</span><span>초대장 펼치기</span>';
  intro.appendChild(btn);

  const cue = intro.querySelector(".cine-cue");
  if (cue) cue.style.display = "none";
  // 식탁 장면(scene-4)의 기존 오버레이 카피는 카드+버튼이 대신하므로 숨김
  if (copies[2]) copies[2].style.display = "none";

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const smooth = (v) => v * v * (3 - 2 * v);
  const mix = (a, b, t) => a + (b - a) * t;
  const setScene = (s, o, z) => { const vis = o > 0.002; s.style.opacity = o.toFixed(4); s.style.visibility = vis ? "visible" : "hidden"; if (z != null) s.style.zIndex = String(z); };

  // 카드 내부 축소 스케일(카드 폭에 맞춤)
  function fitInsideClone() {
    const w = cardInside.querySelector(".cine-card-clone");
    if (!w) return;
    const cw = card.getBoundingClientRect().width || 296;
    const s = cw / 520;
    // 가로 중앙 + 상단 여백 일부 트림('Invitation/모시는 글'이 카드 상단에 보이게)
    w.style.transform = `translate(-50%, -22px) scale(${s.toFixed(4)})`;
  }

  function render(t) {
    // 1) 외관 접근 — 중앙 출입문으로 다가감
    const eOut = smooth(range(t, 3.0, 3.7));
    setScene(scenes[0], 1 - eOut, 4);
    if (imgs[0]) {
      const z = mix(1.05, 2.1, smooth(range(t, 0, 3.7)));
      const y = mix(0, -2.5, range(t, 0, 3.7));
      imgs[0].style.transformOrigin = "50% 52%";
      imgs[0].style.transform = `scale(${z}) translate3d(0, ${y}%, 0)`;
      imgs[0].style.filter = `brightness(${mix(1, 0.72, smooth(range(t, 2.2, 3.7)))})`;
    }
    if (copies[0]) { const ci = smooth(range(t, 0.5, 1.4)), co = smooth(range(t, 1.9, 2.5)); copies[0].style.opacity = (ci * (1 - co)).toFixed(4); copies[0].style.transform = `translate3d(0,${mix(14, -16, ci)}px,0)`; }

    // 도어 프레임 비네트(입구가 어두운 프레임처럼)
    doorframe.style.opacity = (smooth(range(t, 2.2, 3.0)) * (1 - smooth(range(t, 3.2, 3.9)))).toFixed(4);

    // 2) 문 통과 — 실내가 문(중앙)에서 아이리스로 열림
    const irisR = mix(7, 155, smooth(range(t, 2.35, 3.7)));
    const iInVisible = t > 2.3;
    const iOut = smooth(range(t, 5.0, 5.7));
    setScene(scenes[1], iInVisible ? 1 - iOut : 0, 6);
    scenes[1].style.clipPath = t < 3.75 ? `circle(${irisR}% at 50% 50%)` : "none";
    if (imgs[1]) {
      const z = mix(1.42, 1.2, smooth(range(t, 2.35, 5.0))); // 안으로 들어가며 정착 후 테이블로 접근하며 다시 확대
      const z2 = mix(1.0, 1.12, smooth(range(t, 4.2, 5.6)));
      const y = mix(0.5, -3.2, range(t, 2.35, 5.6));
      imgs[1].style.transformOrigin = "50% 58%";
      imgs[1].style.transform = `scale(${(z * z2).toFixed(4)}) translate3d(0, ${y}%, 0)`;
      imgs[1].style.filter = `brightness(${mix(0.86, 1.03, smooth(range(t, 2.35, 3.6)))})`;
    }
    if (copies[1]) { const ci = smooth(range(t, 3.7, 4.4)), co = smooth(range(t, 4.5, 5.0)); copies[1].style.opacity = (ci * (1 - co)).toFixed(4); copies[1].style.transform = `translate3d(0,${mix(16, -12, ci)}px,0)`; }

    // 3) 식탁 전환 — 밝은 루미넌스 스윕 + 청첩장 푸시인
    lumina.style.opacity = (smooth(range(t, 4.9, 5.35)) * (1 - smooth(range(t, 5.5, 6.1)))).toFixed(4);
    const vIn = smooth(range(t, 5.2, 5.9));
    setScene(scenes[2], vIn, 8);
    if (imgs[2]) {
      const z = mix(1.24, 1.34, smooth(range(t, 5.2, 7.4)));
      const y = mix(5.5, -1.5, smooth(range(t, 5.2, 7.4)));
      const x = mix(1.5, -1.0, smooth(range(t, 5.6, 7.4)));
      imgs[2].style.transformOrigin = "48% 46%";
      imgs[2].style.transform = `scale(${z.toFixed(4)}) translate3d(${x}%, ${y}%, 0)`;
      imgs[2].style.filter = `brightness(${mix(0.95, 1.03, vIn)})`;
    }
  }

  const END = 7.4;
  let done = false, opened = false, rafId = 0, startTs = 0, buttonShown = false;

  function showButton() { if (buttonShown) return; buttonShown = true; btn.classList.add("show"); }
  function releaseWillChange() { imgs.forEach((im) => im && (im.style.willChange = "auto")); }

  function settleCard() {
    // 이미지 카드 위에 DOM 카드 정착(치환)
    fitInsideClone();
    cardStage.classList.add("is-visible");
  }
  function finishAtEnd() { render(END); settleCard(); showButton(); }

  function loop(now) {
    if (!startTs) startTs = now;
    const t = (now - startTs) / 1000;
    render(Math.min(t, END));
    if (t >= 6.9) settleCard();
    if (t >= 7.15) showButton();
    if (t < END && !done) rafId = requestAnimationFrame(loop);
    else if (!done) finishAtEnd();
  }

  // 개봉/스킵 후 본문 제목으로 포커스 이동(키보드·스크린리더 맥락 유지)
  function focusBody() {
    if (!bodyTarget) return;
    bodyTarget.setAttribute("tabindex", "-1");
    try { bodyTarget.focus({ preventScroll: true }); } catch (e) {}
  }

  // ── 카드 열림 → 안쪽 확대 → 실제 본문 모프 ──
  function openAndMorph() {
    if (opened) return; opened = true; done = true;
    if (rafId) cancelAnimationFrame(rafId);
    btn.classList.remove("show");
    settleCard();
    releaseWillChange();

    if (reduce) { // 모션 최소화: 즉시 본문
      if (bodyTarget) { bodyTarget.scrollIntoView({ block: "start" }); focusBody(); }
      return;
    }

    // 1) 표지 열림(좌측 경첩 3D 폴드, ~1s)
    card.classList.add("is-open");
    // 2) 안쪽 종이 확대 → 불투명 모프 오버레이가 화면을 덮음
    window.setTimeout(() => {
      morph.classList.add("on"); // opacity→1(.3s) 불투명 커버
      morphCol.animate(
        [{ transform: "scale(.66)" }, { transform: "scale(1)" }],
        { duration: 680, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );
      cardStage.style.transition = "opacity .45s ease";
      cardStage.style.opacity = "0";
      // 3) 불투명 모프 뒤에서 실제 섹션 상단으로 정렬 후, 모프 페이드아웃 = 같은 위치 crossfade(점프 0)
      window.setTimeout(() => {
        (realCopy || bodyTarget).scrollIntoView({ block: "start" });
        requestAnimationFrame(() => {
          morph.style.transition = "opacity .6s ease";
          morph.classList.remove("on");
          window.setTimeout(() => { morph.style.pointerEvents = "none"; focusBody(); }, 640);
        });
      }, 760);
    }, 1080);
  }
  btn.addEventListener("click", openAndMorph);

  // 본문 바로가기: 즉시 종료(애니메이션 없이 실제 본문)
  const skip = intro.querySelector(".cine-skip");
  if (skip) skip.addEventListener("click", () => {
    done = true; if (rafId) cancelAnimationFrame(rafId);
    cardStage.style.display = "none"; morph.style.display = "none";
    releaseWillChange();
    // 앵커 기본 동작(#invitation-title)로 본문 이동 + 포커스 이동
    window.setTimeout(focusBody, 60);
  });

  // 스크롤 임계: 막지 않되 인트로 즉시 완료(카드 정착 + 버튼)
  let scrollHandled = false;
  function onScroll() {
    if (scrollHandled) return;
    if (window.scrollY > 56) {
      scrollHandled = true; window.removeEventListener("scroll", onScroll);
      if (reduce || done || opened) return;
      done = true; if (rafId) cancelAnimationFrame(rafId);
      render(END); settleCard(); showButton(); releaseWillChange();
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── 시작 ──
  if (reduce) {
    // 모션 최소화: 외관 정지 + 버튼(카드 연출 생략). 버튼 → 즉시 본문.
    scenes.forEach((s, i) => setScene(s, i === 0 ? 1 : 0, i === 0 ? 4 : 0));
    if (imgs[0]) { imgs[0].style.transform = "none"; imgs[0].style.filter = "none"; }
    if (copies[0]) copies[0].style.opacity = "1";
    releaseWillChange(); showButton();
    return;
  }

  let started = false;
  function start() { if (started) return; started = true; fitInsideClone(); rafId = requestAnimationFrame(loop); }
  window.addEventListener("resize", fitInsideClone, { passive: true });
  if (imgs[0] && imgs[0].complete && imgs[0].naturalWidth) start();
  else { if (imgs[0]) imgs[0].addEventListener("load", start, { once: true }); window.setTimeout(start, 1200); }
})();
