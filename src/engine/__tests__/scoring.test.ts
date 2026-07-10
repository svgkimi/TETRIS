/**
 * scoring.test.ts
 * -----------------------------------------------------------------------
 * 점수 계산, T-Spin 보너스, 레벨/낙하 속도, 콤보, Back-to-Back 로직을 검증한다.
 */

import { describe, expect, it } from "vitest";
import {
  calculateDropScore,
  calculateGravityIntervalMs,
  calculateLevel,
  calculateLockScore,
  calculateNextCombo,
  isDifficultClear,
  LINES_PER_LEVEL,
} from "../scoring";

describe("calculateLockScore: 라인 클리어 기본 점수", () => {
  it.each([
    ["single", 100],
    ["double", 300],
    ["triple", 500],
    ["tetris", 800],
  ] as const)("%s 클리어는 레벨1에서 %i점", (category, expected) => {
    const result = calculateLockScore({
      category,
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(expected);
  });

  it("레벨 배수가 적용된다", () => {
    const result = calculateLockScore({
      category: "single",
      tSpin: "none",
      level: 3,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(300); // 100 * 3
  });

  it("클리어가 없으면 0점", () => {
    const result = calculateLockScore({
      category: "none",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(0);
  });
});

describe("calculateLockScore: T-Spin 보너스", () => {
  it("T-Spin Double은 1200점 (레벨1)", () => {
    const result = calculateLockScore({
      category: "double",
      tSpin: "normal",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(1200);
  });

  it("T-Spin Mini Single은 200점", () => {
    const result = calculateLockScore({
      category: "single",
      tSpin: "mini",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(200);
  });

  it("라인 클리어 없는 T-Spin(Zero)도 기본 점수를 받는다", () => {
    const result = calculateLockScore({
      category: "none",
      tSpin: "normal",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(400);
  });
});

describe("isDifficultClear / Back-to-Back", () => {
  it("테트리스와 라인이 동반된 T-Spin만 difficult로 간주한다", () => {
    expect(isDifficultClear("tetris", "none")).toBe(true);
    expect(isDifficultClear("single", "normal")).toBe(true);
    expect(isDifficultClear("double", "mini")).toBe(true);
    expect(isDifficultClear("single", "none")).toBe(false);
    expect(isDifficultClear("triple", "none")).toBe(false);
    expect(isDifficultClear("none", "normal")).toBe(false); // 클리어 자체가 없으면 difficult 아님
  });

  it("테트리스 연속 시 Back-to-Back 배율(1.5배)이 적용된다", () => {
    const result = calculateLockScore({
      category: "tetris",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: true,
    });
    expect(result.points).toBe(1200); // 800 * 1.5
    expect(result.nextBackToBack).toBe(true);
  });

  it("첫 테트리스는(이전 B2B 없음) 배율이 적용되지 않지만 이후 B2B를 활성화한다", () => {
    const result = calculateLockScore({
      category: "tetris",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(800);
    expect(result.nextBackToBack).toBe(true);
  });

  it("일반 클리어(싱글/더블/트리플, T-Spin 아님)가 끼면 Back-to-Back이 끊긴다", () => {
    const result = calculateLockScore({
      category: "double",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: true,
    });
    expect(result.nextBackToBack).toBe(false);
    expect(result.points).toBe(300); // 배율 미적용
  });

  it("클리어가 전혀 없는 락(none)은 Back-to-Back 상태를 그대로 보존한다", () => {
    const preserved = calculateLockScore({
      category: "none",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: true,
    });
    expect(preserved.nextBackToBack).toBe(true);

    const stillFalse = calculateLockScore({
      category: "none",
      tSpin: "none",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(stillFalse.nextBackToBack).toBe(false);
  });

  it("T-Spin 연속도 Back-to-Back 배율 대상이다", () => {
    const result = calculateLockScore({
      category: "single",
      tSpin: "normal",
      level: 1,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: true,
    });
    expect(result.points).toBe(1200); // 800 * 1.5
    expect(result.nextBackToBack).toBe(true);
  });
});

describe("콤보 점수/카운트", () => {
  it("콤보 카운트: 클리어가 이어지면 1씩 증가, 끊기면 0으로 리셋", () => {
    expect(calculateNextCombo(0, "single")).toBe(1);
    expect(calculateNextCombo(1, "double")).toBe(2);
    expect(calculateNextCombo(5, "tetris")).toBe(6);
    expect(calculateNextCombo(5, "none")).toBe(0);
    expect(calculateNextCombo(0, "none")).toBe(0);
  });

  it("콤보 보너스 점수가 콤보 수와 레벨에 비례해 가산된다", () => {
    const noCombo = calculateLockScore({
      category: "single",
      tSpin: "none",
      level: 2,
      comboCountBeforeThisClear: 0,
      wasBackToBackBefore: false,
    });
    expect(noCombo.points).toBe(200); // 100 * 2 + 0

    const withCombo = calculateLockScore({
      category: "single",
      tSpin: "none",
      level: 2,
      comboCountBeforeThisClear: 3,
      wasBackToBackBefore: false,
    });
    // 기본 100*2=200 + 콤보 보너스 50*3*2=300 => 500
    expect(withCombo.points).toBe(500);
  });

  it("클리어가 없는 락(T-Spin Zero 포함)에는 콤보 보너스가 붙지 않는다", () => {
    const result = calculateLockScore({
      category: "none",
      tSpin: "normal",
      level: 1,
      comboCountBeforeThisClear: 5,
      wasBackToBackBefore: false,
    });
    expect(result.points).toBe(400); // T-Spin 기본 점수만, 콤보 보너스 없음
  });
});

describe("calculateDropScore", () => {
  it("소프트/하드 드롭 칸당 점수를 계산한다", () => {
    expect(calculateDropScore(5, 1)).toBe(5);
    expect(calculateDropScore(5, 2)).toBe(10);
  });

  it("음수 칸 수는 0점 처리된다", () => {
    expect(calculateDropScore(-3, 2)).toBe(0);
  });
});

describe("calculateLevel: 레벨업 임계치", () => {
  it(`${LINES_PER_LEVEL}라인마다 레벨이 오른다`, () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(LINES_PER_LEVEL - 1)).toBe(1);
    expect(calculateLevel(LINES_PER_LEVEL)).toBe(2);
    expect(calculateLevel(LINES_PER_LEVEL * 2)).toBe(3);
    expect(calculateLevel(LINES_PER_LEVEL * 2 - 1)).toBe(2);
  });
});

describe("calculateGravityIntervalMs: 레벨에 따른 낙하 속도", () => {
  it("레벨이 오를수록 낙하 간격이 짧아진다(속도 증가)", () => {
    const level1 = calculateGravityIntervalMs(1);
    const level2 = calculateGravityIntervalMs(2);
    const level10 = calculateGravityIntervalMs(10);
    expect(level2).toBeLessThan(level1);
    expect(level10).toBeLessThan(level2);
  });

  it("최소 50ms 하한선을 갖는다 (고레벨에서도 0 이하로 내려가지 않음)", () => {
    expect(calculateGravityIntervalMs(100)).toBe(50);
    expect(calculateGravityIntervalMs(1000)).toBe(50);
  });
});
