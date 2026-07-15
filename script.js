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
    const shareData = {
      title: "장시영 · 이근영 결혼식에 초대합니다",
      text: "2026년 10월 10일 토요일 오후 12시 30분, 용인 코티지 보타닉 하우스",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyText(window.location.href);
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
