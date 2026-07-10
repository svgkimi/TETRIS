/**
 * lineClear.test.ts
 * -----------------------------------------------------------------------
 * 라인 클리어 탐지/제거/시프트 로직을 검증한다. (1~4줄 동시 삭제, clearedRows 정확성 포함)
 */

import { describe, expect, it } from "vitest";
import { clearRows, findFullRows, processLineClear } from "../lineClear";
import { boardWithRows } from "./testUtils";
import { BOARD_WIDTH } from "../types";

const TOTAL_ROWS = 40;

describe("findFullRows", () => {
  it("빈 줄은 감지하지 않는다", () => {
    const board = boardWithRows(TOTAL_ROWS, []);
    expect(findFullRows(board)).toEqual([]);
  });

  it("부분적으로만 채워진 줄은 감지하지 않는다", () => {
    const board = boardWithRows(TOTAL_ROWS, [], new Map([[10, BOARD_WIDTH - 1]]));
    expect(findFullRows(board)).toEqual([]);
  });

  it("가득 찬 줄만 정확히 감지한다", () => {
    const board = boardWithRows(TOTAL_ROWS, [5, 10, 39]);
    expect(findFullRows(board)).toEqual([5, 10, 39]);
  });
});

describe("processLineClear: 1~4줄 동시 삭제", () => {
  it("1줄 삭제 (single)", () => {
    const board = boardWithRows(TOTAL_ROWS, [39]);
    const result = processLineClear(board);
    expect(result.clearedLineCount).toBe(1);
    expect(result.clearedRows).toEqual([39]);
    expect(result.category).toBe("single");
  });

  it("2줄 동시 삭제 (double)", () => {
    const board = boardWithRows(TOTAL_ROWS, [38, 39]);
    const result = processLineClear(board);
    expect(result.clearedLineCount).toBe(2);
    expect(result.clearedRows).toEqual([38, 39]);
    expect(result.category).toBe("double");
  });

  it("3줄 동시 삭제 (triple)", () => {
    const board = boardWithRows(TOTAL_ROWS, [37, 38, 39]);
    const result = processLineClear(board);
    expect(result.clearedLineCount).toBe(3);
    expect(result.category).toBe("triple");
  });

  it("4줄 동시 삭제 (tetris)", () => {
    const board = boardWithRows(TOTAL_ROWS, [36, 37, 38, 39]);
    const result = processLineClear(board);
    expect(result.clearedLineCount).toBe(4);
    expect(result.category).toBe("tetris");
  });

  it("클리어가 없으면 category는 none이고 보드가 그대로 유지된다", () => {
    const board = boardWithRows(TOTAL_ROWS, [], new Map([[39, BOARD_WIDTH - 1]]));
    const result = processLineClear(board);
    expect(result.clearedLineCount).toBe(0);
    expect(result.clearedRows).toEqual([]);
    expect(result.category).toBe("none");
    expect(result.board).toEqual(board);
  });

  it("떨어져 있는 여러 줄(비연속)도 정확히 clearedRows에 기록된다", () => {
    const board = boardWithRows(TOTAL_ROWS, [5, 20, 39]);
    const result = processLineClear(board);
    expect(result.clearedRows).toEqual([5, 20, 39]);
    expect(result.clearedLineCount).toBe(3);
    expect(result.category).toBe("triple");
  });

  it("삭제 후 위쪽 줄들이 정확히 아래로 시프트된다", () => {
    // row10: 부분 채움 마커(3칸) - 삭제 대상 아님, 삭제 후 아래로 밀려야 함
    // row39: 가득 참 - 삭제 대상
    const board = boardWithRows(TOTAL_ROWS, [39], new Map([[10, 3]]));
    const result = processLineClear(board);

    // 새 맨 위(row0)는 빈 줄이어야 하고, row10의 내용은 row11로 밀려야 한다
    expect(result.board[0].every((cell) => cell === null)).toBe(true);
    expect(result.board[11][0]).toBe("I");
    expect(result.board[11][1]).toBe("I");
    expect(result.board[11][2]).toBe("I");
    expect(result.board[11][3]).toBeNull();
    // 원래 row10 위치는 이제 다른 줄이 밀려와야 하며 그 자체 내용은 아니어야 함
    expect(result.board[10][0]).toBeNull();
  });
});

describe("clearRows", () => {
  it("rows가 빈 배열이면 보드를 그대로 반환한다", () => {
    const board = boardWithRows(TOTAL_ROWS, [39]);
    expect(clearRows(board, [])).toBe(board);
  });

  it("여러 행을 제거하면 총 행 수는 유지된다 (위에 빈 줄 채움)", () => {
    const board = boardWithRows(TOTAL_ROWS, [10, 20, 39]);
    const result = clearRows(board, [10, 20, 39]);
    expect(result.length).toBe(TOTAL_ROWS);
  });
});
