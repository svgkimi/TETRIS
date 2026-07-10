/**
 * rng.ts
 * -----------------------------------------------------------------------
 * 테스트 재현성을 위한 시드 기반 의사난수 생성기(PRNG).
 * mulberry32 알고리즘을 사용하며, 반환된 함수는 RandomFn(Math.random과 동일한 시그니처)이다.
 * 생성된 함수가 내부에 시드 진행 상태를 캡슐화하지만, 이는 호출자가 명시적으로 생성해
 * EngineState.random 필드에 담아 사용하는 값이므로 "숨겨진 전역 상태"에 해당하지 않는다.
 */

import type { RandomFn } from "./types";

/**
 * 정수 시드로부터 결정론적인 RandomFn을 생성한다.
 * 입력: seed(32bit 정수로 취급) / 출력: 0 이상 1 미만의 실수를 반환하는 RandomFn
 */
export function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return function seededRandom(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
