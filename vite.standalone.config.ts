import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// 더블클릭만으로 실행되는 단일 HTML 파일(tetris-standalone.html)을 만들기 위한 전용 빌드 설정.
// 일반 배포용 `npm run build`(vite.config.ts)와는 분리해, JS/CSS를 전부 index.html 안에 인라인한다.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
});
