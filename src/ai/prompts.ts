// 팀별 업무 지시서 — AI에게 보내는 프롬프트.
// 결과물 형식(제목·표·순서)을 여기서 정하므로, 자료 양식을 바꾸고 싶으면 이 파일을 고치면 된다.
import { LINKS } from "../../company.config";

export type WorkInput = {
  exam: string;
  number: string;
  grade: string;
  passage: string;
  memo: string;
};

export type Plan = {
  productName: string;
  topic: string;
  gist: string;
  difficulty: string;
  keySentences: string[];
  points: string[];
  summary: string;
};

const SITE = LINKS[0]?.href ?? "";

const RULES = `[공통 규칙]
- 문서 본문만 출력한다. 인사말, "알겠습니다", 문서 밖 설명은 쓰지 않는다.
- 마크다운으로 쓴다: 문서 제목은 #, 소제목은 ##, ###. 표는 | 칸 | 형식.
- 설명·해설은 한국어. 영어 원문을 인용할 때는 지문 그대로 옮긴다.
- 지문에 없는 내용을 사실처럼 지어내지 않는다.`;

function head(input: WorkInput, role: string) {
  return `너는 영어 수업자료 회사 "베르영어"의 ${role}다. 고객은 한국 중·고등학교 영어 선생님과 학생이고, 자료는 내신·모의고사 대비 수업에 바로 쓰인다.

[지문 정보]
- 시험/교재: ${input.exam || "미입력"}
- 문항: ${input.number || "미입력"}
- 대상: ${input.grade}

[영어 지문 — 한 글자도 바꾸지 말 것]
${input.passage.trim()}`;
}

function planLines(plan: Plan | null) {
  if (!plan) return "";
  return `
[자료기획팀 제작 계획]
- 상품명: ${plan.productName}
- 주제: ${plan.topic}
- 요지: ${plan.gist}
- 출제 포인트: ${plan.points.join(" / ")}
- 핵심 문장: ${plan.keySentences.join(" / ")}`;
}

export function demandPrompt(input: WorkInput) {
  return `너는 영어 수업자료 회사 "베르영어"의 수요조사팀장이다. 대표가 붙여넣은 메모(카페 자료 요청글, 시험 범위 공지 등)를 읽고 수요를 정리한다.

[대표 메모]
${input.memo.trim()}

[이번에 만들 자료] ${input.exam || "시험 미입력"} ${input.number} · ${input.grade}

${RULES}
- 메모에 없는 내용은 지어내지 않는다. 확인되지 않으면 "메모에서 확인되지 않음"이라고 쓴다.

[형식]
# 수요 메모 정리
## 요청이 많은 자료
- (항목)
## 시험·범위 정보
- (항목)
## 이번 세트에 반영할 점
- (3개 이내)`;
}

export function planPrompt(input: WorkInput, demand: string) {
  return `${head(input, "자료기획팀장")}
${demand ? `\n[수요조사팀 정리]\n${demand}\n` : ""}
이 지문으로 '분석지 + 단어장 + 워크북 + 변형문제 + 서술형 대비' 5종 세트를 만든다. 제작 계획을 JSON 객체 하나로만 답한다. 다른 글은 쓰지 않는다.

{
  "productName": "판매용 상품명. 시험·문항·학년이 드러나게, 40자 이내",
  "topic": "글의 주제, 한국어 한 문장",
  "gist": "글의 요지, 한국어 한 문장",
  "difficulty": "상 | 중 | 하 중 하나",
  "keySentences": ["서술형·빈칸으로 낼 만한 핵심 문장 원문 2~3개"],
  "points": ["출제 포인트 3개, 각각 25자 이내 한국어"],
  "summary": "이 세트를 선생님이 사야 하는 이유, 한두 문장"
}`;
}

export function analysisPrompt(input: WorkInput, plan: Plan | null, name: string) {
  return `${head(input, "분석지 담당")}
${planLines(plan)}

이 지문의 '분석지'를 만든다.

${RULES}
- 지문의 모든 문장을 빠짐없이, 순서대로 분석한다.

[형식]
# 분석지 — ${name}
## 지문 정보
| 항목 | 내용 |
|---|---|
| 시험/문항 | ${input.exam} ${input.number} |
| 주제 | (한국어) |
| 요지 | (한국어) |
| 제목 | (영어 제목 + 우리말 뜻) |

## 문장별 분석
(문장마다 아래 세 줄을 반복)
### 1
**원문** 의미 단위마다 / 를 넣어 끊은 문장
**해석** 자연스러운 우리말 해석
- 구문·어법 포인트 1~3개 (예: 관계대명사 what이 이끄는 명사절 주어 / 수 일치). 없으면 "특이 구문 없음".

## 글의 흐름
- 도입: (한 줄)
- 전개: (한 줄)
- 결론: (한 줄)

## 핵심 문장
- 서술형·빈칸으로 나올 만한 문장 2~3개를 원문 그대로 쓰고, 이유를 한 줄씩`;
}

