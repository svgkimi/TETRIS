## 프로그램 개요

화려한 이펙트와 부드러운 조작감을 가진 웹 기반 최신 테트리스 게임 (Modern Tetris)

## 기술 스택

• 프론트엔드: React + TypeScript (Vite 환경)
• 렌더링: HTML5 Canvas API (또는 최적화된 CSS Grid)
• 스타일링: Tailwind CSS (또는 Vanilla CSS)

## 핵심 개발 규칙 (바이브 코딩 방지)

1. 관심사 분리(Separation of Concerns): 게임 코어 엔진 로직(블록 회전, 충돌 판정, 줄 삭제)과 UI 렌더링 로직을 완벽히 분리해서 작성할 것.
2. 상태 관리 최적화: React의 불필요한 리렌더링을 막기 위해 상태(State) 업데이트를 최소화하고 60FPS 방어할 것.
3. 타입 안정성: 모든 Tetrimino(테트리스 블록)의 형태, 좌표, 게임 상태(Play, Pause, Game Over)를 정확한 TypeScript interface/type으로 정의할 것.

## 커밋 및 코드 작성 규칙

• 커밋 메세지는 한글로 작성 (예: "feat: SRS(슈퍼 로테이션 시스템) 회전 로직 추가")
• 모든 주요 함수에는 주석으로 역할과 입력/출력 타입을 명시할 것.
