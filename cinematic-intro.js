/*
 * 시네마틱 인트로 — pinned scroll sequence.
 * 기능 코드와 분리. JS가 실패하거나 모션 최소화가 켜지면 첫 장면 후 본문으로 폴백한다.
 */
(function () {
  "use strict";

  const intro = document.querySelector("[data-cine]");
  if (!intro) return;

  const invitation = intro.closest(".invitation");
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scenes = [...intro.querySelectorAll(".cine-scene")];
  const images = scenes.map((scene) => scene.querySelector(".cine-img"));
  const copies = scenes.map((scene) => scene.querySelector(".cine-copy"));

  if (!scenes.length) return;

  // 이미지 로드 상태. 실패해도 LQIP 배경과 본문은 남는다.
  images.forEach((img) => {
    if (!img) return;
    if (img.complete && img.naturalWidth) img.classList.add("loaded");
    else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
    img.addEventListener("error", () => img.classList.add("loaded"), { once: true });
  });

  intro.classList.add("js-on");
  if (invitation) invitation.classList.add("cine-pinned");

  // 기존 HTML을 건드리지 않고 런타임에 하나의 고정 스테이지로 묶는다.
  const stage = document.createElement("div");
  stage.className = "cine-stage";
  const skip = intro.querySelector(".cine-skip");
  if (skip) stage.appendChild(skip);
  scenes.forEach((scene) => stage.appendChild(scene));

  const progress = document.createElement("div");
  progress.className = "cine-progress";
  progress.setAttribute("aria-hidden", "true");
  progress.innerHTML = "<i></i>";
  stage.appendChild(progress);

  const paperFade = document.createElement("div");
  paperFade.className = "cine-paper-fade";
  paperFade.setAttribute("aria-hidden", "true");
  stage.appendChild(paperFade);
  intro.appendChild(stage);

  if (reduce) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const range = (value, start, end) => clamp((value - start) / (end - start));
  const smooth = (value) => value * value * (3 - 2 * value);
  const mix = (from, to, amount) => from + (to - from) * amount;

  function setScene(scene, opacity, visible) {
    scene.style.opacity = opacity.toFixed(4);
    scene.style.visibility = visible ? "visible" : "hidden";
    scene.style.zIndex = visible ? String(Math.round(opacity * 10) + 1) : "0";
  }

  function render(rawProgress) {
    const p = clamp(rawProgress);

    // 외관: 첫 1/3 동안 입구 쪽으로 천천히 전진한 뒤 실내와 겹쳐 사라짐.
    const exteriorOut = smooth(range(p, 0.24, 0.42));
    const exteriorOpacity = 1 - exteriorOut;
    setScene(scenes[0], exteriorOpacity, exteriorOpacity > 0.002);
    if (images[0]) {
      const z = mix(1.01, 1.145, smooth(range(p, 0, 0.42)));
      const y = mix(0, -1.8, range(p, 0, 0.42));
      images[0].style.transform = `scale(${z}) translate3d(0, ${y}%, 0)`;
      images[0].style.filter = `brightness(${mix(1, 0.88, exteriorOut)})`;
    }
    if (copies[0]) {
      const cp = smooth(range(p, 0.17, 0.34));
      copies[0].style.opacity = (1 - cp).toFixed(4);
      copies[0].style.transform = `translate3d(0, ${mix(0, -18, cp)}px, 0)`;
    }

    // 실내: 외관 뒤에서 나타나 천천히 아일 안쪽으로 전진, 청첩장 장면과 교차.
    const interiorIn = smooth(range(p, 0.25, 0.43));
    const interiorOut = smooth(range(p, 0.61, 0.78));
    const interiorOpacity = interiorIn * (1 - interiorOut);
    setScene(scenes[1], interiorOpacity, interiorOpacity > 0.002);
    if (images[1]) {
      const z = mix(1.08, 1.18, smooth(range(p, 0.28, 0.76)));
      const y = mix(1.2, -2.4, range(p, 0.28, 0.76));
      images[1].style.transform = `scale(${z}) translate3d(0, ${y}%, 0)`;
      images[1].style.filter = `brightness(${mix(0.9, 1.02, interiorIn)})`;
    }
    if (copies[1]) {
      const copyIn = smooth(range(p, 0.34, 0.47));
      const copyOut = smooth(range(p, 0.57, 0.69));
      const opacity = copyIn * (1 - copyOut);
      copies[1].style.opacity = opacity.toFixed(4);
      copies[1].style.transform = `translate3d(0, ${mix(16, -12, copyIn)}px, 0)`;
    }

    // 청첩장: 식탁 장면이 나타나고 카드 쪽으로 줌인. 마지막은 본문 종이에 녹아든다.
    const invitationIn = smooth(range(p, 0.62, 0.79));
    const invitationOpacity = invitationIn;
    setScene(scenes[2], invitationOpacity, invitationOpacity > 0.002);
    if (images[2]) {
      const zoomProgress = smooth(range(p, 0.65, 1));
      const z = mix(1.055, 1.26, zoomProgress);
      const x = mix(0, -1.2, zoomProgress);
      const y = mix(0.8, -2.6, zoomProgress);
      images[2].style.transform = `scale(${z}) translate3d(${x}%, ${y}%, 0)`;
      images[2].style.filter = `brightness(${mix(0.92, 1.03, invitationIn)})`;
    }
    if (copies[2]) {
      const copyIn = smooth(range(p, 0.72, 0.84));
      const copyOut = smooth(range(p, 0.93, 1));
      const opacity = copyIn * (1 - copyOut);
      copies[2].style.opacity = opacity.toFixed(4);
      copies[2].style.transform = `translate3d(0, ${mix(18, -10, copyIn)}px, 0)`;
    }

    const cue = stage.querySelector(".cine-cue");
    intro.classList.toggle("has-progress", p > 0.018);
    if (cue) cue.style.visibility = p < 0.2 ? "visible" : "hidden";
    const bar = progress.querySelector("i");
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    paperFade.style.opacity = smooth(range(p, 0.91, 1)).toFixed(4);
  }

  let ticking = false;
  function update() {
    ticking = false;
    const rect = intro.getBoundingClientRect();
    const scrollable = Math.max(1, intro.offsetHeight - window.innerHeight);
    const p = clamp(-rect.top / scrollable);
    render(p);
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  window.addEventListener("orientationchange", requestUpdate, { passive: true });
  update();
})();
