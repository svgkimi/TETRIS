/**
 * rotation.test.ts
 * -----------------------------------------------------------------------
 * SRS 회전/킥 테이블 적용 로직(tryRotate)과 T-Spin 3-corner 판정(detectTSpin)을 검증한다.
 * 킥 좌표는 srsKickTables.ts 의 실제 테이블 값을 기준으로 손으로 좌표를 계산해
 * "특정 킥 인덱스가 정확히 선택되는지"까지 검증한다 (단순히 "성공/실패"만 보지 않는다).
 */

import { describe, expect, it } from "vitest";
import { createEmptyBoard } from "../board";
import { detectTSpin, tryRotate } from "../rotation";
import { boardWithFilledCells, fullySolidBoard } from "./testUtils";
import type { ActivePiece } from "../types";

describe("tryRotate: 기본 회전 및 O 피스", () => {
  it("빈 보드에서 기본 회전은 킥 없이(kickIndex=0) 성공한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: 3, y: 15 } };
    const result = tryRotate(board, piece, "CW");
    expect(result.success).toBe(true);
    expect(result.kickIndex).toBe(0);
    expect(result.piece.rotation).toBe(1);
    expect(result.piece.position).toEqual({ x: 3, y: 15 });
  });

  it("O 피스는 회전해도 position이 전혀 변하지 않는다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, position: { x: 4, y: 15 } };
    for (const dir of ["CW", "CCW", "180"] as const) {
      const result = tryRotate(board, piece, dir);
      expect(result.success).toBe(true);
      expect(result.piece.position).toEqual({ x: 4, y: 15 });
    }
  });
});

describe("tryRotate: JLSTZ 공용 킥 테이블 순차 적용", () => {
  it("앞선 킥(0,1)이 막혀 있으면 세 번째 킥(index=2)까지 순서대로 시도해 성공한다", () => {
    // T 피스, rotation 0(위) at (3,15) -> CW -> rotation 1(오른쪽)
    // 0-1 전이 킥 테이블: [(0,0), (-1,0), (-1,-1), (0,2), (-1,2)]
    const px = 3;
    const py = 15;
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };

    // kick0(오프셋 없음)의 유일한 신규 점유 셀: (px+1, py+2)
    // kick1(오프셋 -1,0)의 유일한 신규 점유 셀: (px, py+2)
    // 두 셀만 막아두면 kick0/kick1은 실패하고 kick2((-1,-1))는 영향받지 않는다.
    const board = boardWithFilledCells([
      [px + 1, py + 2],
      [px, py + 2],
    ]);

    const result = tryRotate(board, piece, "CW");
    expect(result.success).toBe(true);
    expect(result.kickIndex).toBe(2);
    expect(result.piece.rotation).toBe(1);
    expect(result.piece.position).toEqual({ x: px - 1, y: py - 1 });
  });

  it("Wall Kick: 오른쪽 벽에 붙은 상태에서 회전 시 필요한 만큼만 밀려난다 (I 피스 전용 킥 사용)", () => {
    // I 피스, rotation 1(세로, 오른쪽 벽에 붙음) at (7,5) -> CW -> rotation 2(가로)
    // I 전용 1-2 킥 테이블: [(0,0), (-1,0), (2,0), (-1,-2), (2,1)]
    // kick0은 보드 밖(x=10)으로 나가 충돌하고, kick1(-1,0)에서 성공해야 한다.
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "I", rotation: 1, position: { x: 7, y: 5 } };
    const result = tryRotate(board, piece, "CW");
    expect(result.success).toBe(true);
    expect(result.kickIndex).toBe(1);
    expect(result.piece.position).toEqual({ x: 6, y: 5 });
    expect(result.piece.rotation).toBe(2);
  });

  it("Floor Kick: 바닥 장애물에 막혀 순수 수직(위쪽) 킥으로만 성공한다", () => {
    // T 피스, rotation 1(오른쪽) at (3,15) -> CW -> rotation 2(아래)
    // JLSTZ 1-2 킥 테이블: [(0,0), (1,0), (1,1), (0,-2), (1,-2)]
    // kick0/1/2에서만 충돌하는 장애물 셀을 배치하고, kick3(0,-2, 순수 수직)에서 성공하는지 확인한다.
    const px = 3;
    const py = 15;
    const piece: ActivePiece = { type: "T", rotation: 1, position: { x: px, y: py } };
    const board = boardWithFilledCells([
      [px, py + 1], // kick0의 신규 점유 셀
      [px + 3, py + 1], // kick1의 신규 점유 셀
      [px + 3, py + 2], // kick2의 신규 점유 셀
    ]);

    const result = tryRotate(board, piece, "CW");
    expect(result.success).toBe(true);
    expect(result.kickIndex).toBe(3);
    expect(result.piece.position).toEqual({ x: px, y: py - 2 });
    expect(result.piece.rotation).toBe(2);
  });

  it("모든 킥이 실패하면 회전이 취소되고 원래 상태를 그대로 유지한다", () => {
    // 피스가 완전히 빈틈없이 둘러싸인 상태 -> 어떤 킥 오프셋도 충돌을 피할 수 없다.
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: 3, y: 15 } };
    const solid = fullySolidBoard();
    // 피스 본인이 차지한 4칸만 비워서, 회전 시 다른 모양이 되면 반드시 막힌 칸에 걸리게 한다.
    const board = solid.map((row, y) =>
      row.map((cell, x) => {
        const occupied =
          (x === 4 && y === 15) ||
          (x === 3 && y === 16) ||
          (x === 4 && y === 16) ||
          (x === 5 && y === 16);
        return occupied ? null : cell;
      }),
    );

    const result = tryRotate(board, piece, "CW");
    expect(result.success).toBe(false);
    expect(result.kickIndex).toBe(-1);
    // 실패 시 원래 피스가 그대로(변경 없이) 반환되어야 한다.
    expect(result.piece).toEqual(piece);
  });
});

