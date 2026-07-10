/**
 * bag.test.ts
 * -----------------------------------------------------------------------
 * 7-bag 랜덤 시스템의 통계적 정확성(각 bag 내 7종 1회씩), 큐 보충 로직,
 * 시드 기반 RNG를 이용한 결정론적 재현성을 검증한다.
 */

import { describe, expect, it } from "vitest";
import { NEXT_QUEUE_PREVIEW_SIZE, previewNext, refillQueue, shuffleBag, takeNextPiece } from "../bag";
import { createSeededRandom } from "../rng";
import { ALL_TETROMINO_TYPES } from "../types";

describe("shuffleBag: 7종 1회씩 등장", () => {
  it("셔플된 bag은 7개이며 7종이 정확히 1번씩 포함된다", () => {
    const random = createSeededRandom(42);
    for (let trial = 0; trial < 50; trial++) {
      const bag = shuffleBag(random);
      expect(bag).toHaveLength(7);
      expect([...bag].sort()).toEqual([...ALL_TETROMINO_TYPES].sort());
    }
  });

  it("시드가 다르면(또는 여러 번 호출하면) 항상 같은 순서가 나오는 것은 아니다", () => {
    const random = createSeededRandom(1);
    const bags = Array.from({ length: 10 }, () => shuffleBag(random).join(""));
    const uniqueBags = new Set(bags);
    expect(uniqueBags.size).toBeGreaterThan(1);
  });
});

describe("refillQueue: 큐가 항상 미리보기 요구 개수 이상 채워짐", () => {
  it("빈 큐에서 시작해도 미리보기 개수보다 많이 채워진다", () => {
    const random = createSeededRandom(7);
    const queue = refillQueue([], random);
    expect(queue.length).toBeGreaterThan(NEXT_QUEUE_PREVIEW_SIZE);
  });

  it("소비를 반복해도 큐 길이가 미리보기 요구치 이하로 떨어지지 않는다", () => {
    const random = createSeededRandom(123);
    let queue = refillQueue([], random);
    for (let i = 0; i < 200; i++) {
      const { queue: nextQueue } = takeNextPiece(queue, random);
      queue = nextQueue;
      expect(queue.length).toBeGreaterThan(NEXT_QUEUE_PREVIEW_SIZE);
      expect(previewNext(queue, NEXT_QUEUE_PREVIEW_SIZE)).toHaveLength(NEXT_QUEUE_PREVIEW_SIZE);
    }
  });
});

describe("여러 bag에 걸친 통계 검증: 같은 블록이 7개 윈도우 내에서 중복 없이 등장", () => {
  it("연속된 7-bag 경계마다 7종이 정확히 1번씩 소비된다", () => {
    const random = createSeededRandom(999);
    let queue = refillQueue([], random);
    const consumed: string[] = [];
    for (let i = 0; i < 7 * 30; i++) {
      const { piece, queue: nextQueue } = takeNextPiece(queue, random);
      consumed.push(piece);
      queue = nextQueue;
    }
    for (let bagIndex = 0; bagIndex < 30; bagIndex++) {
      const bagSlice = consumed.slice(bagIndex * 7, bagIndex * 7 + 7);
      expect([...bagSlice].sort()).toEqual([...ALL_TETROMINO_TYPES].sort());
    }
  });

  it("같은 조각이 이론상 최대 간격(bag 경계 인접)을 넘어 과도하게 연속 출현하지 않는다", () => {
    // 7-bag 규칙상 같은 블록이 나온 뒤 다음 같은 블록까지 최소 1개, 최대 (7-1)+(7-1)+1=13개 이내여야 한다.
    const random = createSeededRandom(2024);
    let queue = refillQueue([], random);
    const consumed: string[] = [];
    for (let i = 0; i < 7 * 50; i++) {
      const { piece, queue: nextQueue } = takeNextPiece(queue, random);
      consumed.push(piece);
      queue = nextQueue;
    }
    const lastSeenIndex = new Map<string, number>();
    for (let i = 0; i < consumed.length; i++) {
      const piece = consumed[i];
      const last = lastSeenIndex.get(piece);
      if (last !== undefined) {
        expect(i - last).toBeLessThanOrEqual(13);
        expect(i - last).toBeGreaterThanOrEqual(1);
      }
      lastSeenIndex.set(piece, i);
    }
  });
});

describe("시드 기반 RNG 결정론적 재현", () => {
  it("같은 시드로 생성한 두 RNG는 동일한 피스 시퀀스를 만든다", () => {
    const randomA = createSeededRandom(555);
    const randomB = createSeededRandom(555);

    let queueA = refillQueue([], randomA);
    let queueB = refillQueue([], randomB);
    const sequenceA: string[] = [];
    const sequenceB: string[] = [];
    for (let i = 0; i < 50; i++) {
      const a = takeNextPiece(queueA, randomA);
      const b = takeNextPiece(queueB, randomB);
      sequenceA.push(a.piece);
      sequenceB.push(b.piece);
      queueA = a.queue;
      queueB = b.queue;
    }
    expect(sequenceA).toEqual(sequenceB);
  });

  it("시드가 다르면 (매우 높은 확률로) 다른 시퀀스가 나온다", () => {
    const randomA = createSeededRandom(1);
    const randomB = createSeededRandom(2);
    let queueA = refillQueue([], randomA);
    let queueB = refillQueue([], randomB);
    const sequenceA: string[] = [];
    const sequenceB: string[] = [];
    for (let i = 0; i < 30; i++) {
      const a = takeNextPiece(queueA, randomA);
      const b = takeNextPiece(queueB, randomB);
      sequenceA.push(a.piece);
      sequenceB.push(b.piece);
      queueA = a.queue;
      queueB = b.queue;
    }
    expect(sequenceA).not.toEqual(sequenceB);
  });
});

describe("previewNext", () => {
  it("큐를 변경하지 않고 앞에서부터 N개를 읽기 전용으로 반환한다", () => {
    const random = createSeededRandom(3);
    const queue = refillQueue([], random);
    const preview = previewNext(queue, 5);
    expect(preview).toHaveLength(5);
    expect(preview).toEqual(queue.slice(0, 5));
    // 원본 큐는 변경되지 않아야 한다
    expect(queue.slice(0, 5)).toEqual(preview);
  });
});
