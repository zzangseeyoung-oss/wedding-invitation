/*
 * AI 대화 기능 제거 상태.
 *
 * 청첩장 본문·배경음악·지도·계좌·방명록은 그대로 유지하고,
 * 기존 AI 진입 카드와 채팅 오버레이만 DOM에서 제거한다.
 * 네트워크 요청이나 로컬 AI 백엔드 호출은 수행하지 않는다.
 */

const AI_STORAGE_KEY_PATTERNS = [
  /^couple_story_chat_/,
  /^wedding_dael(?:_rael)?_chat_/,
];

function removeAiStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && AI_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // 저장소 접근이 막힌 브라우저에서도 청첩장 본문은 계속 동작해야 한다.
  }
}

function removeAiUi() {
  document.querySelectorAll('.story-ai-card, [data-story-chat], #story-ai-chat').forEach((element) => {
    element.remove();
  });

  document.body.classList.remove('story-ai-open');
  document.documentElement.classList.remove('story-ai-open');
}

removeAiStorage();
removeAiUi();
