/* 시영과 근영의 이야기 — 이름 없는 대화형 안내. 두 사람의 공개 이야기와 결혼식 정보를 전한다.
 *
 * 원칙:
 * - 특정 캐릭터(다엘 등)·미래의 아이·가상 인물을 연기하지 않는다. 이름을 붙이지 않는다.
 * - 기존 축하 방명록과 완전히 독립. 방명록 글/댓글/사진/작성자 정보를 읽거나 서버로 보내지 않는다.
 * - 백엔드(로컬 GPU) 엔드포인트가 설정되면 실제 대화, 없으면 정적 FAQ 안내(fallback)로 동작.
 * - 모델/서버가 준 문자열은 textContent로만 렌더한다(HTML 삽입 금지).
 * - 영상용 상세 연애 본편은 이 파일 어디에도 넣지 않는다(백엔드 정책과 동일하게 fallback도 보류 답변).
 * - 두 사람이 만난 이야기 = 2025년 초 차트 분석 스터디(시영=선생, 근영=수강생). 온라인 아님.
 */

// 로컬 GPU 백엔드 연결 주소. 빈 문자열이면 백엔드 없이 정적 안내 모드로 동작한다.
const CHAT_ENDPOINT = "https://princess-recommend-radiation-clay.trycloudflare.com/api/chat";

// §29 저장 키/버전 상향(couple_story_chat_v4). 이전 다엘 대화(v1)는 복원하지 않는다.
const STORAGE_KEY = "couple_story_chat_v4";
const STORAGE_VERSION = 4;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const MAX_TURNS = 20;
const HISTORY_SEND = 16; // 서버로 보낼 최근 메시지 수(질문·답변)
const REQUEST_TIMEOUT = 20000;

const WELCOME =
  "안녕하세요. 시영과 근영, 두 사람의 이야기를 소개해 드리는 안내예요. 🌿\n두 사람이 어떻게 만났는지, 어떤 일을 하는지, 결혼식은 언제인지 편하게 물어보세요.";

// 추상적인 '두 줄' 상징(두 사람이 만나 하나로 이어지는 결). 캐릭터 얼굴·인장·달·별 없음. 정적 상수라 삽입 안전.
const SPRIG_SVG =
  '<svg class="story-sprig" viewBox="0 0 40 40" aria-hidden="true"><path d="M13 9 C 17 19, 18 26, 20 31.5" fill="none" stroke="#2f5d3a" stroke-width="2.2" stroke-linecap="round"/><path d="M27 9 C 23 19, 22 26, 20 31.5" fill="none" stroke="#c1a24a" stroke-width="2.2" stroke-linecap="round"/></svg>';

const INITIAL_SUGGESTIONS = [
  "두 사람은 어떻게 만났나요?",
  "시영은 무슨 일을 해요?",
  "근영은 무슨 일을 해요?",
  "서로의 어떤 점을 좋아하나요?",
  "두 사람은 몇 살이에요?",
  "결혼식은 언제예요?",
  "주차는 가능한가요?",
];

