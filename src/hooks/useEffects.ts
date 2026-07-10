/**
 * useEffects.ts
 * -----------------------------------------------------------------------
 * 엔진의 lastScoreEvent를 구독해 "화면 흔들림 / 텍스트 팝업" 등 UI 전용 이펙트 상태를
 * 파생시키는 훅. 엔진 리듀서(src/engine)는 절대 건드리지 않고, 순수하게 React 쪽 표현
 * 레이어에서만 상태를 관리한다 (관심사 분리).
 *
 * 콤보/테트리스/T-Spin/레벨업 텍스트 팝업은 각각 고유 id를 가진 큐에 쌓이고,
 * 일정 시간 후 자동으로 소멸한다(dismiss).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreEvent } from "../engine";

/** 화면 흔들림 강도를 나타내는 트리거 정보 */
export interface ShakeTrigger {
  readonly token: number;
  readonly intensity: number;
  readonly durationMs: number;
}

/** 텍스트 팝업(콤보/테트리스/T-Spin/레벨업 등) 한 건 */
export interface EffectPopup {
  readonly id: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly tone: "combo" | "tetris" | "tspin" | "levelup" | "clear";
}

/** useEffects 훅의 반환 타입 */
export interface UseEffectsResult {
  readonly shake: ShakeTrigger | null;
  readonly popups: readonly EffectPopup[];
  /** 팝업 표시가 끝난 뒤 목록에서 제거하기 위한 콜백 */
  readonly dismissPopup: (id: number) => void;
}

/** 팝업이 화면에 유지되는 시간(ms) */
const POPUP_LIFETIME_MS = 1100;

/**
 * lastScoreEvent 변화를 감지해 화면 흔들림/텍스트 팝업 트리거를 생성한다.
 * 입력: lastScoreEvent(엔진 상태의 최신 점수 이벤트) / 출력: UseEffectsResult
 */
export function useEffects(lastScoreEvent: ScoreEvent | null): UseEffectsResult {
  const [shake, setShake] = useState<ShakeTrigger | null>(null);
  const [popups, setPopups] = useState<readonly EffectPopup[]>([]);
  const tokenRef = useRef(0);
  const seenEventRef = useRef<ScoreEvent | null>(null);

  useEffect(() => {
    if (!lastScoreEvent || lastScoreEvent === seenEventRef.current) return;
    seenEventRef.current = lastScoreEvent;

    const { category, tSpin, combo, isLevelUp } = lastScoreEvent;
    const hasClear = category !== "none";
    const hasTSpin = tSpin !== "none";
    if (!hasClear && !hasTSpin && !isLevelUp) return;

    tokenRef.current += 1;
    const newPopups: EffectPopup[] = [];

    if (hasTSpin) {
      newPopups.push({
        id: tokenRef.current * 10 + 1,
        title: tSpin === "normal" ? "T-SPIN" : "T-SPIN MINI",
        subtitle: hasClear ? category.toUpperCase() : undefined,
        tone: "tspin",
      });
    } else if (category === "tetris") {
      newPopups.push({ id: tokenRef.current * 10 + 2, title: "TETRIS", tone: "tetris" });
    } else if (hasClear) {
      newPopups.push({ id: tokenRef.current * 10 + 3, title: category.toUpperCase(), tone: "clear" });
    }

    if (combo >= 2) {
      newPopups.push({
        id: tokenRef.current * 10 + 4,
        title: `${combo} COMBO`,
        tone: "combo",
      });
    }

    if (isLevelUp) {
      newPopups.push({ id: tokenRef.current * 10 + 5, title: "LEVEL UP!", tone: "levelup" });
    }

    if (newPopups.length > 0) {
      setPopups((prev) => [...prev, ...newPopups]);
      newPopups.forEach((popup) => {
        window.setTimeout(() => {
          setPopups((prev) => prev.filter((p) => p.id !== popup.id));
        }, POPUP_LIFETIME_MS);
      });
    }

    // 화면 흔들림 강도: 테트리스/T-Spin > 일반 라인 클리어 순으로 강하게
    let intensity = 0;
    if (category === "tetris" || tSpin === "normal") intensity = 14;
    else if (hasClear || hasTSpin) intensity = 7;
    if (intensity > 0) {
      setShake({ token: tokenRef.current, intensity, durationMs: intensity >= 14 ? 420 : 260 });
    }
  }, [lastScoreEvent]);

  const dismissPopup = useCallback((id: number) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { shake, popups, dismissPopup };
}
