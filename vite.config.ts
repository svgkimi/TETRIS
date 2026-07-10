import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages는 https://<user>.github.io/TETRIS/ 하위 경로로 서비스되므로,
// 프로덕션 빌드에서만 base를 "/TETRIS/"로 잡아 자산 경로가 깨지지 않게 한다.
// 로컬 개발 서버(`npm run dev`)는 그대로 루트 경로에서 서비스된다.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/TETRIS/" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
  },
}));
