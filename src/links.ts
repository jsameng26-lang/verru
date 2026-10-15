// 대시보드 integrations.link 패널에 뜨는 링크들
//
// 공개 링크(사이트·블로그·카페)는 company.config.ts 의 LINKS 에 있습니다.
// 관리자페이지(key 포함)·스프레드시트 주소는 비밀번호나 마찬가지라서 코드에 넣지 않아요 —
// 저장소가 공개라서 커밋하면 누구나 볼 수 있습니다.
// 대신 프로젝트 폴더의 .env.local 에 넣으면, 내 컴퓨터의 개발 서버(npm run dev)에서만 보입니다.
// `npm run build` 결과물(dist)에는 들어가지 않으니 배포해도 새지 않아요.
import { LINKS, PENDING_INTEGRATIONS } from "../company.config";

export type LinkRow = { name: string; status: string; tone: string; href: string };

const privateLinks = import.meta.env.DEV
  ? [
      { name: "자료 관리 스프레드시트", href: import.meta.env.VITE_SHEET_URL ?? "" },
      { name: "사이트 관리자페이지", href: import.meta.env.VITE_ADMIN_URL ?? "" },
    ]
  : [
      { name: "자료 관리 스프레드시트", href: "" },
      { name: "사이트 관리자페이지", href: "" },
    ];

export const LINK_ROWS: LinkRow[] = [
  ...LINKS.map((link) => ({ ...link, status: "바로가기", tone: "mint" })),
  ...privateLinks.map((link) =>
    link.href
      ? { ...link, status: "바로가기 · 로컬", tone: "mint" }
      : { ...link, status: import.meta.env.DEV ? ".env.local 미설정" : "로컬 전용", tone: "white" },
  ),
  ...Object.values(PENDING_INTEGRATIONS).map((p) => ({ name: p.need, status: "연동 대기", tone: "lav", href: "" })),
  { name: "카페·블로그 자동 게시", status: "대표 직접 게시", tone: "yellow", href: "" },
];
