/**
 * useIsMobile.ts
 * -----------------------------------------------------------------------
 * 터치 기반 모바일 환경 여부를 판단하는 훅.
 * 데스크톱(마우스/키보드) 사용자 경험은 절대 건드리지 않기 위해, 아래 두 조건을
 * "모두" 만족할 때만 모바일로 간주한다 (조건 하나만으로는 오탐이 잦다):
 *   1) 포인터가 coarse(터치)다 -- `(pointer: coarse)` 미디어쿼리
 *   2) 뷰포트 폭이 768px 미만이다 -- 터치스크린 노트북/태블릿 큰 화면은 데스크톱 레이아웃 유지
 *
 * 입력: 없음 / 출력: boolean (모바일이면 true)
 */

import { useEffect, useState } from "react";

/** 모바일로 취급하는 뷰포트 폭 상한(px). 이 값 미만이면서 터치 포인터일 때만 모바일 UI를 노출한다 */
const MOBILE_MAX_WIDTH = 768;

/** 현재 환경이 모바일(터치 + 좁은 화면)인지 판별한다. 입력: 없음 / 출력: boolean */
function computeIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  const hasCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? "ontouchstart" in window;
  const isNarrow = window.innerWidth < MOBILE_MAX_WIDTH;
  return hasCoarsePointer && isNarrow;
}

/** 모바일(터치 + 좁은 화면) 여부를 반환하고, 리사이즈/회전 시 갱신하는 훅 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => computeIsMobile());

  useEffect(() => {
    const update = () => setIsMobile(computeIsMobile());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const pointerQuery = window.matchMedia?.("(pointer: coarse)");
    pointerQuery?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      pointerQuery?.removeEventListener?.("change", update);
    };
  }, []);

  return isMobile;
}
