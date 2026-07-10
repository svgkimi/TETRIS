import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages는 https://<user>.github.io/TETRIS/ 하위 경로로, Vercel은 도메인 루트("/")로
// 서비스된다. Vercel 빌드 환경에는 VERCEL 환경변수가 자동으로 설정되므로 이를 감지해 분기한다.
// 로컬 개발 서버(`npm run dev`)는 항상 루트 경로에서 서비스된다.
export default defineConfig(({ command }) => ({
  base: command === "build" && !process.env.VERCEL ? "/TETRIS/" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
  },
}));