/* ---------- 정적 FAQ (fallback / 백엔드 장애 시) — 백엔드 v4 정본과 동일 사실 ---------- */
const A = {
  identity:
    "이 청첩장 안에서 시영과 근영의 공개된 이야기를 정리해 소개하는 안내예요.\n두 사람과 결혼식에 관해 궁금한 내용을 물어보시면 돼요.",
  dael_gone:
    "이제는 시영과 근영의 이야기를 직접 소개해 드리고 있어요.\n두 사람과 결혼식에 대해 궁금한 걸 편하게 물어보세요.",
  seeyoung_who:
    "장시영은 이번에 결혼하는 신랑이에요.\n데이터를 분석해 더 나은 의사결정을 돕는 데이터사이언티스트로 일하고 있어요.",
  geunyoung_who:
    "이근영은 이번에 결혼하는 신부예요.\n피트니스 센터 운영 컨설턴트로 일하고 있어요.",
  seeyoung_profession:
    "시영은 데이터사이언티스트예요.\n데이터를 분석해 시장과 사람의 움직임을 이해하고, 더 나은 의사결정을 돕는 일을 하고 있어요.",
  seeyoung_fields:
    "수리모델링과 응용 데이터사이언스를 중심으로, 시장·가격·마케팅 데이터를 분석하는 분야에 관심이 많아요.",
  seeyoung_company:
    "시영이 다니는 회사나 내부 프로젝트는 청첩장에서는 소개하지 않을게요.\n데이터사이언티스트로 일한다는 정도로 전해 드리고 있어요.",
  geunyoung_profession:
    "근영은 피트니스 센터 운영 컨설턴트예요.\n센터가 안정적이고 효율적으로 운영될 수 있도록 운영 방향과 개선 방안을 함께 고민하는 일을 해요.",
  geunyoung_trainer:
    "운동을 직접 지도하는 트레이너라기보다, 피트니스 센터의 운영 방향과 개선을 돕는 컨설턴트예요.",
  geunyoung_own_center:
    "근영은 피트니스 센터의 운영을 돕는 컨설턴트예요.\n직접 소유하거나 운영하는 센터가 있는지는 확인된 이야기가 아니라, 임의로 단정하지는 않을게요.",
  geunyoung_workplace:
    "근영이 일하는 구체적인 회사나 센터는 청첩장에서는 소개하지 않을게요.\n피트니스 센터 운영을 돕는 컨설턴트라는 정도로 전해 드려요.",
  both_profession:
    "시영은 데이터를 분석해 의사결정을 돕는 데이터사이언티스트이고, 근영은 피트니스 센터 운영을 돕는 컨설턴트예요.\n분야는 다르지만 두 사람 모두 더 나은 방법을 찾는 일을 하고 있어요.",
  commonality:
    "관심 분야는 다르지만, 두 사람 모두 문제를 찬찬히 살펴보고 더 나은 방법을 찾는 일을 한다는 점이 닮았어요.\n소중한 것에 정성을 다하는 마음도 비슷하고요.",
  seeyoung_personality:
    "시영은 궁금한 것이 생기면 깊이 파고들고, 소중한 일과 사람에게 진심과 책임을 다하는 사람이에요.",
  geunyoung_personality:
    "근영은 작은 부분까지 세심하게 살피고, 따뜻한 응원과 배려를 행동으로 보여주는 사람이에요.",
  seeyoung_age: "시영은 1988년생이고, 결혼식 날에는 만 37세예요.",
  geunyoung_age: "근영은 1992년생이고, 결혼식 날에는 만 34세예요.",
  age: "시영은 1988년생, 근영은 1992년생이라 출생연도 기준 네 살 차이예요.\n결혼식 날에는 각각 만 37세와 만 34세예요.",
  meeting:
    "두 사람은 2025년 초 차트 분석 스터디에서 만났어요.\n시영은 스터디를 이끈 선생이었고, 근영은 배우는 수강생이자 우수 수료생이었어요.\n함께 공부하고 이야기를 나누며 자연스럽게 가까워졌습니다.",
  online_meeting:
    "아니요. 두 사람의 첫 인연은 시영이 이끌던 차트 분석 스터디였어요.\n그곳에서 선생과 제자로 처음 알게 됐습니다.",
  study_detail:
    "차트 분석을 함께 공부하는 스터디였어요.\n시영이 이끌며 가르쳤고, 근영은 배우는 수강생이었습니다.",
  geunyoung_student: "네, 근영은 그 스터디의 수강생이자 우수 수료생이었어요.",
  first_offline: "두 사람이 처음 직접 만난 날은 2025년 3월 29일이에요.",
  first_sight:
    "처음부터 연인을 전제로 만난 건 아니었어요.\n함께 공부하고 대화를 나누며 서로의 모습을 천천히 알아가면서 가까워졌습니다.",
  fate:
    "차트 분석 스터디에서 선생과 제자로 시작한 인연이 배움과 대화, 서로를 알아가는 시간으로 이어져 결혼까지 닿았어요.\n그런 점에서 특별한 만남으로 기억하고 있어요. 🌿",
  who_first:
    "두 사람이 서로를 분명하게 선택하게 된 과정은 나중에 영상으로 직접 전하려고 남겨두었어요.\n지금은 스터디에서 만나 천천히 연을 쌓아왔다는 이야기까지만 소개해 드릴게요. 🌿",
  since:
    "두 사람은 2025년 초부터 자연스럽게 연을 쌓으며 지냈어요.\n어느 하루를 시작일로 정하기보다, 서로를 알아간 시간 전체를 소중하게 생각하고 있어요.",
  dating_start:
    "두 사람은 2025년 초부터 자연스럽게 연을 쌓으며 지냈어요.\n어느 하루를 시작일로 정하기보다, 함께 공부하고 대화하며 가까워진 시간 전체를 소중하게 생각하고 있어요.",
  family:
    "네. 근영의 가족은 2025년 초부터 두 사람이 좋은 인연을 이어가고 있다는 사실을 알고 있었어요.",
  geunyoung_view:
    "근영은 시영의 박학다식함뿐 아니라 순수하고 진정성 있는 모습, 소중한 일과 사람에게 책임을 다하는 점을 좋아해요.",
  seeyoung_view:
    "시영은 근영의 따뜻한 응원과 세심한 배려, 말보다 행동으로 마음을 보여주는 모습과 함께 있을 때 느껴지는 편안함을 소중하게 생각해요.",
  why_match:
    "시영은 관계에 안정감을, 근영은 따뜻함과 세심함을 더해 주는 사람이에요.\n서로 다른 결이 자연스럽게 균형을 이루고 있어요.",
  video_reserved:
    "두 사람이 서로를 분명하게 선택하게 된 과정은 나중에 영상으로 직접 전하려고 남겨두었어요.\n지금은 스터디에서 만나 2025년 초부터 천천히 연을 쌓아왔다는 이야기까지만 소개해 드릴게요. 🌿",
  hold_scene:
    "그 장면은 두 사람의 이야기에서 특히 중요한 순간이라, 나중에 공개될 영상에서 두 사람이 직접 전하려고 남겨두었어요.",
  letter:
    "두 사람 사이에 오간 마음은 두 사람만의 이야기로 남겨 두었어요.\n구체적인 내용은 영상으로 전해질 예정이에요.",
  wedding:
    "결혼식은 2026년 10월 10일 토요일 오후 12시 30분이에요.\n용인 코티지 보타닉 하우스에서 두 사람이 기다리고 있어요.",
  address: "결혼식 장소는 경기 용인시 처인구 신송로55번길 10, 용인 코티지 보타닉 하우스예요.",
  floor: "층수는 따로 안내하지 않고 있어요.\n도착하셔서 현장 안내를 따라 오시면 편하게 찾으실 수 있어요.",
  parking: "현장에 주차하실 수 있어요.\n도착하시면 현장 안내를 따라 이용해 주세요.",
  guest_feed: "청첩장 아래쪽 축하 공간에서 두 사람에게 축하 글을 남기실 수 있어요.",
  account: "마음을 전해 주시는 것만으로도 감사해요.\n자세한 안내는 청첩장의 ‘마음 전하실 곳’에 준비되어 있어요.",
  privacy:
    "그 내용은 두 사람의 사적인 영역이라 이 청첩장에서는 다루지 않을게요.\n대신 공개된 이야기 안에서 궁금한 점은 편하게 물어보세요.",
  unknown_attr:
    "그건 아직 청첩장에 담지 않은 이야기예요.\n대신 두 사람이 어떻게 만났는지, 어떤 일을 하는지, 서로의 어떤 점을 좋아하는지는 편하게 물어보세요.",
  wedding_tbd: "그 부분은 아직 정해지지 않았어요.\n준비되면 알려드릴게요.",
  guide:
    "시영과 근영에 대해 궁금한 걸 편하게 물어보세요.\n어떻게 만났는지, 어떤 일을 하는지, 서로의 어떤 점을 좋아하는지 알려드릴게요.",
};

