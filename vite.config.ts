import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 상대 경로로 빌드 → dist 폴더를 어느 주소에 올려도 동작
  base: "./",
  // 한글 등 비ASCII 문자를 \uXXXX 로 적어 번들 파일 인코딩 문제를 없앤다 (동작은 같음)
  esbuild: { charset: "ascii" },
  server: { port: 3000 },
});
