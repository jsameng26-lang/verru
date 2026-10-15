# VERRU Office — 작업 지침 (AI 코딩 도구용)

픽셀 사무실 시뮬레이션 UI (Vite + React + TypeScript, 서버 없음).

- 실행: `npm install` → `npm run dev` (http://localhost:3000)
- 검사: `npm run typecheck`, `npm run build`

## 커스터마이징 요청이면

`company.config.ts` 만 고치세요.

1. 부서 `id`(`research` `brand` `strategy1` `qa` `strategy2` `reels` `carousel` `partner` `finance` `review` `ops` `secretary`)는 바꾸지 마세요. `src/game/sim.ts` 가 직접 참조합니다.
2. 부서는 정확히 12개 (4열 3행 고정 배치).
3. 한 팀에 `rank: "lead"` 는 정확히 1명.
4. `colors` 는 `[머리색, 옷색, 포인트색]`, 기존 파스텔 톤 유지.

## 연동

외부 연동은 `src/game/report.ts` 의 `publish` / `fetchIntegrations` 자리표시자뿐입니다.
연결 안 된 걸 연결됐다고 표시하지 마세요. 비밀값은 브라우저 코드에 넣지 말고 서버에 두세요.

## 크레딧

원본 UI는 갓생맘 🎀 (@godseng.mom) 작품입니다. 화면 하단 크레딧은 지우지 마세요.