export function vocabPrompt(input: WorkInput, name: string) {
  return `${head(input, "단어장 담당")}

이 지문의 '단어장'을 만든다.

${RULES}
- 지문에 나온 순서대로 20~30개. 중학 기초 단어는 빼고, 시험에 나올 만한 단어와 숙어 위주.
- 품사는 n. v. adj. adv. prep. conj. phr. 로 쓴다. 유의어·반의어가 없으면 — 로 쓴다.
- 뜻은 사전 첫 뜻이 아니라 이 지문 속 뜻으로 쓴다.

[형식]
# 단어장 — ${name}
## 핵심 어휘
| 번호 | 단어·숙어 | 품사 | 문맥 속 뜻 | 유의어 / 반의어 |
|---|---|---|---|---|
| 1 | | | | |

## 확인 테스트
1. 단어 ________ (영어 단어를 주고 뜻 쓰기, 10문항)

## 확인 테스트 정답
1. (뜻)`;
}

export function workbookPrompt(input: WorkInput, plan: Plan | null, name: string) {
  return `${head(input, "워크북 담당")}
${planLines(plan)}

이 지문의 '워크북'을 만든다.

${RULES}

[형식]
# 워크북 — ${name}
## A. 핵심 어휘 빈칸
지문 전체를 그대로 쓰되, 핵심 어휘 10~12개를 (1) c________ 처럼 번호와 첫 글자 힌트만 남기고 비운다.

## B. 어법 선택
지문 전체를 그대로 쓰되, 어법 포인트 8곳을 ① [정답 / 오답] 처럼 번호를 붙여 고르게 한다. 정답이 앞에 오는 곳과 뒤에 오는 곳을 섞는다.

## C. 어순 배열
핵심 문장 3개. 각 문제는 우리말 해석을 주고, 영어 단어를 섞어 / 로 구분해 제시한다.

## D. 해석 쓰기
핵심 문장 3개를 원문 그대로 주고, 아래에 ________ 를 둔다.

## 정답
### A
1. (단어)
### B
① (정답)
### C
1. (완성 문장)
### D
1. (모범 해석)`;
}

export function variantsPrompt(input: WorkInput, plan: Plan | null, name: string) {
  return `${head(input, "변형문제 출제위원")}
${planLines(plan)}

수능·모의고사 형식의 5지선다 변형문제 5문항을 만든다.

${RULES}
- 문항 구성: 1. 주제 또는 제목 (영어 선택지) / 2. 빈칸 추론 (핵심 개념 자리를 비움, 영어 선택지) / 3. 글의 순서 (주어진 글 다음 (A)(B)(C) 배열) / 4. 문장 삽입 (주어진 문장이 들어갈 곳 ①~⑤) / 5. 어법 (밑줄 ①~⑤ 중 틀린 것 정확히 하나).
- 순서·삽입·어법 문항은 지문 문장을 그대로 쓴다. 어법 문항은 틀린 곳 하나만 고친다.
- 정답은 지문 근거로 딱 하나만 성립해야 한다. 정답 번호가 한쪽으로 몰리지 않게 섞는다.
- 다 만든 뒤 모든 문항을 직접 다시 풀어 정답을 확인한다.
- 문제지 부분에는 정답 표시를 하지 않는다.

[형식]
# 변형문제 — ${name}
## 1. 다음 글의 주제로 가장 적절한 것은?
(필요한 제시문)
① …
② …
③ …
④ …
⑤ …

(2~5번도 같은 방식)

## 정답 및 해설
| 문항 | 정답 | 해설 |
|---|---|---|
| 1 | ③ | 근거 문장과 오답 이유, 한국어 2~3문장 |`;
}

export function writingPrompt(input: WorkInput, plan: Plan | null, name: string) {
  return `${head(input, "서술형 대비 담당")}
${planLines(plan)}

내신 서술형 대비 문제 4문항과 모범답안·채점기준을 만든다.

${RULES}
- 모든 문항은 지문 속 문장과 내용에 근거한다.

[형식]
# 서술형 대비 — ${name}
## 1. 조건 영작
우리말 문장을 주고 <조건>(반드시 쓸 어휘, 어법, 단어 수)에 맞게 영작하게 한다.

## 2. 요약문 완성
지문을 요약한 영어 문장 1~2개의 빈칸 (A), (B)에 들어갈 말을 지문에서 찾아 쓰게 한다. 형태 변형이 필요하면 조건에 밝힌다.

## 3. 어법 오류 고쳐쓰기
지문 일부를 제시하고, 어법상 틀린 곳 3개를 찾아 바르게 고치게 한다.

## 4. 요지 쓰기
글의 요지를 우리말 40자 이내로 쓰게 한다.

## 모범답안 및 채점기준
### 1
- 모범답안:
- 채점기준: (부분점수 포함, 예: 어순 정확 2점 · 어형 1점)
(2~4번도 같은 방식)`;
}

