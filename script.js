const toast = document.querySelector(".toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

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

const guestbookMessages = document.querySelector("[data-guestbook-messages]");

function renderGuestbookStatus(message) {
  if (!guestbookMessages) return;
  guestbookMessages.replaceChildren();
  const status = document.createElement("p");
  status.className = "guestbook-status";
  status.textContent = message;
  guestbookMessages.append(status);
}

function cleanCommentBody(body) {
  return body.replace(/<!--[\s\S]*?-->/g, "").trim();
}

async function loadGuestbookMessages() {
  if (!guestbookMessages) return;

  try {
    const issuesResponse = await fetch(
      "https://api.github.com/repos/zzangseeyoung-oss/wedding-invitation/issues?state=all&labels=guestbook&per_page=20",
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!issuesResponse.ok) throw new Error("Unable to load guestbook issue");

    const issues = await issuesResponse.json();
    const issue = issues.find(
      (item) => !item.pull_request && item.title.includes("장시영") && item.title.includes("이근영"),
    );

    if (!issue) {
      renderGuestbookStatus("아직 남겨진 축하 글이 없습니다. 첫 번째 마음을 남겨주세요.");
      return;
    }

    const commentsResponse = await fetch(issue.comments_url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!commentsResponse.ok) throw new Error("Unable to load guestbook comments");

    const comments = (await commentsResponse.json())
      .map((comment) => ({ ...comment, cleanBody: cleanCommentBody(comment.body || "") }))
      .filter((comment) => comment.cleanBody);

    if (!comments.length) {
      renderGuestbookStatus("아직 남겨진 축하 글이 없습니다. 첫 번째 마음을 남겨주세요.");
      return;
    }

    guestbookMessages.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "guestbook-list-heading";
    const title = document.createElement("strong");
    title.textContent = "도착한 축하 글";
    const count = document.createElement("span");
    count.textContent = `${comments.length}개의 마음`;
    heading.append(title, count);
    guestbookMessages.append(heading);

    const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    comments.slice(-5).reverse().forEach((comment) => {
      const article = document.createElement("article");
      article.className = "guestbook-card";
      const header = document.createElement("header");
      const author = document.createElement("strong");
      author.textContent = comment.user?.login || "축하 손님";
      const time = document.createElement("time");
      time.dateTime = comment.created_at;
      time.textContent = dateFormatter.format(new Date(comment.created_at));
      const body = document.createElement("p");
      body.textContent = comment.cleanBody;
      header.append(author, time);
      article.append(header, body);
      guestbookMessages.append(article);
    });
  } catch {
    renderGuestbookStatus("축하 글은 작성창에서 확인하실 수 있습니다.");
  }
}

loadGuestbookMessages();

const guestbookToggle = document.querySelector("[data-guestbook-toggle]");
const guestbookCloseButtons = document.querySelectorAll("[data-guestbook-close]");
const guestbookCompose = document.querySelector("[data-guestbook-compose]");
const utterancesContainer = document.querySelector("[data-utterances-container]");
let guestbookLoaded = false;

function loadGuestbookComposer() {
  if (guestbookLoaded || !utterancesContainer) return;
  const script = document.createElement("script");
  script.src = "https://utteranc.es/client.js";
  script.setAttribute("repo", "zzangseeyoung-oss/wedding-invitation");
  script.setAttribute("issue-term", "pathname");
  script.setAttribute("label", "guestbook");
  script.setAttribute("theme", "boxy-light");
  script.setAttribute("crossorigin", "anonymous");
  script.async = true;
  utterancesContainer.append(script);
  guestbookLoaded = true;
}

function setGuestbookOpen(open) {
  if (!guestbookToggle || !guestbookCompose) return;
  guestbookCompose.hidden = !open;
  document.body.classList.toggle("guestbook-is-open", open);
  guestbookToggle.setAttribute("aria-expanded", String(open));
  guestbookToggle.querySelector(".guestbook-open-label").textContent = open
    ? "작성창 닫기"
    : "축하 글 남기기";

  if (open) {
    loadGuestbookComposer();
    window.setTimeout(() => guestbookCompose.querySelector(".compose-heading button")?.focus(), 80);
  } else {
    guestbookToggle.focus();
  }
}

guestbookToggle?.addEventListener("click", () => {
  setGuestbookOpen(guestbookToggle.getAttribute("aria-expanded") !== "true");
});

guestbookCloseButtons.forEach((button) => {
  button.addEventListener("click", () => setGuestbookOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && guestbookCompose && !guestbookCompose.hidden) {
    setGuestbookOpen(false);
  }
});
