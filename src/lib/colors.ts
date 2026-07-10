/**
 * colors.ts
 * -----------------------------------------------------------------------
 * 테트리미노 타입별 렌더링 색상(표준 테트리스 가이드라인 색상)을 정의한다.
 * 순수 상수/유틸 파일이며 UI 렌더링 레이어(Canvas, CSS)에서 공통으로 참조한다.
 * 엔진 로직과는 무관한 "표현(presentation)" 전용 데이터.
 */

import type { TetrominoType } from "../engine";

/** 블록 타입별 기본(면) 색상 - I=하늘색, O=노랑, T=보라, S=초록, Z=빨강, J=파랑, L=주황 */
export const TETROMINO_COLORS: Record<TetrominoType, string> = {
  I: "#22d3ee",
  O: "#facc15",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
};

/** 블록 타입별 강조(테두리/글로우) 색상 - 기본색보다 밝게 */
export const TETROMINO_GLOW_COLORS: Record<TetrominoType, string> = {
  I: "#a5f3fc",
  O: "#fef08a",
  T: "#e9d5ff",
  S: "#bbf7d0",
  Z: "#fecaca",
  J: "#bfdbfe",
  L: "#fed7aa",
};

/**
 * 16진수 색상 문자열을 rgba() 문자열로 변환한다. (반투명 렌더링용)
 * 입력: hex(#rrggbb 형태), alpha(0~1) / 출력: rgba(r,g,b,a) 문자열
 */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
