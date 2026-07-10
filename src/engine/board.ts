/**
 * board.ts
 * -----------------------------------------------------------------------
 * 보드(필드) 데이터 구조 생성, 충돌 판정, 피스 고정(lock) 등 필드 관련 순수 함수들을 정의한다.
 */

import { getShapeCells } from "./tetrominoes";
import {
  BOARD_TOTAL_HEIGHT,
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type BoardCell,
  type Position,
} from "./types";

/**
 * 빈 보드를 생성한다.
 * 입력: 없음 / 출력: 모든 셀이 null인 Board (BOARD_WIDTH x BOARD_TOTAL_HEIGHT)
 */
export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, (): BoardCell => null),
  );
}

/**
 * 좌표가 보드 범위 내부인지 검사한다. (좌우/바닥 벽 판정용, 상단은 열려있다고 보지 않고 버퍼까지 포함)
 * 입력: x,y(보드 좌표) / 출력: 범위 내부 여부
 */
export function isInsideBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_TOTAL_HEIGHT;
}

/**
 * 특정 셀이 비어있는지 확인한다. (범위를 벗어나면 false = 점유된 것으로 취급)
 * 입력: board, x, y / 출력: 비어있으면 true
 */
export function isCellEmpty(board: Board, x: number, y: number): boolean {
  if (!isInsideBoard(x, y)) return false;
  return board[y][x] === null;
}

/**
 * ActivePiece가 차지하는 절대 보드 좌표 4칸을 계산한다.
 * 입력: piece(활성 피스) / 출력: 절대 좌표 배열(길이 4)
 */
export function getPieceCells(piece: ActivePiece): readonly Position[] {
  const localCells = getShapeCells(piece.type, piece.rotation);
  return localCells.map((cell) => ({
    x: piece.position.x + cell.x,
    y: piece.position.y + cell.y,
  }));
}

/**
 * 주어진 피스 배치가 보드와 충돌하는지 검사한다. (벽/바닥/이미 고정된 셀과의 충돌 포함)
 * 입력: board, piece / 출력: 충돌이 발생하면 true, 유효한 위치면 false
 */
export function checkCollision(board: Board, piece: ActivePiece): boolean {
  const cells = getPieceCells(piece);
  return cells.some((cell) => !isCellEmpty(board, cell.x, cell.y));
}

/**
 * 피스를 보드에 고정(lock)한 새 보드를 반환한다. 기존 board는 변경하지 않는다(불변성 유지).
 * 입력: board, piece / 출력: 피스가 채워진 새 Board
 */
export function lockPieceToBoard(board: Board, piece: ActivePiece): Board {
  const nextBoard = board.map((row) => row.slice()) as BoardCell[][];
  for (const cell of getPieceCells(piece)) {
    if (isInsideBoard(cell.x, cell.y)) {
      nextBoard[cell.y][cell.x] = piece.type;
    }
  }
  return nextBoard;
}

/**
 * 보드 상단 버퍼 영역까지 포함해 특정 좌표가 채워져 있는지(벽으로 취급) 판정하는 헬퍼.
 * T-Spin 코너 판정 등에서 "보드 밖 = 점유됨"으로 취급할 때 사용한다.
 * 입력: board, x, y / 출력: 점유(또는 보드 밖)이면 true
 */
export function isOccupiedOrOutside(board: Board, x: number, y: number): boolean {
  if (!isInsideBoard(x, y)) return true;
  return board[y][x] !== null;
}
