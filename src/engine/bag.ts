/**
 * bag.ts
 * -----------------------------------------------------------------------
 * 7-bag 랜덤 시스템: 7종 테트리미노를 한 세트로 셔플하여 큐에 순서대로 공급한다.
 * 큐가 미리보기 요구 개수보다 짧아지면 새로운 bag을 셔플해 뒤에 이어붙인다.
 * 순수 함수로 구현되어 테스트 시 시드 기반 난수 함수를 주입해 결정론적으로 검증할 수 있다.
 */

import { ALL_TETROMINO_TYPES, type RandomFn, type TetrominoType } from "./types";

/** 최소한으로 보장해야 하는 다음 피스 미리보기 개수 (PRD: 최소 3~5개) */
export const NEXT_QUEUE_PREVIEW_SIZE = 5;

/**
 * Fisher-Yates 셔플로 7종 테트리미노 배열 하나를 무작위로 섞어 반환한다.
 * 입력: random(난수 함수) / 출력: 셔플된 TetrominoType 배열(길이 7)
 */
export function shuffleBag(random: RandomFn = Math.random): TetrominoType[] {
  const bag = [...ALL_TETROMINO_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * 큐 길이가 미리보기 요구 개수 이하로 줄어들면 새 bag을 셔플해 뒤에 이어붙인다.
 * 입력: queue(현재 남은 피스 시퀀스), random / 출력: 보충된 새 큐 배열
 */
export function refillQueue(
  queue: readonly TetrominoType[],
  random: RandomFn = Math.random,
): TetrominoType[] {
  let next = [...queue];
  // 미리보기 개수 + 여유 1개를 항상 확보해 next-queue 조회가 끊기지 않도록 한다.
  while (next.length <= NEXT_QUEUE_PREVIEW_SIZE) {
    next = next.concat(shuffleBag(random));
  }
  return next;
}

/**
 * 큐 맨 앞에서 피스 하나를 꺼내고, 필요 시 자동으로 큐를 보충한다.
 * 입력: queue, random / 출력: 꺼낸 piece와 갱신된 새 queue
 */
export function takeNextPiece(
  queue: readonly TetrominoType[],
  random: RandomFn = Math.random,
): { piece: TetrominoType; queue: TetrominoType[] } {
  const filled = refillQueue(queue, random);
  const [piece, ...rest] = filled;
  const queueAfterTake = refillQueue(rest, random);
  return { piece, queue: queueAfterTake };
}

/**
 * 미리보기용으로 큐의 앞부분 N개를 반환한다. (큐를 변경하지 않는 읽기 전용 조회)
 * 입력: queue, count / 출력: 앞에서부터 count개의 TetrominoType 배열
 */
export function previewNext(
  queue: readonly TetrominoType[],
  count: number = NEXT_QUEUE_PREVIEW_SIZE,
): TetrominoType[] {
  return queue.slice(0, count);
}
