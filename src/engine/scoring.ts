/**
 * scoring.ts
 * -----------------------------------------------------------------------
 * 점수 계산, 콤보, Back-to-Back, 레벨/낙하 속도 시스템을 담당한다.
 * PRD 3.2/3.3 절의 점수 규칙을 그대로 구현한다.
 */

import type { LineClearCategory, TSpinType } from "./types";

/** 라인 클리어 수 -> 기본 점수 (레벨 배수 적용 전) */
const LINE_CLEAR_BASE_SCORE: Record<LineClearCategory, number> = {
  none: 0,
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
};

/** T-Spin(+라인 클리어 조합)별 기본 점수 (레벨 배수 적용 전) */
const T_SPIN_BASE_SCORE: Record<TSpinType, Record<LineClearCategory, number>> = {
  none: { none: 0, single: 0, double: 0, triple: 0, tetris: 0 },
  mini: { none: 100, single: 200, double: 400, triple: 0, tetris: 0 },
  normal: { none: 400, single: 800, double: 1200, triple: 1600, tetris: 0 },
};

/** 콤보 1회당 추가 점수 배율 계수 */
const COMBO_SCORE_PER_LEVEL = 50;

/** Back-to-Back 유지 시 적용되는 점수 배율 */
const BACK_TO_BACK_MULTIPLIER = 1.5;

/** N줄마다 레벨업 (PRD: 10라인) */
export const LINES_PER_LEVEL = 10;

/** 소프트 드롭 1칸당 점수 */
export const SOFT_DROP_SCORE_PER_CELL = 1;
/** 하드 드롭 1칸당 점수 */
export const HARD_DROP_SCORE_PER_CELL = 2;

/**
 * 어떤 클리어(라인 수 + T-Spin 여부)가 "Back-to-Back 대상(difficult clear)"인지 판정한다.
 * 테트리스(4줄) 또는 라인이 동반된 T-Spin(mini/normal)이 해당된다.
 * 입력: category, tSpin / 출력: boolean
 */
export function isDifficultClear(category: LineClearCategory, tSpin: TSpinType): boolean {
  if (category === "none") return false;
  if (category === "tetris") return true;
  return tSpin !== "none";
}

/** 한 번의 락에서 발생한 점수 계산에 필요한 입력값 */
export interface ScoreCalculationInput {
  readonly category: LineClearCategory;
  readonly tSpin: TSpinType;
  readonly level: number;
  readonly comboCountBeforeThisClear: number;
  readonly wasBackToBackBefore: boolean;
}

/** 점수 계산 결과 (합산 점수와, 이번 클리어 이후의 back-to-back 유지 여부) */
export interface ScoreCalculationResult {
  readonly points: number;
  readonly nextBackToBack: boolean;
}

/**
 * 라인 클리어/T-Spin/콤보/Back-to-Back 규칙을 종합해 이번 락의 획득 점수를 계산한다.
 * 입력: ScoreCalculationInput / 출력: ScoreCalculationResult
 */
export function calculateLockScore(input: ScoreCalculationInput): ScoreCalculationResult {
  const { category, tSpin, level, comboCountBeforeThisClear, wasBackToBackBefore } = input;

  if (category === "none" && tSpin === "none") {
    return { points: 0, nextBackToBack: wasBackToBackBefore };
  }

  const baseScore =
    tSpin === "none"
      ? LINE_CLEAR_BASE_SCORE[category]
      : T_SPIN_BASE_SCORE[tSpin][category];

  const difficult = isDifficultClear(category, tSpin);
  // Back-to-Back 보너스는 "이전에도 difficult clear가 이어지고 있었고, 이번에도 difficult"일 때만 적용
  const applyB2BBonus = difficult && wasBackToBackBefore;
  const lineOrTSpinScore = Math.floor(
    baseScore * level * (applyB2BBonus ? BACK_TO_BACK_MULTIPLIER : 1),
  );

  // 콤보 보너스: 라인이 실제로 지워졌을 때만 적용 (T-Spin 무-클리어는 콤보 대상 아님)
  const comboBonus =
    category !== "none" ? COMBO_SCORE_PER_LEVEL * comboCountBeforeThisClear * level : 0;

  const nextBackToBack = difficult ? true : wasBackToBackBefore && category === "none";

  return { points: lineOrTSpinScore + comboBonus, nextBackToBack };
}

/**
 * 소프트/하드 드롭 시 낙하 거리에 비례한 점수를 계산한다.
 * 입력: cells(이동한 칸 수), perCell(칸당 점수) / 출력: 총 점수
 */
export function calculateDropScore(cells: number, perCell: number): number {
  return Math.max(0, cells) * perCell;
}

/**
 * 누적 클리어 라인 수로부터 현재 레벨을 계산한다. 레벨은 1부터 시작한다.
 * 입력: totalLinesCleared / 출력: level(1 이상 정수)
 */
export function calculateLevel(totalLinesCleared: number): number {
  return Math.floor(totalLinesCleared / LINES_PER_LEVEL) + 1;
}

/**
 * 레벨에 따른 자동 낙하(중력) 간격을 ms 단위로 계산한다. 레벨이 오를수록 빨라진다.
 * 입력: level / 출력: 낙하 간격(ms), 최소 50ms로 하한선을 둔다.
 */
export function calculateGravityIntervalMs(level: number): number {
  const interval = 1000 - (level - 1) * 50;
  return Math.max(50, interval);
}

/**
 * 클리어 발생 후 다음 콤보 카운트를 계산한다.
 * 입력: previousCombo, category(이번 락에서 지워진 줄 카테고리) / 출력: 다음 combo 값
 * 규칙: 줄이 지워지면 콤보 +1(콤보 없음 상태(0)에서 시작 시 1), 지워지지 않으면 0으로 리셋.
 */
export function calculateNextCombo(previousCombo: number, category: LineClearCategory): number {
  if (category === "none") return 0;
  return previousCombo + 1;
}
