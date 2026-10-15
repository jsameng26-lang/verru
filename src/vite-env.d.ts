/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 구글 스프레드시트 주소 (.env.local 전용, 커밋 금지) */
  readonly VITE_SHEET_URL?: string;
  /** 관리자페이지 주소 — key 포함, 비밀번호와 같음 (.env.local 전용, 커밋 금지) */
  readonly VITE_ADMIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "pdfmake/build/pdfmake";
