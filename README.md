# VERRU — 나의 AI Office (껍데기 버전)

AI 직원들이 출근하고, 자리에 앉아 일하고, 회의실에 모이고, 대표실로 보고하러 오는 **픽셀 사무실** UI입니다.

원본 "나의 AI 회사 (AI Office)" 의 화면·시뮬레이션을 그대로 옮기고,
서버/외부 연동(Cloudflare Worker, Notion, Discord, DB)은 걷어낸 **브라우저 전용 껍데기**예요.
연동 자리는 화면에 "미설정"으로 남아 있어서, 나중에 원하는 백엔드를 붙이면 됩니다.

## 실행

Node.js 20.19 이상이 필요합니다.

```bash
npm install
npm run dev      # http://localhost:3000
```

화면 위쪽 **"오늘 업무 시작하기"** 를 누르면 직원들이 출근합니다. 직원을 클릭하면 프로필이 열려요.

```bash
npm run build    # 타입 검사 + dist/ 에 정적 사이트 생성 (아무 정적 호스팅에 올리면 됨)
npm run preview  # 빌드 결과 미리보기
```

## 내 회사로 바꾸기

**`company.config.ts` 한 파일만 고치면 됩니다.**

| 고칠 것 | 어디 |
|---|---|
| 회사 이름, 로고 글자, 화면 제목 | `COMPANY` |
| 대표(나) 이름·성격·머리색 | `CEO_PROFILE` |
| 부서 12개 이름·아이콘·하는 일 | `DEPARTMENTS` |
| 직원 이름·직책·색·혼잣말 | `STAFF_LIST` |
| "연동 대기"로 표시할 팀 | `PENDING_INTEGRATIONS` |
| 결과물 보관함 링크 | `STORAGE_LINK` |

지켜야 할 것 2가지:

1. **부서 `id`는 바꾸지 마세요** (`research`, `brand`, `strategy1` …). 시뮬레이션 엔진이 이 id로 캐릭터를 움직입니다.
   바꿔도 되는 건 `name` · `icon` · `short` · `task` · `report` 입니다.
2. **부서는 12개를 유지하세요.** 사무실 배치가 4열 3행 = 12칸 고정입니다.

직원 수는 자유이고, 한 팀에 팀장(`lead`)은 1명만 두면 됩니다.

## 구조

```
company.config.ts         회사·부서·직원 설정 (여기만 고치면 됨)
src/App.tsx               화면 (라이브 오피스 / 대시보드 / 대표 지시창 / 모달)
src/game/sim.ts           시뮬레이션 엔진 (하루 시나리오·상태머신·지시 처리)
src/game/world.ts         사무실 맵·가구·충돌 그리드
src/game/pathfinding.ts   A* 길찾기
src/game/OfficeWorld.tsx  픽셀 오피스 렌더러 (카메라·드래그·직원 레이어)
src/game/report.ts        일일 보고서 생성 + 연동 자리(publish / fetchIntegrations)
src/globals.css, src/office.css  스타일
```

## 진짜 연동을 붙이고 싶다면

`src/game/report.ts` 아래쪽의 두 함수만 바꾸면 됩니다.

- `fetchIntegrations()` — 대시보드의 `integrations.link` 패널에 뜨는 연결 상태
- `publish(report)` — "📤 보고 발행" 버튼과 하루 종료 시 자동 발행

지금은 둘 다 "미설정"을 돌려주는 자리표시자예요. 서버 API를 만들어 `fetch` 로 바꾸면 그대로 화면에 반영됩니다.
(토큰 같은 비밀값은 브라우저 코드에 넣지 말고 반드시 서버 쪽에 두세요.)

---

원본 UI 제작: **갓생맘 🎀** — 📷 [@godseng.mom](https://www.instagram.com/godseng.mom/)
자유롭게 쓰고 고치되, 무단 재판매는 하지 말아주세요. (화면 하단 크레딧은 유지해주세요.)
