/**
 * testUtils.ts
 * -----------------------------------------------------------------------
 * 여러 테스트 파일에서 공용으로 사용하는 보드 생성 헬퍼 함수 모음.
 * vitest 테스트 파일(*.test.ts)이 아니므로 자체적으로는 실행되지 않는다.
 */

import { createEmptyBoard } from "../board";
import { BOARD_WIDTH } from "../types";
import type { Board, BoardCell, TetrominoType } from "../types";

/**
 * 특정 좌표들만 채워진(그 외에는 비어있는) 보드를 생성한다.
 * 입력: cells([x,y] 좌표 목록), fillType(채울 테트리미노 타입, 기본 "I")
 * 출력: 새 Board
 */
export function boardWithFilledCells(
  cells: readonly (readonly [number, number])[],
  fillType: TetrominoType = "I",
): Board {
  const board = createEmptyBoard().map((row) => row.slice()) as BoardCell[][];
  for (const [x, y] of cells) {
    if (y >= 0 && y < board.length && x >= 0 && x < BOARD_WIDTH) {
      board[y][x] = fillType;
    }
  }
  return board;
}

/**
 * 특정 행(row)들을 완전히 채운 보드를 생성한다. (라인 클리어 테스트용)
 * 입력: totalRows(보드 전체 행 수), fullRows(가득 채울 행 index 목록), partialRows(부분적으로만 채울 행과 채울 칸 수 맵)
 * 출력: 새 Board
 */
export function boardWithRows(
  totalRows: number,
  fullRows: readonly number[],
  partialRows: ReadonlyMap<number, number> = new Map(),
): Board {
  const fullSet = new Set(fullRows);
  const board: BoardCell[][] = [];
  for (let y = 0; y < totalRows; y++) {
    const row: BoardCell[] = Array.from({ length: BOARD_WIDTH }, () => null);
    if (fullSet.has(y)) {
      for (let x = 0; x < BOARD_WIDTH; x++) row[x] = "I";
    } else if (partialRows.has(y)) {
      const fillCount = partialRows.get(y) ?? 0;
      for (let x = 0; x < fillCount; x++) row[x] = "I";
    }
    board.push(row);
  }
  return board;
}

/** 완전히 채워진(모든 칸이 특정 타입인) 보드를 생성한다. 트랩 시나리오(모든 킥 실패) 테스트용 */
export function fullySolidBoard(fillType: TetrominoType = "I"): Board {
  const board = createEmptyBoard().map((row) => row.slice()) as BoardCell[][];
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[y][x] = fillType;
    }
  }
  return board;
}