describe("tryRotate: 180도 회전", () => {
  it("180도 회전도 후보 오프셋 중 충돌하지 않는 첫 번째로 성공한다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: 3, y: 15 } };
    const result = tryRotate(board, piece, "180");
    expect(result.success).toBe(true);
    expect(result.piece.rotation).toBe(2);
  });
});

describe("detectTSpin: 3-corner rule 판정", () => {
  /** T 피스 3x3 박스의 네 코너 좌표(로컬 0,0 / 2,0 / 0,2 / 2,2)를 절대 좌표로 변환 */
  const corners = (px: number, py: number) => ({
    topLeft: [px, py] as const,
    topRight: [px + 2, py] as const,
    bottomLeft: [px, py + 2] as const,
    bottomRight: [px + 2, py + 2] as const,
  });

  it("회전이 아니면(lastActionWasRotation=false) 코너가 다 채워져도 none", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    const board = boardWithFilledCells([c.topLeft, c.topRight, c.bottomLeft, c.bottomRight]);
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, false, 0)).toBe("none");
  });

  it("T가 아닌 피스는 항상 none", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    const board = boardWithFilledCells([c.topLeft, c.topRight, c.bottomLeft, c.bottomRight]);
    const piece: ActivePiece = { type: "J", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 0)).toBe("none");
  });

  it("코너 점유가 2개 이하이면 none", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    const board = boardWithFilledCells([c.topLeft, c.topRight]); // rotation 0의 전방 2개만 채움 -> 총 2개
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 0)).toBe("none");
  });

  it("전방 2개 + 후방 1개 이상 점유 -> 일반(normal) T-Spin (rotation 0, 위쪽 방향)", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    // rotation 0: front = topLeft/topRight, back = bottomLeft/bottomRight
    const board = boardWithFilledCells([c.topLeft, c.topRight, c.bottomLeft]);
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 1)).toBe("normal");
  });

  it("전방 1개 + 후방 2개 점유 -> Mini T-Spin (rotation 0)", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    const board = boardWithFilledCells([c.topLeft, c.bottomLeft, c.bottomRight]);
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 1)).toBe("mini");
  });

  it("Mini 패턴이라도 마지막 킥이 index=4(5번째 테스트)였다면 일반 T-Spin으로 승격 (TST 특례)", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    const board = boardWithFilledCells([c.topLeft, c.bottomLeft, c.bottomRight]);
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 4)).toBe("normal");
  });

  it("rotation 1(오른쪽 방향)에서는 전방이 오른쪽 코너(topRight/bottomRight)이다", () => {
    const px = 3;
    const py = 15;
    const c = corners(px, py);
    // rotation 1: front = topRight/bottomRight, back = topLeft/bottomLeft
    const board = boardWithFilledCells([c.topRight, c.bottomRight, c.topLeft]);
    const piece: ActivePiece = { type: "T", rotation: 1, position: { x: px, y: py } };
    expect(detectTSpin(board, piece, true, 1)).toBe("normal");
  });

  it("보드 밖(경계)도 점유로 취급되어 T-Spin 판정에 포함된다", () => {
    // 보드 왼쪽 벽에 완전히 붙어(px=0) topLeft/bottomLeft가 보드 밖으로 나가는 상황
    const px = -1; // topLeft=(-1,py), bottomLeft=(-1,py+2) -> 보드 밖
    const py = 15;
    const board = boardWithFilledCells([[px + 2, py]]); // topRight만 실제로 채움
    const piece: ActivePiece = { type: "T", rotation: 0, position: { x: px, y: py } };
    // front(topLeft, topRight): topLeft=보드밖(점유 취급)+topRight=채움 -> front 2개 모두 점유
    // back(bottomLeft, bottomRight): bottomLeft=보드밖(점유 취급) -> back 1개 이상 점유
    expect(detectTSpin(board, piece, true, 1)).toBe("normal");
  });
});
