/*
 * 시네마틱 인트로 V3.1 — 하나의 연속 카메라: 외관 접근 → 문 통과(도어 아이리스) → 실내 →
 * 식탁(루미넌스 푸시) → 청첩장 줌인 → (버튼) 실제 카드 열림 → 안쪽 종이 확대 →
 * 실제 .invitation-copy 로 모프(레이아웃 점프 0) → 인트로 소비(재등장 없음).
 * reduced-motion: 연출을 삭제하지 않고 '저강도 자동 크로스페이드'로 자동 진행(외관→실내→식탁, ~4.5s).
 * no-JS: 외관 실사진 + 큐 + 본문 바로가기.
 * ?debug 로 실기기 자동재생 진단 오버레이 표시.
 */
(function () {
  "use strict";

  const intro = document.querySelector("[data-cine]");
  if (!intro) return;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DEBUG = location.search.indexOf("debug") >= 0;
  const mode = reduce ? "soft" : "normal";

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

  // 전환 마스크
  const doorframe = document.createElement("div");
  doorframe.className = "cine-doorframe"; doorframe.setAttribute("aria-hidden", "true");
  scenes[1].appendChild(doorframe);
  const lumina = document.createElement("div");
  lumina.className = "cine-lumina"; lumina.setAttribute("aria-hidden", "true");
  scenes[2].appendChild(lumina);

  // DOM 카드(표지 + 안쪽) — 표지엔 문구만(장식 아이콘 없음)
  const cardStage = document.createElement("div");
  cardStage.className = "cine-card-stage"; cardStage.setAttribute("aria-hidden", "true");
  cardStage.innerHTML =
    '<div class="cine-card">' +
      '<div class="cine-card-face cine-card-inside"></div>' +
      '<div class="cine-card-face cine-card-cover">' +
        '<p class="cc-kicker">Wedding Invitation</p>' +
        '<p class="cc-names">장시영 <i>·</i> 이근영</p>' +
        '<p class="cc-date">2026. 10. 10.</p>' +
        '<div class="cc-back" aria-hidden="true"></div>' +
      '</div>' +
    '</div>';
  intro.appendChild(cardStage);
  const card = cardStage.querySelector(".cine-card");
  const cardInside = cardStage.querySelector(".cine-card-inside");

  // 본문 모프 오버레이(.invitation 폭 + 실제 클론)
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
  const insideClone = cloneCopy();
  if (insideClone) {
    const wrap = document.createElement("div");
    wrap.className = "cine-card-clone";
    wrap.style.width = "520px";
    wrap.appendChild(insideClone);
    cardInside.appendChild(wrap);
  }
  const morphClone = cloneCopy();
  if (morphClone) morphCol.appendChild(morphClone);

  // 초대장 펼치기 버튼(정착 후에만 표시)
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "cine-open";
  btn.innerHTML = '<span class="ico" aria-hidden="true">✦</span><span>초대장 펼치기</span>';
  intro.appendChild(btn);

  const cue = intro.querySelector(".cine-cue");
  if (cue) cue.style.display = "none";
  if (copies[2]) copies[2].style.display = "none";

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const smooth = (v) => v * v * (3 - 2 * v);
  const mix = (a, b, t) => a + (b - a) * t;
  const setScene = (s, o, z) => { const vis = o > 0.002; s.style.opacity = o.toFixed(4); s.style.visibility = vis ? "visible" : "hidden"; if (z != null) s.style.zIndex = String(z); };

  // 상태
  let done = false, opened = false, rafId = 0, startTs = 0, started = false, buttonShown = false;

  // 디버그 오버레이(실기기 자동재생 진단)
  let dbg = null;
  if (DEBUG) {
    dbg = document.createElement("div");
    dbg.setAttribute("aria-hidden", "true");
    dbg.style.cssText = "position:fixed;z-index:99999;left:8px;top:60px;padding:8px 10px;background:rgba(0,0,0,.82);color:#8dff8d;font:11px/1.5 ui-monospace,monospace;white-space:pre;pointer-events:none;border-radius:6px;max-width:70vw;";
    document.body.appendChild(dbg);
  }
  function dlog(t) {
    if (!dbg) return;
    dbg.textContent =
      "reduce=" + reduce + "  mode=" + mode +
      "\nvisibility=" + document.visibilityState +
      "\nstartCalled=" + started + "  raf=" + (rafId ? "on" : "off") +
      "\nimg0.loaded=" + !!(imgs[0] && imgs[0].classList.contains("loaded")) +
      "\nstartTs=" + (startTs ? Math.round(startTs) : 0) +
      "\nt=" + (t != null ? t.toFixed(2) + "s" : "-") +
      "\nbutton=" + buttonShown + "  consumed=" + intro.classList.contains("is-consumed");
  }

  function fitInsideClone() {
    const w = cardInside.querySelector(".cine-card-clone");
    if (!w) return;
    const cw = card.getBoundingClientRect().width || 296;
    const s = cw / 520;
    w.style.transform = `translate(-50%, -22px) scale(${s.toFixed(4)})`;
  }

  // ── 일반(풀) 타임라인 ──
  function render(t) {
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

    doorframe.style.opacity = (smooth(range(t, 2.2, 3.0)) * (1 - smooth(range(t, 3.2, 3.9)))).toFixed(4);

    const irisR = mix(7, 155, smooth(range(t, 2.35, 3.7)));
    const iOut = smooth(range(t, 5.0, 5.7));
    setScene(scenes[1], t > 2.3 ? 1 - iOut : 0, 6);
    scenes[1].style.clipPath = t < 3.75 ? `circle(${irisR}% at 50% 50%)` : "none";
    if (imgs[1]) {
      const z = mix(1.42, 1.2, smooth(range(t, 2.35, 5.0)));
      const z2 = mix(1.0, 1.12, smooth(range(t, 4.2, 5.6)));
      const y = mix(0.5, -3.2, range(t, 2.35, 5.6));
      imgs[1].style.transformOrigin = "50% 58%";
      imgs[1].style.transform = `scale(${(z * z2).toFixed(4)}) translate3d(0, ${y}%, 0)`;
      imgs[1].style.filter = `brightness(${mix(0.86, 1.03, smooth(range(t, 2.35, 3.6)))})`;
    }
    if (copies[1]) { const ci = smooth(range(t, 3.7, 4.4)), co = smooth(range(t, 4.5, 5.0)); copies[1].style.opacity = (ci * (1 - co)).toFixed(4); copies[1].style.transform = `translate3d(0,${mix(16, -12, ci)}px,0)`; }

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

  // ── reduced-motion 저강도: 큰 줌/3D/마스크 없이 장면 자동 크로스페이드 ──
  function renderSoft(t) {
    // 저강도 자동 크로스페이드: 외관(~1.6s) → 실내(~1.5s) → 식탁(~1.4s), 각 1.2~1.8s
    setScene(scenes[0], 1 - smooth(range(t, 1.6, 2.3)), 4);
    setScene(scenes[1], smooth(range(t, 1.6, 2.3)) * (1 - smooth(range(t, 3.4, 4.1))), 6);
    setScene(scenes[2], smooth(range(t, 3.4, 4.1)), 8);
    // 큰 변형 없음(가독성 레이어/이미지는 그대로). 카피는 씬 opacity로 게이팅됨.
  }

  const END = 7.4;
  const END_SOFT = 4.9;

  function showButton() { if (buttonShown) return; buttonShown = true; btn.classList.add("show"); dlog(); }
  function releaseWillChange() { imgs.forEach((im) => im && (im.style.willChange = "auto")); }
  function settleCard() { fitInsideClone(); cardStage.classList.add("is-visible"); }

  function loop(now) {
    if (!startTs) startTs = now;
    const t = (now - startTs) / 1000;
    render(Math.min(t, END)); dlog(t);
    if (t >= 6.9) settleCard();
    if (t >= 7.15) showButton();
    if (t < END && !done) rafId = requestAnimationFrame(loop);
    else if (!done) { render(END); settleCard(); showButton(); }
  }
  function loopSoft(now) {
    if (!startTs) startTs = now;
    const t = (now - startTs) / 1000;
    renderSoft(Math.min(t, END_SOFT)); dlog(t);
    if (t >= 4.5) settleCard();
    if (t >= 4.7) showButton();
    if (t < END_SOFT && !done) rafId = requestAnimationFrame(loopSoft);
    else if (!done) { renderSoft(END_SOFT); settleCard(); showButton(); }
  }

  function focusBody() {
    if (!bodyTarget) return;
    bodyTarget.setAttribute("tabindex", "-1");
    try { bodyTarget.focus({ preventScroll: true }); } catch (e) {}
  }

  // 인트로 소비: 실제 본문 정렬 후 인트로 높이 제거 + 스크롤 보정 → 위로 스크롤해도 재등장 없음
  function consumeIntro() {
    if (intro.classList.contains("is-consumed")) return;
    const h = intro.offsetHeight;
    const y = window.pageYOffset || window.scrollY || 0;
    intro.classList.add("is-consumed");
    window.scrollTo(0, Math.max(0, y - h));
  }

  // ── 카드 개봉 → 안쪽 확대 → 실제 본문 모프 → 인트로 소비 ──
  function openAndMorph() {
    if (opened) return; opened = true; done = true;
    if (rafId) cancelAnimationFrame(rafId);
    btn.classList.remove("show");
    settleCard();
    releaseWillChange();

    if (reduce) {
      // 저강도: 3D 폴드 생략, 부드러운 페이드로 본문 모프
      morph.style.transition = "opacity .4s ease";
      morph.classList.add("on");
      cardStage.style.transition = "opacity .35s ease"; cardStage.style.opacity = "0";
      window.setTimeout(() => {
        (realCopy || bodyTarget).scrollIntoView({ block: "start" });
        consumeIntro();
        requestAnimationFrame(() => {
          morph.classList.remove("on");
          window.setTimeout(() => { morph.style.pointerEvents = "none"; focusBody(); dlog(); }, 440);
        });
      }, 430);
      return;
    }

    // 1) 표지 열림(좌측 경첩 3D 폴드)
    card.classList.add("is-open");
    // 2) 안쪽 종이 확대 → 불투명 모프가 화면을 덮음
    window.setTimeout(() => {
      morph.classList.add("on");
      morphCol.animate([{ transform: "scale(.66)" }, { transform: "scale(1)" }], { duration: 680, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" });
      cardStage.style.transition = "opacity .45s ease"; cardStage.style.opacity = "0";
      // 3) 불투명 모프 뒤에서 실제 섹션 정렬 + 인트로 소비 + 스크롤 보정 → 페이드아웃(점프 0)
      window.setTimeout(() => {
        (realCopy || bodyTarget).scrollIntoView({ block: "start" });
        consumeIntro();
        requestAnimationFrame(() => {
          morph.style.transition = "opacity .6s ease";
          morph.classList.remove("on");
          window.setTimeout(() => { morph.style.pointerEvents = "none"; focusBody(); dlog(); }, 640);
        });
      }, 760);
    }, 1080);
  }
  btn.addEventListener("click", openAndMorph);

  // 본문 바로가기: 즉시 종료(연출 없이 실제 본문) + 인트로 소비
  const skip = intro.querySelector(".cine-skip");
  if (skip) skip.addEventListener("click", (e) => {
    e.preventDefault();
    done = true; opened = true; if (rafId) cancelAnimationFrame(rafId);
    cardStage.style.display = "none"; morph.style.display = "none";
    releaseWillChange();
    consumeIntro();
    if (bodyTarget) bodyTarget.scrollIntoView({ block: "start" });
    focusBody();
  });

  // 스크롤 임계: 막지 않되 인트로 즉시 완료(카드 정착 + 버튼). 강제 이동 없음.
  let scrollHandled = false;
  function onScroll() {
    if (scrollHandled) return;
    if (window.scrollY > 56) {
      scrollHandled = true; window.removeEventListener("scroll", onScroll);
      if (done || opened) return;
      done = true; if (rafId) cancelAnimationFrame(rafId);
      (reduce ? renderSoft : render)(reduce ? END_SOFT : END); settleCard(); showButton(); releaseWillChange();
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── 시작(reduce여도 자동재생 유지) ──
  function start() {
    if (started) return; started = true; fitInsideClone();
    rafId = requestAnimationFrame(reduce ? loopSoft : loop);
    dlog(0);
  }
  window.addEventListener("resize", fitInsideClone, { passive: true });
  dlog();
  if (imgs[0] && imgs[0].complete && imgs[0].naturalWidth) start();
  else { if (imgs[0]) imgs[0].addEventListener("load", start, { once: true }); window.setTimeout(start, 1200); }
})();
