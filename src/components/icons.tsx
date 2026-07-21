/**
 * icons.tsx
 * -----------------------------------------------------------------------
 * 게임 전반의 다크+네온 톤과 어울리는 얇은 선(stroke) 스타일의 인라인 SVG 아이콘 모음.
 * 이모지(🔊/⚙ 등)는 플랫폼마다 색이 다르게 렌더링되어 UI 톤과 어긋나므로,
 * currentColor를 쓰는 SVG로 대체해 버튼의 text-* 색상 클래스를 그대로 물려받게 한다.
 */

/** 공통 아이콘 props: 크기와 추가 className */
interface IconProps {
  readonly className?: string;
}

/** 스피커(소리 켜짐) 아이콘 */
export function SpeakerOnIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d="M16.2 8.3a5 5 0 0 1 0 7.4M18.6 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 스피커(음소거) 아이콘 */
export function SpeakerOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M16.5 9.5 21 14M21 9.5l-4.5 4.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** 톱니(설정) 아이콘 */
export function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx={12} cy={12} r={3} stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 음표(배경음악) 아이콘 */
export function MusicNoteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 17.5a2.5 2.5 0 1 1-1-2M18 15.5a2.5 2.5 0 1 1-1-2M9 15.5V5.5l9-1.5v9"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
