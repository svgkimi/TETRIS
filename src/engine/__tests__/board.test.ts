/**
 * board.test.ts
 * -----------------------------------------------------------------------
 * 보드 경계/충돌 판정, 피스 고정(lock) 로직을 검증한다.
 */

import { describe, expect, it } from "vitest";
import {
  checkCollision,
  createEmptyBoard,
  getPieceCells,
  isCellEmpty,
  isInsideBoard,
  isOccupiedOrOutside,
  lockPieceToBoard,
} from "../board";
import { boardWithFilledCells } from "./testUtils";
import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "../types";
import type { ActivePiece } from "../types";

describe("isInsideBoard / isCellEmpty", () => {
  it("보드 경계 내부/외부를 정확히 판정한다", () => {
    expect(isInsideBoard(0, 0)).toBe(true);
    expect(isInsideBoard(BOARD_WIDTH - 1, BOARD_TOTAL_HEIGHT - 1)).toBe(true);
    expect(isInsideBoard(-1, 0)).toBe(false);
    expect(isInsideBoard(BOARD_WIDTH, 0)).toBe(false);
    expect(isInsideBoard(0, -1)).toBe(false);
    expect(isInsideBoard(0, BOARD_TOTAL_HEIGHT)).toBe(false);
  });

  it("범위를 벗어난 셀은 항상 점유된 것으로 취급한다", () => {
    const board = createEmptyBoard();
    expect(isCellEmpty(board, -1, 5)).toBe(false);
    expect(isCellEmpty(board, BOARD_WIDTH, 5)).toBe(false);
    expect(isCellEmpty(board, 5, -1)).toBe(false);
    expect(isCellEmpty(board, 5, BOARD_TOTAL_HEIGHT)).toBe(false);
  });

  it("isOccupiedOrOutside는 보드 밖도 점유로 취급한다", () => {
    const board = createEmptyBoard();
    expect(isOccupiedOrOutside(board, -1, 0)).toBe(true);
    expect(isOccupiedOrOutside(board, 0, 0)).toBe(false);
  });
});

describe("checkCollision: 벽/바닥/고정 블록 충돌", () => {
  it("좌측 벽 충돌", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: -1, y: 10 } };
    expect(checkCollision(board, piece)).toBe(true);
  });

  it("우측 벽 충돌", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: BOARD_WIDTH - 1, y: 10 } };
    expect(checkCollision(board, piece)).toBe(true);
  });

  it("바닥 충돌", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: BOARD_TOTAL_HEIGHT - 1 } };
    expect(checkCollision(board, piece)).toBe(true);
  });

  it("경계 안쪽의 유효한 위치는 충돌하지 않는다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    expect(checkCollision(board, piece)).toBe(false);
  });

  it("이미 고정된 다른 블록과의 충돌을 감지한다", () => {
    const board = boardWithFilledCells([[4, 11]]);
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    // O 피스는 (4,10)(5,10)(4,11)(5,11)을 차지 -> (4,11)이 채워져 있어 충돌해야 함
    expect(checkCollision(board, piece)).toBe(true);
  });

  it("고정 블록과 겹치지 않으면 충돌하지 않는다", () => {
    const board = boardWithFilledCells([[4, 12]]); // O 피스 범위 밖
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    expect(checkCollision(board, piece)).toBe(false);
  });
});

describe("getPieceCells / lockPieceToBoard", () => {
  it("절대 좌표를 정확히 계산한다", () => {
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    const cells = getPieceCells(piece);
    expect(cells).toEqual(
      expect.arrayContaining([
        { x: 4, y: 10 },
        { x: 5, y: 10 },
        { x: 4, y: 11 },
        { x: 5, y: 11 },
      ]),
    );
  });

  it("피스를 고정하면 새 보드에 4칸이 채워지고 원본 보드는 변경되지 않는다", () => {
    const original = createEmptyBoard();
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: 3, y: 15 } };
    const locked = lockPieceToBoard(original, piece);

    // 원본 불변성
    expect(original[15][4]).toBeNull();
    expect(original[16][3]).toBeNull();

    // 새 보드에는 T 피스가 고정됨
    expect(locked[15][4]).toBe("T");
    expect(locked[16][3]).toBe("T");
    expect(locked[16][4]).toBe("T");
    expect(locked[16][5]).toBe("T");
  });
});
