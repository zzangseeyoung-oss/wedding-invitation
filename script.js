const toast = document.querySelector(".toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
      showToast("주소를 복사했습니다.");
    } catch {
      showToast(text);
    }
  });
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
        await navigator.clipboard.writeText(window.location.href);
        showToast("링크를 복사했습니다.");
      }
    } catch {
      showToast("공유를 취소했습니다.");
    }
  });
});
