/**
 * EffectPopups.tsx
 * -----------------------------------------------------------------------
 * 콤보/테트리스/T-Spin/레벨업 발생 시 필드 위에 떠오르는 텍스트 팝업 오버레이.
 * useEffects 훅이 생성한 EffectPopup 목록을 그대로 렌더링만 하는 순수 표현 컴포넌트.
 */

import { memo } from "react";
import type { EffectPopup } from "../../hooks/useEffects";

/** EffectPopups props */
export interface EffectPopupsProps {
  readonly popups: readonly EffectPopup[];
}

/** 팝업 tone별 텍스트 색상/크기 클래스 */
const TONE_CLASSES: Record<EffectPopup["tone"], string> = {
  combo: "text-amber-300 text-xl",
  tetris: "text-yellow-300 text-4xl drop-shadow-[0_0_12px_rgba(253,224,71,0.8)]",
  tspin: "text-fuchsia-300 text-3xl drop-shadow-[0_0_10px_rgba(232,121,249,0.7)]",
  levelup: "text-emerald-300 text-2xl",
  clear: "text-sky-200 text-2xl",
};

/**
 * 이펙트 텍스트 팝업들을 화면 중앙 상단부에 겹쳐 렌더링한다.
 * 입력: popups(현재 표시 중인 팝업 목록) / 출력: JSX
 */
function EffectPopupsComponent({ popups }: EffectPopupsProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-1">
      {popups.map((popup) => (
        <div
          key={popup.id}
          className={`animate-popup-rise font-extrabold italic tracking-wide ${TONE_CLASSES[popup.tone]}`}
        >
          {popup.title}
          {popup.subtitle && <span className="ml-2 text-sm not-italic opacity-80">{popup.subtitle}</span>}
        </div>
      ))}
    </div>
  );
}

/** popups 배열 참조가 바뀔 때만 재렌더링 */
export const EffectPopups = memo(EffectPopupsComponent);
