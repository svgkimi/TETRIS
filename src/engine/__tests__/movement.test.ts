/**
 * movement.test.ts
 * -----------------------------------------------------------------------
 * 좌우 이동, 소프트/하드 드롭, 고스트 피스 계산 로직을 검증한다.
 */

import { describe, expect, it } from "vitest";
import { createEmptyBoard } from "../board";
import { calculateGhostPiece, hardDrop, moveDown, moveHorizontal } from "../movement";
import { boardWithFilledCells } from "./testUtils";
import { BOARD_TOTAL_HEIGHT } from "../types";
import type { ActivePiece } from "../types";

describe("moveHorizontal", () => {
  it("충돌이 없으면 좌우로 이동한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    const right = moveHorizontal(board, piece, 1);
    expect(right.moved).toBe(true);
    expect(right.piece.position).toEqual({ x: 5, y: 10 });

    const left = moveHorizontal(board, piece, -1);
    expect(left.moved).toBe(true);
    expect(left.piece.position).toEqual({ x: 3, y: 10 });
  });

  it("벽에 막히면 이동하지 않고 원래 피스를 반환한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 0, y: 10 } };
    const result = moveHorizontal(board, piece, -1);
    expect(result.moved).toBe(false);
    expect(result.piece).toEqual(piece);
  });

  it("다른 고정 블록에 막히면 이동하지 않는다", () => {
    const board = boardWithFilledCells([[2, 10]]);
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 3, y: 10 } };
    const result = moveHorizontal(board, piece, -1);
    expect(result.moved).toBe(false);
  });
});

describe("moveDown", () => {
  it("아래로 한 칸 이동한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 10 } };
    const result = moveDown(board, piece);
    expect(result.moved).toBe(true);
    expect(result.piece.position).toEqual({ x: 4, y: 11 });
  });

  it("바닥에 닿으면 이동하지 않는다 (접지 상태)", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: BOARD_TOTAL_HEIGHT - 2 } };
    const result = moveDown(board, piece);
    expect(result.moved).toBe(false);
  });
});

describe("calculateGhostPiece / hardDrop: 고스트-하드드롭 위치 일치", () => {
  it("빈 보드에서 고스트는 바닥에 정확히 착지한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 0 } };
    const ghost = calculateGhostPiece(board, piece);
    expect(ghost.position).toEqual({ x: 4, y: BOARD_TOTAL_HEIGHT - 2 });
  });

  it("하드 드롭 결과 위치가 고스트 피스 위치와 정확히 일치한다", () => {
    const board = boardWithFilledCells([[4, 30], [5, 30]]); // 바닥 위 장애물
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 0 } };
    const ghost = calculateGhostPiece(board, piece);
    const { piece: dropped, droppedRows } = hardDrop(board, piece);

    expect(dropped.position).toEqual(ghost.position);
    expect(dropped.position).toEqual({ x: 4, y: 28 });
    expect(droppedRows).toBe(28);
  });

  it("이미 접지 상태라면 하드 드롭은 0칸 낙하한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: BOARD_TOTAL_HEIGHT - 2 } };
    const { droppedRows } = hardDrop(board, piece);
    expect(droppedRows).toBe(0);
  });
});
