/**
 * hold.test.ts
 * -----------------------------------------------------------------------
 * 홀드(Hold) 스왑 순수 로직(computeHoldSwap) 단위 테스트.
 * "피스당 1회 제한"과 실제 스왑 동작의 통합 테스트는 gameEngine.test.ts 에서 다룬다.
 */

import { describe, expect, it } from "vitest";
import { computeHoldSwap } from "../hold";

describe("computeHoldSwap", () => {
  it("홀드가 비어있으면: 현재 피스를 홀드에 넣고 큐 소비가 필요함을 알린다", () => {
    const result = computeHoldSwap("T", null);
    expect(result.newHoldType).toBe("T");
    expect(result.shouldConsumeFromQueue).toBe(true);
  });

  it("홀드가 차있으면: 현재 피스와 홀드 피스를 서로 교체하고 큐를 소비하지 않는다", () => {
    const result = computeHoldSwap("T", "I");
    expect(result.newHoldType).toBe("T");
    expect(result.nextActiveType).toBe("I");
    expect(result.shouldConsumeFromQueue).toBe(false);
  });

  it("모든 7종 조합에 대해 newHoldType은 항상 현재 활성 피스 타입이다", () => {
    const types = ["I", "O", "T", "S", "Z", "J", "L"] as const;
    for (const active of types) {
      for (const held of [null, ...types]) {
        const result = computeHoldSwap(active, held);
        expect(result.newHoldType).toBe(active);
      }
    }
  });
});
