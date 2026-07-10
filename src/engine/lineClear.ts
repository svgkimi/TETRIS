/**
 * lineClear.ts
 * -----------------------------------------------------------------------
 * 가득 찬 줄을 탐지하고 제거한 뒤, 위쪽 줄들을 아래로 내리는 로직을 담당한다.
 */

import { BOARD_WIDTH, type Board, type BoardCell, type LineClearCategory, type LineClearResult } from "./types";

/**
 * 보드에서 모든 셀이 채워진(가득 찬) 행의 인덱스 목록을 찾는다.
 * 입력: board / 출력: 가득 찬 행 index 배열 (위->아래 순서)
 */
export function findFullRows(board: Board): number[] {
  const fullRows: number[] = [];
  for (let y = 0; y < board.length; y++) {
    if (board[y].every((cell) => cell !== null)) {
      fullRows.push(y);
    }
  }
  return fullRows;
}

/** 지워진 줄 수를 카테고리 문자열로 변환한다. 입력: count / 출력: LineClearCategory */
function categoryFromCount(count: number): LineClearCategory {
  switch (count) {
    case 1:
      return "single";
    case 2:
      return "double";
    case 3:
      return "triple";
    case 4:
      return "tetris";
    default:
      return "none";
  }
}

/**
 * 주어진 행들을 보드에서 제거하고, 위쪽 줄들을 그만큼 아래로 내린 뒤 최상단에 빈 줄을 채운다.
 * 입력: board, rows(제거할 행 index 목록) / 출력: 새 Board (불변, 원본 미변경)
 */
export function clearRows(board: Board, rows: readonly number[]): Board {
  if (rows.length === 0) return board;
  const rowSet = new Set(rows);
  const remainingRows = board.filter((_, y) => !rowSet.has(y));
  const emptyRow = (): BoardCell[] => Array.from({ length: BOARD_WIDTH }, () => null);
  const newRows: BoardCell[][] = Array.from({ length: rows.length }, emptyRow);
  return [...newRows, ...remainingRows.map((row) => row.slice())];
}

/**
 * 라인 클리어 전체 처리 파이프라인: 가득 찬 행 탐지 -> 제거 -> 결과 반환.
 * 입력: board / 출력: LineClearResult (클리어된 새 보드, 지워진 행/개수/카테고리)
 */
export function processLineClear(board: Board): LineClearResult {
  const clearedRows = findFullRows(board);
  const clearedBoard = clearRows(board, clearedRows);
  return {
    board: clearedBoard,
    clearedLineCount: clearedRows.length,
    clearedRows,
    category: categoryFromCount(clearedRows.length),
  };
}
