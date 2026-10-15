import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 상대 경로로 빌드 → dist 폴더를 어느 주소에 올려도 동작
  base: "./",
  server: { port: 3000 },
});