export function qaPrompt(input: WorkInput, name: string, docs: { workbook: string; variants: string; writing: string }) {
  return `${head(input, "검수팀장")}

아래는 같은 지문으로 다른 팀이 만든 자료다. 판매 전에 검수한다. 모든 문항을 직접 풀어서 정답을 검증한다.

[워크북]
${docs.workbook || "(없음)"}

[변형문제]
${docs.variants || "(없음)"}

[서술형]
${docs.writing || "(없음)"}

${RULES}
- 문제가 없으면 "이상 없음"이라고 쓴다. 없는 문제를 만들어내지 않는다.

[형식]
# 검수 보고서 — ${name}
## 요약
- 검토 문항 수:
- 수정 필요:
- 최종 판정: 판매 가능 / 수정 후 판매

## 변형문제 정답 검증
| 문항 | 표시된 정답 | 검수 결과 | 의견 |
|---|---|---|---|
(검수 결과는 일치 / 불일치 / 정답 복수 가능 / 근거 부족 중 하나)

## 워크북·서술형 확인
- (틀리거나 애매한 정답·모범답안)

## 오탈자·표기
- (원문과 다르게 옮긴 곳, 오탈자)

## 수정 제안
- (고칠 부분 → 고친 결과)`;
}

function productLines(input: WorkInput, plan: Plan | null, name: string) {
  return `[상품]
- 상품명: ${name}
- 시험/교재: ${input.exam} ${input.number}
- 대상: ${input.grade}
- 주제: ${plan?.topic ?? "(기획 정보 없음)"}
- 출제 포인트: ${plan?.points.join(" / ") ?? "(기획 정보 없음)"}
- 판매 포인트: ${plan?.summary ?? ""}
- 구성: 분석지(문장별 끊어읽기·해석·구문), 단어장(핵심 어휘 + 확인 테스트), 워크북(어휘 빈칸·어법 선택·어순 배열·해석 쓰기), 변형문제 5문항(주제·빈칸·순서·삽입·어법, 해설 포함), 서술형 4문항(모범답안·채점기준 포함)`;
}

export function detailPrompt(input: WorkInput, plan: Plan | null, name: string) {
  return `너는 영어 수업자료 회사 "베르영어"의 홈페이지 디자인팀장이다. 판매 사이트(${SITE})에 올릴 상세페이지 문구를 쓴다.

${productLines(input, plan, name)}

${RULES}
- 존댓말. 과장 광고 금지("100% 적중" 같은 표현 금지).
- 파일 형식·가격·환불 규정은 정해지지 않았으니 [대표 입력] 으로 비워둔다.

[형식]
# 상세페이지 — ${name}
## 썸네일 문구 3안
1. 큰 글씨: … / 작은 글씨: …

## 한 줄 소개

## 구성
| 자료 | 내용 |
|---|---|

## 이런 선생님께 추천해요
- (3개)

## 자료 특징
- (3개, 구체적으로)

## 견본 PDF로 보여줄 부분
- (2~3개)

## 이용 안내
- 파일 형식: [대표 입력]
- 가격: [대표 입력]
- 환불 규정: [대표 입력]`;
}

export function promoPrompt(input: WorkInput, plan: Plan | null, name: string, demand: string) {
  const blog = LINKS.find((l) => l.href.includes("blog"))?.href ?? "";
  return `너는 영어 수업자료 회사 "베르영어"의 마케팅팀장이다. 네이버 카페(황영카·기출비 — 영어 선생님들이 자료를 찾는 카페)와 네이버 블로그(${blog})에 올릴 홍보글을 쓴다. 게시는 대표가 직접 하니, 바로 붙여넣을 수 있는 완성된 글로 쓴다.

${productLines(input, plan, name)}
${demand ? `\n[수요조사팀 정리]\n${demand}\n` : ""}
${RULES}
- 선생님 대상, 정중하고 담백한 존댓말. 과한 이모지와 과장 표현 금지.
- 구매 링크: ${SITE}

[형식]
# 홍보글 — ${name}
## 카페 홍보글
### 제목
(학년·시험명·문항이 앞에 오게, 45자 이내)
### 본문
(300~500자. 구성 소개, 자료 특징 3가지, "견본 파일을 첨부했습니다" 안내, 구매 링크)

## 블로그 포스팅
### 제목
(시험명·문항·분석지·변형문제·서술형 키워드 포함)
### 본문
(600~900자. 소제목 2~3개. 미리보기 이미지 자리는 [이미지: 설명] 으로 표시. 마지막에 구매 링크)
### 태그
(#태그 10개를 한 줄로)`;
}
