/**
 * movement.ts
 * -----------------------------------------------------------------------
 * 좌우 이동, 소프트/하드 드롭, 고스트 피스 위치 계산 등 이동 관련 순수 함수들을 정의한다.
 */

import { checkCollision } from "./board";
import type { ActivePiece, Board } from "./types";

/** 이동 시도 결과 */
export interface MoveResult {
  readonly moved: boolean;
  readonly piece: ActivePiece;
}

/**
 * 피스를 dx만큼 좌우로 이동시킨다. 충돌하면 이동하지 않고 원래 피스를 반환한다.
 * 입력: board, piece, dx(음수=왼쪽, 양수=오른쪽) / 출력: MoveResult
 */
export function moveHorizontal(board: Board, piece: ActivePiece, dx: number): MoveResult {
  const candidate: ActivePiece = {
    ...piece,
    position: { x: piece.position.x + dx, y: piece.position.y },
  };
  if (checkCollision(board, candidate)) {
    return { moved: false, piece };
  }
  return { moved: true, piece: candidate };
}

/**
 * 피스를 한 칸 아래로 이동시킨다(소프트 드롭 1칸 단위). 충돌 시 이동하지 않는다.
 * 입력: board, piece / 출력: MoveResult (moved=false면 바닥/스택에 닿은 상태)
 */
export function moveDown(board: Board, piece: ActivePiece): MoveResult {
  const candidate: ActivePiece = {
    ...piece,
    position: { x: piece.position.x, y: piece.position.y + 1 },
  };
  if (checkCollision(board, candidate)) {
    return { moved: false, piece };
  }
  return { moved: true, piece: candidate };
}

/**
 * 현재 피스가 하드 드롭될 경우 도달할 최종 착지 위치(고스트 피스)를 계산한다.
 * 입력: board, piece / 출력: 바닥/스택에 닿을 때까지 아래로 내린 ActivePiece
 */
export function calculateGhostPiece(board: Board, piece: ActivePiece): ActivePiece {
  let current = piece;
  for (;;) {
    const next: ActivePiece = {
      ...current,
      position: { x: current.position.x, y: current.position.y + 1 },
    };
    if (checkCollision(board, next)) {
      return current;
    }
    current = next;
  }
}

/** 하드 드롭 결과: 최종 위치와 낙하한 칸 수(점수 계산에 사용) */
export interface HardDropResult {
  readonly piece: ActivePiece;
  readonly droppedRows: number;
}

/**
 * 피스를 즉시 고스트 위치까지 낙하시킨다(하드 드롭). 실제 보드에 고정하는 처리는
 * gameEngine.ts 에서 lockPieceToBoard 와 함께 수행한다(관심사 분리).
 * 입력: board, piece / 출력: HardDropResult(최종 피스, 낙하 거리)
 */
export function hardDrop(board: Board, piece: ActivePiece): HardDropResult {
  const ghost = calculateGhostPiece(board, piece);
  const droppedRows = ghost.position.y - piece.position.y;
  return { piece: ghost, droppedRows };
}
