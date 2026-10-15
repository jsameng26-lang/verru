// ============================================================
//  베르영어 AI 오피스 설정 — 여기 한 파일만 고치면 됩니다
// ============================================================
//  회사 이름, 부서 이름, 직원 이름·성격·옷색, 오늘의 결재 안건, 링크까지 전부 여기 있어요.
//
//  ⚠️ 딱 3가지 규칙
//   1. 부서 id(research, brand, ...)는 절대 바꾸지 마세요. 시뮬레이션 엔진이
//      이 id로 하루 업무 순서를 돌립니다. (id는 화면에 안 보이는 내부 이름이에요)
//      → 바꿔도 되는 건 name · short · icon · task · report · keywords 입니다.
//   2. 부서는 12개를 유지하세요. 사무실 배치가 4열 3행 = 12칸 고정입니다.
//   3. 한 부서에 직원은 최대 3명(책상 3개), 팀장(lead)은 정확히 1명.
//
//  🔒 관리자페이지·스프레드시트 주소는 여기 넣지 마세요 (저장소가 공개예요).
//     프로젝트 폴더의 .env.local 에만 넣습니다 → README 참고.
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "VERRU ENGLISH",
  /** 헤더 로고 배지에 들어갈 글자 1개 (이모지도 됩니다) */
  logoLetter: "V",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "베르영어",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "AI Office",
  /** 브라우저 탭 제목 */
  pageTitle: "베르영어 AI Office",
  /** 검색·공유될 때 뜨는 설명 */
  description: "분석지·단어장·워크북·변형문제·서술형 대비 자료를 기획부터 제작·검수·판매까지 돌리는 베르영어 AI 오피스",
  /** 창 하단 파일명 느낌의 라벨 */
  windowLabel: "verru_english.exe — 대표실",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "베르영어",
} as const;

/** 공개 링크 — 대시보드 integrations.link 패널에 바로가기로 뜹니다 */
export const LINKS: { name: string; href: string }[] = [
  { name: "베르영어 판매 사이트", href: "https://verrueng9875.com" },
  { name: "네이버 블로그", href: "https://blog.naver.com/nayakcy3" },
  { name: "네이버 카페 홍보글", href: "https://cafe.naver.com/maljjang2/1724446" },
];

/** 결과물 창고의 "사이트 열기" 버튼 링크. 비워두면 버튼이 숨겨집니다. */
export const STORAGE_LINK = "https://verrueng9875.com";

/** 대표(나) — 사무실 대표실에 앉아 있는 캐릭터 */
export const CEO_PROFILE = {
  name: "베르 대표",
  callsign: "대표님",
  role: "대표 · 자료 최종 검토·판매 결정",
  hair: "#42283a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "선생님들이 수업에 바로 쓸 수 있는 자료인가?",
    "학생이 혼자 풀어도 이해되게.",
    "오늘 결정할 건 딱 1개만 남기자.",
  ],
};

/**
 * 오늘 대표실로 올라오는 결재 안건 (TOP 1).
 * 화면의 ceo.approval 카드와 회의실 대사에 그대로 쓰입니다.
 */
export const TODAY_PICK = {
  title: "10월 학평 고3 영어 전 지문 풀세트",
  score: 92,
  summary: "분석지 + 단어장 + 워크북 + 변형문제 + 서술형 대비 5종을 한 번에. 시험 직후 선생님 수요가 가장 큰 자료예요.",
  reasons: ["① 시험 직후 수요 최고", "② 카페 자료 요청글 다수", "③ 5종 세트로 객단가 ↑"],
};