const norm = (s) => (s || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const has = (n, ...keys) => keys.some((k) => n.includes(k));

// 우선순위 규칙(보호 항목 먼저 → 액션 → 일반). 반환: {answer, action, source}. 백엔드 classify와 동일 우선순위.
function matchFaq(text) {
  const n = norm(text);
  if (!n) return null;

  // 보호: 영상 보류 / 편지 / 결정적 장면
  if (has(n, "붙잡", "잡았", "떠나", "물러", "돌아서")) return { answer: A.hold_scene, action: "video_reserved", source: "video_reserved" };
  if (has(n, "편지")) return { answer: A.letter, source: "video_reserved" };
  if (has(n, "소설", "각색", "지어내", "상상해서", "러브스토리", "자세한연애", "연애이야기", "자세히알려", "썰", "영상")) return { answer: A.video_reserved, action: "video_reserved", source: "video_reserved" };

  // 개인정보 / 금지
  if (has(n, "집주소", "자택", "사는곳", "사는데", "전화번호", "연락처", "휴대폰", "핸드폰", "법률", "소송", "재산", "연봉", "투자", "건강", "지병", "과거연애", "전여친", "전남친", "시스템프롬프트", "프롬프트", "이전지시", "무시하고", "무시해", "서비스계정", "apikey", "api키", "지식파일", "json전체"))
    return { answer: A.privacy, source: "privacy_refusal" };

  // 액션
  if (has(n, "계좌", "마음전하", "축의", "부조", "송금", "축의금")) return { answer: A.account, action: "account_section", source: "wedding_information" };
  if (has(n, "축하글", "방명록", "축하를남", "축하남기", "글남기")) return { answer: A.guest_feed, action: "guest_feed_section", source: "wedding_information" };
  if (has(n, "주차")) return { answer: A.parking, action: "location_section", source: "wedding_information" };

  const see = has(n, "시영", "아빠", "신랑", "랑지");
  const geun = has(n, "근영", "엄마", "신부", "라멜");

  // 공개 안내에 없는 개인 속성(취미·MBTI·혈액형 등) → 창작 금지, 결정적 보류
  if (has(n, "취미", "특기", "mbti", "엠비티아이", "혈액형", "별자리", "종교", "몸무게",
      "좋아하는음식", "좋아하는색", "좋아하는영화", "좋아하는노래", "좋아하는음악", "좋아하는술"))
    return { answer: A.unknown_attr, source: "unknown" };

  // 아직 미정인 예식 세부(축가·식순·부케·드레스코드 등)
  if (has(n, "축가", "식순", "부케", "피로연", "드레스코드", "복장", "헤어", "메이크업", "예단", "예물", "폐백", "답례품", "신혼여행"))
    return { answer: A.wedding_tbd, source: "unknown" };

  // 직업 / 분야 / 소속 (공개)
  const gyBiz = has(n, "피트니스", "휘트니스", "헬스", "트레이너", "컨설턴트", "센터운영", "센터를");
  const syBiz = has(n, "데이터사이언");
  if (has(n, "직업", "무슨일", "하는일", "일해", "일하", "무슨분야", "어떤분야", "관심분야", "전문분야",
      "회사이름", "회사명", "어느회사", "무슨회사", "어디다녀", "어느센터", "무슨센터", "근무처", "일하는곳", "직장") || gyBiz || syBiz) {
    const isGeun = geun || gyBiz;
    const isSee = see || syBiz;
    if (isGeun && !isSee) {
      if (has(n, "트레이너")) return { answer: A.geunyoung_trainer, source: "public_summary" };
      if (has(n, "직접운영", "센터를운영", "직접해", "소유", "직접하는")) return { answer: A.geunyoung_own_center, source: "public_summary" };
      if (has(n, "어디서일", "어느센터", "무슨센터", "어느회사", "회사이름", "회사명", "어디다녀", "근무처", "일하는곳", "직장")) return { answer: A.geunyoung_workplace, source: "public_summary" };
      return { answer: A.geunyoung_profession, source: "public_summary" };
    }
    if (isSee && !isGeun) {
      if (has(n, "회사이름", "회사명", "어느회사", "무슨회사", "어디다녀", "어디서일", "근무처", "일하는곳", "직장")) return { answer: A.seeyoung_company, source: "public_summary" };
      if (has(n, "무슨분야", "어떤분야", "관심분야", "전문분야")) return { answer: A.seeyoung_fields, source: "public_summary" };
      return { answer: A.seeyoung_profession, source: "public_summary" };
    }
    if (isSee && isGeun) return { answer: A.both_profession, source: "public_summary" };
    if (has(n, "무슨분야", "어떤분야", "관심분야", "전문분야")) return { answer: A.seeyoung_fields, source: "public_summary" };
    return { answer: A.both_profession, source: "public_summary" };
  }

  // 나이 (공개)
  if (has(n, "몇살", "나이", "연세", "몇년생", "나이차")) {
    if (has(n, "너", "넌") && !see && !geun) return { answer: A.identity, source: "public_summary" };
    if (see && !geun) return { answer: A.seeyoung_age, source: "public_summary" };
    if (geun && !see) return { answer: A.geunyoung_age, source: "public_summary" };
    return { answer: A.age, source: "public_summary" };
  }

  // 정체 / 안내 (다엘 폐기 → 이름 없는 안내)
  if (has(n, "다엘어디", "다엘은어디", "다엘없", "라엘어디", "다엘사라")) return { answer: A.dael_gone, source: "public_summary" };
  if (see && !geun && has(n, "누구", "정체")) return { answer: A.seeyoung_who, source: "public_summary" };
  if (geun && !see && has(n, "누구", "정체")) return { answer: A.geunyoung_who, source: "public_summary" };
  if (has(n, "다엘", "라엘", "너희는누구", "누구세요", "누구야", "정체", "무슨안내", "챗봇", "언제태어", "태어나")) return { answer: A.identity, source: "public_summary" };

  // 성격
  if (has(n, "어떤사람", "어떤분", "어떤성격", "성격이", "어떤스타일")) {
    if (see && !geun) return { answer: A.seeyoung_personality, source: "public_summary" };
    if (geun && !see) return { answer: A.geunyoung_personality, source: "public_summary" };
  }

  // 만남/관계 (2025년 초 차트 분석 스터디 — 온라인 아님)
  if (has(n, "온라인에서만났", "인터넷에서만났", "오픈채팅", "앱에서만났", "온라인으로만났", "온라인만남", "온라인에서처음")) return { answer: A.online_meeting, source: "public_summary" };
  if (has(n, "어떤스터디", "무슨스터디", "스터디였", "스터디에서", "선생과제자", "제자로만난", "강사였", "가르친", "가르쳤", "차트분석")) return { answer: A.study_detail, source: "public_summary" };
  if (has(n, "학생이었", "수강생이었", "제자였", "수료생")) return { answer: A.geunyoung_student, source: "public_summary" };
  if (has(n, "운명", "특별한만남", "왜특별", "만남이특별")) return { answer: A.fate, source: "public_summary" };
  if (has(n, "정확한연애", "언제부터사귀", "언제사귀", "사귄날", "연애시작", "정식으로사귄", "사귀기시작", "연인이된", "연인된")) return { answer: A.dating_start, source: "public_summary" };
  if (has(n, "처음직접", "처음만난날", "직접만난", "오프라인", "실제로만난", "처음본날", "첫만남날")) return { answer: A.first_offline, source: "public_summary" };
  if (has(n, "어떻게만났", "어디서만났", "어떻게처음", "만나게", "어떻게알게", "만난", "어디서처음")) return { answer: A.meeting, source: "public_summary" };
  if (has(n, "처음부터", "첫눈", "바로좋아", "단번")) return { answer: A.first_sight, source: "public_summary" };
  if (has(n, "누가먼저", "먼저좋아", "먼저고백", "누가고백")) return { answer: A.who_first, source: "public_summary" };
  if (has(n, "가족", "부모님", "어머니", "아버지", "처가", "시댁", "집안", "알고있었")) return { answer: A.family, source: "public_summary" };
  if (has(n, "언제부터")) return { answer: A.since, source: "public_summary" };

  // 서로의 장점(근영↔시영 순서로 관점 결정)
  if (has(n, "좋아", "어떤점", "매력", "장점", "좋은점", "반한", "어떻게생각", "어떻게여겨", "어떻게봐", "어떤마음")) {
    const mi = Math.min(...["엄마", "근영"].map((k) => n.indexOf(k)).filter((x) => x !== -1).concat([Infinity]));
    const fi = Math.min(...["아빠", "시영"].map((k) => n.indexOf(k)).filter((x) => x !== -1).concat([Infinity]));
    if (mi !== Infinity || fi !== Infinity) {
      return mi < fi
        ? { answer: A.geunyoung_view, source: "public_summary" }
        : { answer: A.seeyoung_view, source: "public_summary" };
    }
  }
  if (has(n, "공통점", "둘의공통", "닮은점", "비슷한점", "공통된")) return { answer: A.commonality, source: "public_summary" };
  if (has(n, "잘맞", "어울리", "왜좋아", "왜결혼")) return { answer: A.why_match, source: "public_summary" };

  // 결혼식 / 장소 / 교통
  if (has(n, "몇층", "층수", "층이야", "몇층이야")) return { answer: A.floor, action: "location_section", source: "wedding_information" };
  if (has(n, "주소알려", "주소가", "주소는", "주소좀", "주소를", "정확한주소")) return { answer: A.address, action: "location_section", source: "wedding_information" };
  if (has(n, "결혼식", "예식", "웨딩", "몇시", "언제해", "언제결혼", "언제예요", "며칠", "날짜", "식장", "오시는길", "어디서해", "장소", "위치", "어떻게가", "가는길", "교통"))
    return { answer: A.wedding, action: "location_section", source: "wedding_information" };

  return null;
}

/* ---------- 저장(7일 복원) ---------- */
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let sessionId = null;
let messages = []; // {role:"user"|"assistant", text}
let memorySummary = "";
let turnCount = 0;
let initialized = false;
let sending = false;
let composing = false;
let assistantLabeled = false; // 첫 안내 라벨(상징)을 한 번만
let sendGen = 0; // 전송 세대 토큰(새 이야기/중복 방지)
let activeController = null; // 진행 중 요청 중단용

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function persist() {
  const data = {
    version: STORAGE_VERSION,
    session_id: sessionId,
    messages,
    memory_summary: memorySummary,
    turn_count: turnCount,
    last_updated_at: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 저장 불가 시 무시 */
    }
  }
}

