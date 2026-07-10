/**
 * App.tsx
 * -----------------------------------------------------------------------
 * 최상위 진입 컴포넌트. "싱글플레이"와 "대전(1:1 versus)" 두 모드를 라우팅만 한다.
 * - 싱글플레이 화면 흐름(타이틀 -> 카운트다운 -> 플레이 -> 일시정지/게임오버)은 전부
 *   SinglePlayerApp.tsx로 이동되어 있으며, 이 파일의 변경과 무관하게 동일하게 동작한다.
 * - 대전 모드는 MultiplayerApp.tsx가 담당한다 (로비 -> 매치 -> 결과).
 * 두 모드는 완전히 분리된 컴포넌트 트리이므로, 대전 모드의 useMultiplayer/useGameEngine 인스턴스는
 * 싱글플레이 쪽 훅과 전혀 상태를 공유하지 않는다 (관심사 분리).
 */

import { useCallback, useState } from "react";
import SinglePlayerApp from "./components/SinglePlayerApp";
import { MultiplayerApp } from "./components/multiplayer/MultiplayerApp";

/** 최상위 모드: 싱글플레이 또는 대전 */
type AppMode = "single" | "multiplayer";

function App() {
  const [mode, setMode] = useState<AppMode>("single");

  const handleOpenMultiplayer = useCallback(() => setMode("multiplayer"), []);
  const handleExitMultiplayer = useCallback(() => setMode("single"), []);

  if (mode === "multiplayer") {
    return <MultiplayerApp onExit={handleExitMultiplayer} />;
  }

  return <SinglePlayerApp onOpenMultiplayer={handleOpenMultiplayer} />;
}

export default App;
