/**
 * index.ts
 * -----------------------------------------------------------------------
 * 엔진 모듈의 배럴(barrel) 파일. UI 개발자와 QA(테스트) 개발자는 대부분
 * `import { ... } from "src/engine"` 형태로 필요한 타입/함수를 가져오면 된다.
 */

export * from "./types";
export * from "./tetrominoes";
export * from "./board";
export * from "./srsKickTables";
export * from "./rotation";
export * from "./movement";
export * from "./bag";
export * from "./lineClear";
export * from "./scoring";
export * from "./hold";
export * from "./rng";
export * from "./battle";
export * from "./gameEngine";