function loadSaved() {
  const read = (store) => {
    try {
      return JSON.parse(store.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  };
  const raw = read(localStorage) || read(sessionStorage);
  if (!raw || raw.version !== STORAGE_VERSION) return null;
  if (!raw.last_updated_at || Date.now() - raw.last_updated_at > TTL_MS) return null;
  if (!Array.isArray(raw.messages)) return null;
  return raw;
}

/* ---------- DOM ---------- */
const mainEl = document.querySelector("main.invitation");
const chatEl = document.querySelector("[data-story-chat]");
const panelEl = chatEl?.querySelector(".story-ai-panel");
const messagesEl = document.querySelector("[data-story-messages]");
const formEl = document.querySelector("[data-story-form]");
const textarea = document.querySelector("[data-story-textarea]");
const sendBtn = document.querySelector("[data-story-send]");
const toggleBtn = document.querySelector("[data-story-toggle]");
const closeButtons = document.querySelectorAll("[data-story-close]");
const restartBtn = document.querySelector("[data-story-restart]");
const jumpBtn = document.querySelector("[data-story-jump]");

/* ---------- 렌더 ---------- */
function renderMessage(role, text, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = `story-msg story-msg-${role}`;
  if (role === "assistant" && !assistantLabeled) {
    assistantLabeled = true; // 첫 어시스턴트 메시지에만 라벨(그룹 시작에만 상징)
    const label = document.createElement("span");
    label.className = "story-msg-label";
    label.insertAdjacentHTML("beforeend", SPRIG_SVG); // 정적 추상 상징 SVG(안전) — 이름 없음
    wrap.append(label);
  }
  const bubble = document.createElement("div");
  bubble.className = "story-bubble";
  bubble.textContent = text; // HTML 삽입 금지: 모델/서버 문자열은 textContent 로만
  if (opts.fade && !prefersReducedMotion()) bubble.classList.add("story-fade");
  wrap.append(bubble);
  messagesEl.append(wrap);
  if (opts.done) {
    // 글자단위 타이핑 폐지: 문장 전체 fade-in 뒤(또는 즉시) 추천/이동칩 표시
    if (opts.fade && !prefersReducedMotion()) window.setTimeout(opts.done, 180);
    else opts.done();
  }
  return wrap;
}

let suggestionsEl = null;
function clearSuggestions() {
  if (suggestionsEl) {
    suggestionsEl.remove();
    suggestionsEl = null;
  }
}
function makeChip(q) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "story-chip";
  chip.textContent = q;
  chip.addEventListener("click", () => send(q));
  return chip;
}
function renderSuggestions(list, opts = {}) {
  clearSuggestions();
  if (!list || !list.length) return;
  const limit = opts.limit || list.length;
  const box = document.createElement("div");
  box.className = "story-suggestions";
  const shown = list.slice(0, limit);
  const rest = list.slice(limit);
  shown.forEach((q) => box.append(makeChip(q)));
  if (opts.more && rest.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "story-chip story-chip-more";
    more.textContent = "더 보기";
    more.addEventListener("click", () => {
      rest.forEach((q) => box.insertBefore(makeChip(q), more));
      more.remove();
    });
    box.append(more);
  }
  messagesEl.append(box);
  suggestionsEl = box;
}

let typingEl = null;
function showTyping() {
  hideTyping();
  const wrap = document.createElement("div");
  wrap.className = "story-msg story-msg-assistant story-typing";
  const bubble = document.createElement("div");
  bubble.className = "story-bubble";
  const dots = document.createElement("span");
  dots.className = "story-dots";
  dots.setAttribute("aria-hidden", "true");
  dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = "두 사람의 이야기를 살펴보고 있어요";
  bubble.append(dots, sr);
  wrap.append(bubble);
  messagesEl.append(wrap);
  typingEl = wrap;
  autoScroll(true);
}
function hideTyping() {
  if (typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

/* ---------- 스크롤 ---------- */
function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 90;
}
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  jumpBtn.hidden = true;
}
function autoScroll(force) {
  if (force || isNearBottom()) {
    scrollToBottom();
  } else {
    jumpBtn.hidden = false;
  }
}
function scrollToAnswerStart(wrap) {
  if (!wrap) return;
  // 답변 전체가 아니라 답변 '시작' 위치가 상단 근처에 오도록(긴 답변도 처음부터 읽힘)
  const top = Math.max(0, wrap.offsetTop - 12);
  const maxTop = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
  messagesEl.scrollTop = Math.min(top, maxTop);
  jumpBtn.hidden = true;
}
messagesEl?.addEventListener("scroll", () => {
  if (isNearBottom()) jumpBtn.hidden = true;
});
jumpBtn?.addEventListener("click", scrollToBottom);

/* ---------- 액션 ---------- */
const ACTION_TARGET = {
  location_section: ".location",
  account_section: ".account-section",
  guest_feed_section: ".guestbook",
};
const ACTION_LABEL = {
  location_section: "오시는 길 보기",
  account_section: "마음 전하실 곳 보기",
  guest_feed_section: "축하 글 보러 가기",
};
function navigateToSection(action) {
  const sel = ACTION_TARGET[action];
  const target = sel && document.querySelector(sel);
  if (!target) return;
  closeChat();
  window.setTimeout(() => {
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, 220);
}
function appendNavChip(action) {
  if (!ACTION_TARGET[action] || !ACTION_LABEL[action]) return;
  if (!suggestionsEl) {
    suggestionsEl = document.createElement("div");
    suggestionsEl.className = "story-suggestions";
    messagesEl.append(suggestionsEl);
  }
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "story-navchip";
  chip.append(document.createTextNode(ACTION_LABEL[action]));
  chip.addEventListener("click", () => navigateToSection(action));
  suggestionsEl.append(chip);
}

/* ---------- 응답 처리 ---------- */
function addAssistant(text, { suggestions, action } = {}) {
  const following = isNearBottom();
  messages.push({ role: "assistant", text });
  const wrap = renderMessage("assistant", text, {
    fade: true,
    done: () => {
      // 답변 후 추천 질문은 최대 2개만
      renderSuggestions(suggestions && suggestions.length ? suggestions : null, { limit: 2 });
      if (action) appendNavChip(action);
      if (following) scrollToAnswerStart(wrap);
    },
  });
  // 답변 '시작' 위치를 보여준다. 사용자가 위를 보고 있으면 강제 이동하지 않고 점프 버튼만.
  if (following) scrollToAnswerStart(wrap);
  else jumpBtn.hidden = false;
}

/* ---------- 백엔드 호출 ---------- */
async function callBackend(text) {
  const controller = new AbortController();
  activeController = controller;
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const history = messages
      .slice(0, -1) // 방금 추가한 사용자 메시지 제외
      .slice(-HISTORY_SEND)
      .map((m) => ({ role: m.role, text: m.text }));
    const resp = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message: text,
        history,
        memory_summary: memorySummary,
        client_context: { page: "wedding_invitation", language: "ko-KR", profile_version: "1.0.0" },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return {
      answer: typeof data.answer === "string" && data.answer.trim() ? data.answer.trim() : "",
      action: typeof data.action === "string" ? data.action : "none",
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter((s) => typeof s === "string").slice(0, 3) : [],
      memory_summary: typeof data.memory_summary === "string" ? data.memory_summary : memorySummary,
    };
  } finally {
    clearTimeout(timer);
    if (activeController === controller) activeController = null;
  }
}

/* ---------- 전송 ---------- */
function setSending(on) {
  sending = on;
  if (sendBtn) sendBtn.disabled = on;
  if (textarea) textarea.disabled = on;
}

function reachedLimit() {
  return turnCount >= MAX_TURNS;
}

/* ---------- 입력 검증(§8) ---------- */
let lastSent = { text: "", at: 0 };
let inputHintEl = null;
let inputHintTimer = 0;
function meaningfulInput(text) {
  // 구두점·기호·공백을 뺀 실제 내용이 있으면 의미 있는 입력('왜?','근영이는?' 등 허용)
  return text.replace(/[\s\p{P}\p{S}]/gu, "").length > 0;
}
function showInputHint(msg) {
  if (!formEl || !formEl.parentNode) return;
  if (!inputHintEl) {
    inputHintEl = document.createElement("div");
    inputHintEl.className = "story-input-hint";
    inputHintEl.setAttribute("role", "status");
    formEl.parentNode.insertBefore(inputHintEl, formEl);
  }
  inputHintEl.textContent = msg;
  inputHintEl.classList.add("show");
  window.clearTimeout(inputHintTimer);
  inputHintTimer = window.setTimeout(() => inputHintEl && inputHintEl.classList.remove("show"), 2200);
}

async function send(rawText) {
  const text = (rawText || "").trim();
  if (sending) return;
  if (!text) return; // 빈 입력: 조용히 무시(말풍선 없음)
  if (!meaningfulInput(text)) {
    // 구두점·기호만 → 말풍선 만들지 않고 안내만
    showInputHint("조금만 더 자세히 적어주세요.");
    if (textarea) {
      textarea.value = "";
      resizeTextarea();
    }
    return;
  }
  const now = Date.now();
  if (text === lastSent.text && now - lastSent.at < 1000) return; // 1초 내 동일 메시지 중복 방지
  lastSent = { text, at: now };

  if (reachedLimit()) {
    clearSuggestions();
    renderMessage("assistant", "오늘 나눌 수 있는 이야기를 모두 나눴어요.\n‘새 이야기’로 다시 시작할 수 있어요.");
    autoScroll(true);
    return;
  }

  const gen = ++sendGen;
  clearSuggestions();
  renderMessage("user", text);
  messages.push({ role: "user", text });
  turnCount += 1;
  if (textarea) {
    textarea.value = "";
    resizeTextarea();
  }
  autoScroll(true);
  persist();

  setSending(true);
  showTyping();

  // 한 요청의 결과를 정확히 한 번만 커밋한다(§6).
  //   aborted → 조용히 폐기(말풍선 없음), failed → 오류 말풍선 1개, res → 성공 답변 1개.
  let res = null;
  let aborted = false;
  let failed = false;
  try {
    if (CHAT_ENDPOINT) {
      res = await callBackend(text);
      if (!res.answer) throw new Error("empty");
    } else {
      await new Promise((r) => setTimeout(r, 380));
      const fb = matchFaq(text);
      res = fb
        ? { answer: fb.answer, action: fb.action || "none", suggestions: [] }
        : { answer: A.guide, action: "none", suggestions: INITIAL_SUGGESTIONS.slice(0, 3) };
    }
  } catch (e) {
    if (e && e.name === "AbortError") aborted = true; // 새 이야기/중복 전송으로 중단 → 오류 아님
    else failed = true;
  }

  // 이 응답이 낡았으면(다른 전송/새 이야기 시작) 성공·실패 어느 것도 커밋하지 않는다.
  if (gen !== sendGen) return;

  hideTyping(); // 정확히 한 번 제거
  if (aborted) {
    setSending(false);
    return; // 오류 말풍선 없음
  }

  try {
    if (!failed && res && res.answer) {
      memorySummary = res.memory_summary !== undefined ? res.memory_summary : memorySummary;
      addAssistant(res.answer, { suggestions: res.suggestions, action: res.action }); // 최종 답변 1개
    } else {
      // terminal error → 오류 말풍선 1개(성공 뒤에 추가되지 않음)
      const fb = matchFaq(text);
      if (fb) addAssistant(fb.answer, { action: fb.action });
      else addAssistant("지금은 잠깐 답변을 드리기 어려워요.\n조금 뒤에 다시 찾아와 주세요.", { suggestions: INITIAL_SUGGESTIONS.slice(0, 3) });
    }
  } finally {
    setSending(false); // addAssistant 렌더 오류가 나도 입력은 반드시 복구
    persist();
    if (reachedLimit()) renderSuggestions(null);
  }
}

/* ---------- 입력창 ---------- */
function resizeTextarea() {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 108)}px`;
}
textarea?.addEventListener("input", resizeTextarea);
textarea?.addEventListener("compositionstart", () => {
  composing = true;
});
textarea?.addEventListener("compositionend", () => {
  composing = false;
});
textarea?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing) {
    e.preventDefault();
    send(textarea.value);
  }
});
formEl?.addEventListener("submit", (e) => {
  e.preventDefault();
  send(textarea.value);
});

/* ---------- 시트 열고 닫기 ---------- */
function syncViewport() {
  if (!chatEl || chatEl.hidden || !window.visualViewport) return;
  const vv = window.visualViewport;
  chatEl.style.top = `${vv.offsetTop}px`;
  chatEl.style.height = `${vv.height}px`;
  chatEl.style.bottom = "auto";
}
function resetViewport() {
  if (!chatEl) return;
  chatEl.style.top = "";
  chatEl.style.height = "";
  chatEl.style.bottom = "";
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}

function closeGuestbookIfOpen() {
  const gb = document.querySelector("[data-guestbook-compose]");
  if (gb && !gb.hidden) {
    const btn = gb.querySelector("[data-guestbook-close]");
    if (btn) btn.click();
    else {
      gb.hidden = true;
      document.body.classList.remove("guestbook-is-open");
    }
  }
}

function openChat() {
  if (!chatEl || !toggleBtn) return;
  closeGuestbookIfOpen();
  chatEl.hidden = false;
  document.body.classList.add("dael-rael-open");
  toggleBtn.setAttribute("aria-expanded", "true");
  if (mainEl) mainEl.inert = true;
  initConversation();
  syncViewport();
  scrollToBottom();
  // 다이얼로그 안으로 포커스 이동(텍스트박스가 아닌 패널 → 모바일 키보드 즉시 안 뜸)
  if (panelEl) panelEl.focus();
}

function closeChat() {
  if (!chatEl || !toggleBtn) return;
  chatEl.hidden = true;
  document.body.classList.remove("dael-rael-open");
  toggleBtn.setAttribute("aria-expanded", "false");
  if (mainEl) mainEl.inert = false;
  resetViewport();
  toggleBtn.focus();
}

toggleBtn?.addEventListener("click", openChat);
closeButtons.forEach((b) => b.addEventListener("click", closeChat));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatEl && !chatEl.hidden) closeChat();
});
// 포커스 트랩: 열린 다이얼로그 밖으로 Tab 이 새지 않게
chatEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || chatEl.hidden) return;
  const nodes = [
    ...chatEl.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
// 방명록을 열면 이야기 안내는 닫는다(오버레이 하나만)
document.addEventListener(
  "click",
  (e) => {
    const t = e.target.closest && e.target.closest("[data-guestbook-toggle]");
    if (t && chatEl && !chatEl.hidden) closeChat();
  },
  true,
);

/* ---------- 새 이야기(초기화) — 인라인 확인 ---------- */
let restartConfirmEl = null;
function showRestartConfirm() {
  if (restartConfirmEl) return;
  const box = document.createElement("div");
  box.className = "story-restart-confirm";
  const msg = document.createElement("p");
  msg.textContent = "지금까지 나눈 이야기를 지우고 처음부터 다시 시작할까요?";
  const row = document.createElement("div");
  row.className = "story-restart-actions";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "story-restart-yes";
  yes.textContent = "네, 새로 시작";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "story-restart-no";
  no.textContent = "취소";
  yes.addEventListener("click", () => {
    doRestart();
    dismissRestartConfirm();
  });
  no.addEventListener("click", dismissRestartConfirm);
  row.append(yes, no);
  box.append(msg, row);
  panelEl.insertBefore(box, messagesEl);
  restartConfirmEl = box;
}
function dismissRestartConfirm() {
  if (restartConfirmEl) {
    restartConfirmEl.remove();
    restartConfirmEl = null;
  }
}
function doRestart() {
  sendGen += 1; // 진행 중 요청 무효화
  if (activeController) activeController.abort();
  messages = [];
  memorySummary = "";
  turnCount = 0;
  sessionId = newId();
  assistantLabeled = false;
  messagesEl.replaceChildren();
  clearSuggestions();
  setSending(false);
  renderMessage("assistant", WELCOME);
  renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
  scrollToBottom();
  persist();
}
restartBtn?.addEventListener("click", showRestartConfirm);

/* ---------- 대화 시작 / 복원 ---------- */
function initConversation() {
  if (initialized) return;
  initialized = true;
  assistantLabeled = false;
  const saved = loadSaved();
  if (saved && saved.messages.length) {
    sessionId = saved.session_id || newId();
    messages = saved.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string");
    memorySummary = saved.memory_summary || "";
    turnCount = typeof saved.turn_count === "number" ? saved.turn_count : messages.filter((m) => m.role === "user").length;
    messages.forEach((m) => renderMessage(m.role, m.text));
    if (messages[messages.length - 1].role === "assistant" && !reachedLimit()) {
      renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
    }
  } else {
    sessionId = newId();
    messages = [];
    memorySummary = "";
    turnCount = 0;
    renderMessage("assistant", WELCOME);
    renderSuggestions(INITIAL_SUGGESTIONS, { limit: 3, more: true });
  }
}
