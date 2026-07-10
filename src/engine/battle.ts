/**
 * battle.ts
 * -----------------------------------------------------------------------
 * 1:1 대전(versus) 모드의 공격 라인 계산 및 가비지 라인 삽입을 담당하는 순수 함수 모듈.
 * 이 파일은 React/네트워킹 등 어떤 프레임워크에도 의존하지 않으며, 이미 계산된
 * ScoreEvent(scoring.ts/gameEngine.ts 산출물)를 "소비"하기만 한다 — 점수/라인클리어
 * 로직 자체는 수정하지 않는다.
 */

import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "./types";
import type { Board, BoardCell, ScoreEvent } from "./types";

/** 라인 클리어 카테고리(T-Spin 아님)별 기본 공격 라인 수 (Tetris 99 / Tetr.io류 참고) */
const BASE_ATTACK_BY_CATEGORY: Record<ScoreEvent["category"], number> = {
  none: 0,
  single: 0,
  double: 1,
  triple: 2,
  tetris: 4,
};

/** T-Spin Mini + 클리어 줄 수 조합별 공격 라인 수 (0줄/1줄만 유효, 2줄 이상은 이론상 발생하지 않음) */
const T_SPIN_MINI_ATTACK: Record<ScoreEvent["category"], number> = {
  none: 0,
  single: 1,
  double: 1,
  triple: 1,
  tetris: 1,
};

/** T-Spin Normal + 클리어 줄 수 조합별 공격 라인 수 */
const T_SPIN_NORMAL_ATTACK: Record<ScoreEvent["category"], number> = {
  none: 0,
  single: 2,
  double: 4,
  triple: 6,
  tetris: 6,
};

/** Back-to-Back(테트리스 또는 T-Spin 연속) 성공 시 추가되는 보너스 공격 라인 수 */
const BACK_TO_BACK_BONUS = 1;

/**
 * 콤보 수에 따른 계단식 추가 공격 라인 테이블.
 * 정확한 가이드라인 수치를 재현하기보다, "콤보가 커질수록 공격력이 세진다"는
 * 느낌을 단순하게 구현한다. combo 값은 이번 클리어 이후의 콤보 카운트(ScoreEvent.combo) 기준.
 * 입력: combo / 출력: 추가 공격 라인 수
 */
function comboAttackBonus(combo: number): number {
  if (combo >= 6) return 3;
  if (combo >= 4) return 2;
  if (combo >= 2) return 1;
  return 0;
}

/**
 * ScoreEvent(락 1회에서 발생한 점수/클리어 이벤트)를 입력받아, 상대방에게 보낼 공격 라인 수를
 * 계산하는 순수 함수. 실제 라인 삭제/점수 계산 로직(scoring.ts, lineClear.ts)에는 관여하지 않고
 * 이미 계산된 결과만 소비한다.
 * 입력: event(ScoreEvent) / 출력: 공격 라인 수(0 이상 정수)
 */
export function calculateAttackLines(event: ScoreEvent): number {
  if (event.category === "none") return 0;

  const baseAttack =
    event.tSpin === "mini"
      ? T_SPIN_MINI_ATTACK[event.category]
      : event.tSpin === "normal"
        ? T_SPIN_NORMAL_ATTACK[event.category]
        : BASE_ATTACK_BY_CATEGORY[event.category];

  const isDifficultClear = event.category === "tetris" || event.tSpin !== "none";
  const backToBackBonus = event.backToBack && isDifficultClear ? BACK_TO_BACK_BONUS : 0;

  const comboBonus = comboAttackBonus(event.combo);

  return baseAttack + backToBackBonus + comboBonus;
}

/**
 * 가비지 행 1개를 생성한다. gapColumn 위치만 비고 나머지는 모두 "GARBAGE"로 채워진다.
 * 입력: gapColumn(뚫려있을 열 index) / 출력: BoardCell 배열 (길이 BOARD_WIDTH)
 */
function createGarbageRow(gapColumn: number): BoardCell[] {
  return Array.from({ length: BOARD_WIDTH }, (_, x): BoardCell => (x === gapColumn ? null : "GARBAGE"));
}

/**
 * 보드 맨 아래에 가비지 라인 count개를 삽입하고, 그만큼 기존 스택 전체를 위로 밀어올리는 순수 함수.
 * 버퍼 영역(BOARD_BUFFER_HEIGHT)에서 여유 공간을 소비하는 방식으로 전체 높이(BOARD_TOTAL_HEIGHT)를
 * 유지한다 — 맨 위쪽에서 count개 행을 제거하고, 맨 아래에 count개의 가비지 행을 추가한다.
 * count가 0 이하이거나 gapColumn이 보드 범위를 벗어나면 원본 board를 그대로 반환한다.
 * 내부에서 난수를 사용하지 않으므로(순수 함수), gapColumn은 항상 호출부(리듀서)에서 결정해 넘겨야 한다.
 * 입력: board, count(삽입할 가비지 행 수), gapColumn(구멍 위치, 모든 가비지 행이 공유)
 * 출력: 새 Board (불변, 원본 board는 변경하지 않음)
 */
export function addGarbageLines(board: Board, count: number, gapColumn: number): Board {
  if (count <= 0) return board;
  if (gapColumn < 0 || gapColumn >= BOARD_WIDTH) return board;

  const clampedCount = Math.min(count, BOARD_TOTAL_HEIGHT);
  const garbageRows: BoardCell[][] = Array.from({ length: clampedCount }, () => createGarbageRow(gapColumn));

  // 맨 위(버퍼 영역)에서 clampedCount개 행을 제거해 전체 높이를 유지한다.
  const remainingRows = board.slice(clampedCount).map((row) => row.slice());

  return [...remainingRows, ...garbageRows];
}