/**
 * 부서 12개.
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 * keywords = 대표 지시창에서 이 팀을 부를 때 알아듣는 단어 (예: "마케팅팀 뭐해?")
 *
 * 하루 업무 순서:
 *  출근 → 수요조사(research) → 고객 문의 확인(brand) → 제작 후보 10개(strategy1) → TOP 3
 *  → 대표 승인 → 분석지·단어장(strategy2) → 워크북·변형문제(reels) + 서술형(carousel)
 *  → 검수(qa) → 상세페이지(review) + 홍보글(partner) → 등록 준비(ops) + 정산(finance)
 *  → 비서실 브리핑(secretary)
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "수요조사팀",
    short: "exam.radar",
    icon: "🔎",
    task: "시험 일정·범위·자료 요청 조사",
    report: "이번 주 수요 높은 시험·학년을 정리했어요.",
    keywords: ["수요조사", "수요", "시험범위", "시험 범위", "학평", "모의고사"],
  },
  {
    id: "brand",
    name: "고객지원팀",
    short: "help.desk",
    icon: "💬",
    task: "주문·다운로드 문의 정리",
    report: "문의는 답장 초안까지, 발송은 대표가 해요.",
    keywords: ["고객지원", "고객", "문의", "cs", "환불", "다운로드"],
  },
  {
    id: "strategy1",
    name: "자료기획팀",
    short: "plan.studio",
    icon: "💡",
    task: "이번 주 제작 후보 10개 기획",
    report: "수요·마감·중복 기준으로 TOP 3까지 좁혀요.",
    keywords: ["자료기획", "기획", "후보", "top 3", "톱3"],
  },
  {
    id: "qa",
    name: "검수팀",
    short: "qa.check",
    icon: "🛡️",
    task: "정답·해설·오탈자 검수",
    report: "정답·해설 대조 끝, 오류는 전부 고쳤어요.",
    keywords: ["검수", "정답", "오탈자", "오타", "해설"],
  },
  {
    id: "strategy2",
    name: "분석지·단어장팀",
    short: "analysis.lab",
    icon: "📖",
    task: "지문 분석지·단어장 제작",
    report: "구문·해석·핵심 표시한 분석지와 단어장 완성.",
    keywords: ["분석지", "단어장", "구문", "해석"],
  },
  {
    id: "reels",
    name: "워크북·변형문제팀",
    short: "workbook.lab",
    icon: "📝",
    task: "워크북·변형문제 출제",
    report: "순서·삽입·빈칸·어법 유형별로 고르게 냈어요.",
    keywords: ["워크북", "변형"],
  },
  {
    id: "carousel",
    name: "서술형대비팀",
    short: "writing.prep",
    icon: "✍️",
    task: "서술형·영작 문제 + 채점기준",
    report: "조건 영작·요약문 문제와 모범답안까지 붙였어요.",
    keywords: ["서술형", "영작", "요약문", "채점"],
  },
  {
    id: "partner",
    name: "마케팅팀",
    short: "promo.cafe",
    icon: "📣",
    task: "카페·블로그 홍보글 + 견본 준비",
    report: "황영카·기출비·블로그 홍보글 초안 완성. 게시는 대표님이.",
    keywords: ["마케팅", "홍보", "카페", "블로그", "황영카", "기출비"],
  },
  {
    id: "finance",
    name: "회계팀",
    short: "account.xls",
    icon: "🧾",
    task: "매출·입금·정산 정리",
    report: "자료별 매출과 입금 현황을 정리해요.",
    keywords: ["회계", "매출", "정산", "입금", "세금", "돈"],
  },
  {
    id: "review",
    name: "홈페이지 디자인팀",
    short: "web.design",
    icon: "🎨",
    task: "상세페이지·썸네일·견본 PDF",
    report: "상세페이지·썸네일·워터마크 견본까지 만들었어요.",
    keywords: ["홈페이지", "디자인", "상세페이지", "썸네일", "견본"],
  },
  {
    id: "ops",
    name: "자료관리팀",
    short: "data.sheet",
    icon: "🗂️",
    task: "상품 목록·등록 정보·파일 버전 관리",
    report: "시트·관리자페이지 등록 정보와 최종 파일 정리 끝.",
    keywords: ["자료관리", "등록", "시트", "스프레드시트", "관리자", "파일"],
  },
  {
    id: "secretary",
    name: "비서실",
    short: "secretary.hq",
    icon: "📋",
    task: "전사 한줄보고·최종 브리핑",
    report: "모든 팀 상태를 모아 결정할 것만 남겨드려요.",
    keywords: ["비서"],
  },
] as const;

/**
 * 직원 명단 — 이름은 전부 색깔 이름, 옷 색도 자기 이름 색이에요.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 수요조사팀
  { dept: "research", rank: "lead", name: "스카이", role: "수요조사 팀장",
    colors: ["#2f2a3d", "#a9dcff", "#fff3b0"],
    thoughts: ["이번 달 학평 일정부터 다시 확인.", "카페 자료 요청글, 오늘 몇 개 올라왔지?", "학교별 시험범위 바뀐 데 있나 체크."] },
  { dept: "research", rank: "member", name: "레몬", role: "시험 일정·범위 조사",
    colors: ["#6b3d34", "#fff3a0", "#b8f0dd"],
    thoughts: ["모의고사 직후가 수요 피크예요.", "교과서 범위 공지 뜬 학교 정리 중."] },
  { dept: "research", rank: "member", name: "세이지", role: "기출 트렌드 분석",
    colors: ["#463227", "#c8e6c0", "#ff8fc0"],
    thoughts: ["요즘 서술형 비중이 계속 늘어요.", "빈칸·순서 유형 출제 패턴 정리 중."] },

  // ② 고객지원팀
  { dept: "brand", rank: "lead", name: "피치", role: "고객지원 팀장",
    colors: ["#8a4a3c", "#ffd3b8", "#c9b8ff"],
    thoughts: ["문의 채널 연동 전이라 직접 못 읽어요.", "다운로드 오류 문의는 제일 먼저 처리."] },
  { dept: "brand", rank: "member", name: "라일락", role: "주문·다운로드 문의",
    colors: ["#372b4a", "#dcc8ff", "#fff3b0"],
    thoughts: ["파일 링크 만료 문의가 제일 많아요.", "답장 초안까지만, 발송은 대표님이."] },

  // ③ 자료기획팀
  { dept: "strategy1", rank: "lead", name: "코랄", role: "자료기획 팀장",
    colors: ["#c26e4b", "#ffb3a7", "#fff3b0"],
    thoughts: ["이번 주 제작 후보 정확히 10개.", "수요·마감·난이도로 점수 매긴다.", "이미 파는 세트랑 겹치면 탈락."] },
  { dept: "strategy1", rank: "member", name: "머스타드", role: "세트 구성 기획",
    colors: ["#2c2638", "#f5d98a", "#ff8fc0"],
    thoughts: ["5종 풀세트로 묶으면 객단가가 올라가요.", "단품 수요도 따로 봐야 해요."] },
  { dept: "strategy1", rank: "member", name: "민트", role: "일정·우선순위",
    colors: ["#7b4a2f", "#b8f0dd", "#c9b8ff"],
    thoughts: ["시험 2주 전엔 무조건 올려야 해요.", "마감 역산해서 일정 짜는 중."] },

  // ④ 검수팀
  { dept: "qa", rank: "lead", name: "네이비", role: "검수 팀장",
    colors: ["#313b56", "#aab8e8", "#b8f0dd"],
    thoughts: ["정답 번호 하나 틀리면 신뢰가 끝나요.", "해설이랑 정답 끝까지 대조합니다."] },
  { dept: "qa", rank: "member", name: "아이보리", role: "정답·해설 대조",
    colors: ["#3c3a4f", "#fff8e6", "#ff8fc0"],
    thoughts: ["정답 분포가 한쪽으로 쏠렸어요.", "선지 근거 문장 다시 확인."] },
  { dept: "qa", rank: "member", name: "로즈", role: "오탈자·서식 검수",
    colors: ["#6c3a55", "#ffc2d4", "#fff3b0"],
    thoughts: ["철자 하나도 그냥 안 넘어가요.", "글꼴이랑 줄간격 통일됐는지 봐요."] },

  // ⑤ 분석지·단어장팀
  { dept: "strategy2", rank: "lead", name: "올리브", role: "분석지 팀장",
    colors: ["#4b3b2c", "#d4e2a8", "#ff8fc0"],
    thoughts: ["구문 분석은 학생 눈높이로.", "직독직해 끊는 위치 통일해요."] },
  { dept: "strategy2", rank: "member", name: "베이지", role: "지문 분석·해석",
    colors: ["#5a3450", "#f0e0c8", "#b8f0dd"],
    thoughts: ["주제문 표시가 빠졌다.", "해석은 자연스럽게, 직역은 따로."] },
  { dept: "strategy2", rank: "member", name: "그레이", role: "단어장 제작",
    colors: ["#2e3a4a", "#dcdce4", "#fff3b0"],
    thoughts: ["뜻은 지문 문맥 기준으로 넣어요.", "유의어·반의어까지 붙이면 끝."] },

  // ⑥ 워크북·변형문제팀
  { dept: "reels", rank: "lead", name: "버건디", role: "워크북·변형 팀장",
    colors: ["#5d3a2c", "#e8a8b8", "#fff3b0"],
    thoughts: ["원문은 그대로, 변형만 새로.", "유형별로 고르게 섞어요."] },
  { dept: "reels", rank: "member", name: "오렌지", role: "변형문제 출제",
    colors: ["#2c2638", "#ffcf9e", "#c9b8ff"],
    thoughts: ["순서·삽입·빈칸·어법 다 넣었어요.", "오답 선지가 너무 티 나면 다시."] },
  { dept: "reels", rank: "member", name: "틸", role: "워크북 편집",
    colors: ["#274a44", "#a8e0dc", "#ff8fc0"],
    thoughts: ["빈칸 워크북 난이도 3단계로 나눠요.", "학생용·교사용 버전 따로 뽑기."] },

  // ⑦ 서술형대비팀
  { dept: "carousel", rank: "lead", name: "인디고", role: "서술형 팀장",
    colors: ["#33304a", "#b8b8f0", "#b8f0dd"],
    thoughts: ["내신은 결국 서술형에서 갈려요.", "채점 기준까지 같이 줘야 해요."] },
  { dept: "carousel", rank: "member", name: "라벤더", role: "영작·요약 문제",
    colors: ["#7a3f58", "#c9b8ff", "#fff3b0"],
    thoughts: ["조건 영작 조건이 너무 쉬운가?", "요약문 빈칸은 핵심어로만."] },
  { dept: "carousel", rank: "member", name: "바닐라", role: "모범답안·채점기준",
    colors: ["#6b4a2f", "#fff3d0", "#ff8fc0"],
    thoughts: ["부분점수 기준 명확하게.", "모범답안은 두 가지 버전으로."] },

  // ⑧ 마케팅팀
  { dept: "partner", rank: "lead", name: "마젠타", role: "마케팅 팀장",
    colors: ["#452d3f", "#ffa8d8", "#fff3b0"],
    thoughts: ["황영카·기출비 홍보글은 견본이 생명.", "게시는 대표님이 직접 하세요."] },
  { dept: "partner", rank: "member", name: "체리", role: "카페 홍보글",
    colors: ["#563a32", "#ffb0b8", "#b8f0dd"],
    thoughts: ["제목에 학년·시험명부터 박아요.", "견본 PDF 2쪽이면 충분해요."] },
  { dept: "partner", rank: "member", name: "그린", role: "블로그 포스팅",
    colors: ["#3a2f4d", "#c0eab0", "#c9b8ff"],
    thoughts: ["블로그는 검색 키워드가 먼저.", "구성 미리보기 이미지 넣으면 신뢰도 올라가요."] },

  // ⑨ 회계팀
  { dept: "finance", rank: "lead", name: "골드", role: "회계 팀장",
    colors: ["#313b56", "#f5e09a", "#fff3b0"],
    thoughts: ["매출 시트 연동되면 바로 정리해요.", "입금 확인 안 된 주문부터 봐요."] },
  { dept: "finance", rank: "member", name: "실버", role: "매출·정산",
    colors: ["#4b3b2c", "#e4e4ec", "#b8f0dd"],
    thoughts: ["자료별 판매량 순위 뽑아둘게요.", "결제는 자동으로 안 해요."] },

  // ⑩ 홈페이지 디자인팀
  { dept: "review", rank: "lead", name: "핑크", role: "디자인 팀장",
    colors: ["#9c5c72", "#ff8fc0", "#fff3b0"],
    thoughts: ["상세페이지 첫 화면에 5종 구성을 한눈에.", "썸네일은 학년·시험명이 크게."] },
  { dept: "review", rank: "member", name: "크림", role: "상세페이지",
    colors: ["#2c2638", "#fff5dc", "#ff8fc0"],
    thoughts: ["미리보기 이미지 3장 배치 중.", "모바일에서 글자 깨지는지 확인."] },
  { dept: "review", rank: "member", name: "시안", role: "썸네일·견본 PDF",
    colors: ["#3b3b49", "#b0ecf5", "#c9b8ff"],
    thoughts: ["견본엔 워터마크 꼭 넣어요.", "시리즈별 색 통일하면 브랜드가 살아요."] },

  // ⑪ 자료관리팀
  { dept: "ops", rank: "lead", name: "에메랄드", role: "자료관리 팀장",
    colors: ["#2d4b46", "#a8e8c8", "#fff3b0"],
    thoughts: ["상품 코드랑 파일명 규칙부터 맞춰요.", "시트랑 사이트 목록이 같아야 해요."] },
  { dept: "ops", rank: "member", name: "카키", role: "상품 등록 준비",
    colors: ["#463227", "#dcd6b0", "#ff8fc0"],
    thoughts: ["관리자페이지 등록 정보 정리 중.", "가격·학년·시험명 빠진 칸 체크."] },
  { dept: "ops", rank: "member", name: "차콜", role: "파일 버전 관리",
    colors: ["#2f2a3d", "#b4b4c0", "#b8f0dd"],
    thoughts: ["최종본은 final 하나만 남겨요.", "원본 파일은 절대 덮어쓰지 않기."] },

  // ⑫ 비서실
  { dept: "secretary", rank: "lead", name: "화이트", role: "비서실장",
    colors: ["#7a453c", "#ffffff", "#c9b8ff"],
    thoughts: ["대표님이 결정할 것만 추립니다.", "막힌 건 먼저 보고해요."] },
  { dept: "secretary", rank: "member", name: "블루", role: "브리핑 정리",
    colors: ["#334a3a", "#b8d4ff", "#fff3b0"],
    thoughts: ["팀별 한 줄 보고 모으는 중.", "중복 설명은 다 지워요."] },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시되고 그날 업무를 쉬어요.
 * need = 필요한 연동 / reason = 대표가 "왜 늦어?"라고 물을 때 하는 대답
 * 다 붙였거나 그냥 전부 일하게 하고 싶으면 빈 객체 {} 로 두세요.
 */
export const PENDING_INTEGRATIONS: Record<string, { need: string; reason: string }> = {
  brand: {
    need: "사이트 주문·문의 알림 연동",
    reason: "사이트 문의·주문 알림이 아직 연결 전이라 문의를 직접 못 읽어요. 연결되면 답장 초안까지 준비해둡니다.",
  },
  finance: {
    need: "매출 스프레드시트 연동",
    reason: "매출 시트가 아직 연결 전이라 숫자를 지어내지 않아요. 시트만 연결되면 그날 안에 정리합니다.",
  },
};
