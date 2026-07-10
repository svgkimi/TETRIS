/**
 * hold.ts
 * -----------------------------------------------------------------------
 * 홀드(Hold) 기능의 순수 로직을 담당한다. 실제 피스 스폰/큐 소비는 gameEngine.ts 에서
 * 이 모듈이 반환한 정보를 바탕으로 처리한다(관심사 분리).
 */

import type { TetrominoType } from "./types";

/** 홀드 스왑 계산 결과 */
export interface HoldSwapResult {
  /** 홀드 슬롯에 새로 저장될 피스 종류 (현재 활성 피스였던 것) */
  readonly newHoldType: TetrominoType;
  /** 다음에 활성화되어야 할 피스 종류 */
  readonly nextActiveType: TetrominoType;
  /** true면 홀드 슬롯이 비어있었으므로 next-queue에서 한 개를 소비해야 함을 의미 */
  readonly shouldConsumeFromQueue: boolean;
}

/**
 * 홀드 스왑 결과를 계산한다.
 * - 홀드 슬롯이 비어있으면: 현재 피스를 홀드에 넣고, next-queue의 맨 앞 피스를 활성화한다.
 * - 홀드 슬롯에 피스가 있으면: 현재 피스와 홀드 슬롯의 피스를 서로 교체한다.
 * 입력: currentActiveType(현재 조작 중인 피스 종류), currentHoldType(홀드 슬롯, 비어있으면 null)
 * 출력: HoldSwapResult
 */
export function computeHoldSwap(
  currentActiveType: TetrominoType,
  currentHoldType: TetrominoType | null,
): HoldSwapResult {
  if (currentHoldType === null) {
    return {
      newHoldType: currentActiveType,
      nextActiveType: currentActiveType, // placeholder, gameEngine이 큐에서 꺼낸 값으로 대체함
      shouldConsumeFromQueue: true,
    };
  }
  return {
    newHoldType: currentActiveType,
    nextActiveType: currentHoldType,
    shouldConsumeFromQueue: false,
  };
}
