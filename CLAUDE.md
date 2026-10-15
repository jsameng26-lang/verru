# 베르영어 AI Office — 작업 지침 (AI 코딩 도구용)

영어 수업자료(분석지·단어장·워크북·변형문제·서술형) 제작·판매 회사를 픽셀 사무실로 보여주는 시뮬레이션.
Vite + React + TypeScript, 서버 없음.

- 실행: `npm install` → `npm run dev` (http://localhost:3000)
- 검사: `npm run typecheck`, `npm run build`

## 커스터마이징

`company.config.ts` 에서 대부분 해결됩니다.

1. 부서 `id`는 바꾸지 마세요. `src/game/sim.ts` 의 하루 시나리오가 id로 팀을 부릅니다
   (research=수요조사, brand=고객지원, strategy1=자료기획, qa=검수, strategy2=분석지·단어장,
   reels=워크북·변형, carousel=서술형, partner=마케팅, finance=회계, review=홈페이지 디자인,
   ops=자료관리, secretary=비서실).
2. 부서는 정확히 12개, 한 부서 최대 3명, `rank: "lead"` 는 정확히 1명.
3. 직원 이름은 색깔 이름, 옷색(`colors[1]`)은 그 이름의 파스텔 색.
4. 직원 이름은 코드 어디에도 하드코딩하지 마세요 — `DEPT_LEAD[deptId].name` 으로 가져옵니다.

## 실제 작업 모드

Claude 아티팩트로 게시하면 `sample`(AI 호출) · `db`(결과물 창고, `runs` 컬렉션) · `downloads`(.docx 저장)를 쓴다.
게시할 때 capabilities: `{ sample: {}, db: { rules: [{ path: "runs", read: "admin", write: "admin" }] }, downloads: true }`.
게시 파일: 페이지 + `assets/*`(해시 이름 그대로, 청크끼리 서로 import) + `fonts/*`(PDF 글꼴, 라이선스 포함).
번들은 `esbuild.charset: "ascii"` 로 만든다 (docx 라이브러리의 U+FFFD 때문에 게시가 거부됨).
팀별 프롬프트는 `src/ai/prompts.ts`, 작업 흐름은 `src/ai/job.ts` + `src/game/sim.ts` 의 dayScript.
판매 세트는 항상 "전 지문 5종"(분석지·단어장·워크북·변형문제·서술형) → 지문별 PDF + 통합 PDF.
저장소: `runs/<세트>`(요약) + `runs/<세트>/passages/<지문>`(전문). 문서 하나 256KiB 제한을 넘지 않게 나눠 둔다.
AI 동시 호출은 2개까지. rate_limited 등은 줄을 멈추고(halted) '이어서 만들기'로 재개 — 절대 자동 재시도 루프 금지.
AI가 없는 환경에서는 연습 모드(연출만)로 떨어지며, 이걸 실제 작업처럼 보이게 하지 말 것.

## 비밀값

저장소가 공개입니다. 관리자페이지 주소(key 포함)·스프레드시트 주소는 절대 커밋하지 말고
`.env.local` 의 `VITE_ADMIN_URL` / `VITE_SHEET_URL` 에만 둡니다. `src/links.ts` 가 개발 서버에서만 읽습니다.

## 정직성

연결 안 된 걸 연결됐다고 표시하지 마세요. 사이트 업로드·카페 게시·결제는 대표가 직접 한다고 안내합니다.

## 크레딧

원본 UI는 갓생맘 🎀 (@godseng.mom) 작품입니다. 화면 하단 크레딧은 지우지 마세요.
