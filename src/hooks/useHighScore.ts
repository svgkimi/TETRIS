/**
 * useHighScore.ts
 * -----------------------------------------------------------------------
 * 하이스코어를 LocalStorage에 저장/조회하는 훅. 게임 엔진과 무관한 영속성 레이어.
 */

import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "modern-tetris:high-score";

/** LocalStorage에서 저장된 하이스코어를 읽어온다. 없거나 잘못된 값이면 0을 반환한다 */
function readStoredHighScore(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/** useHighScore 훅의 반환 타입 */
export interface UseHighScoreResult {
  readonly highScore: number;
  /** 이번 판의 최종 점수를 제출한다. 기존 최고기록을 넘었으면 갱신하고 true를 반환한다 */
  readonly submitScore: (score: number) => boolean;
}

/**
 * 하이스코어 상태 훅.
 * 입력: 없음 / 출력: { highScore(현재 최고 점수), submitScore(점수 제출 함수) }
 */
export function useHighScore(): UseHighScoreResult {
  const [highScore, setHighScore] = useState<number>(readStoredHighScore);
  // 최신 highScore 값을 동기적으로 비교하기 위한 ref (setState 콜백의 비동기 실행 타이밍에 의존하지 않기 위함)
  const highScoreRef = useRef<number>(highScore);
  highScoreRef.current = highScore;

  const submitScore = useCallback((score: number): boolean => {
    if (score <= highScoreRef.current) return false;
    highScoreRef.current = score;
    setHighScore(score);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(score));
    } catch {
      // LocalStorage 접근 불가 환경(프라이빗 모드 등)에서는 조용히 무시한다
    }
    return true;
  }, []);

  return { highScore, submitScore };
}
