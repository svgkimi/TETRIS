/**
 * MultiplayerApp.tsx
 * -----------------------------------------------------------------------
 * 대전 모드의 최상위 컨테이너. useMultiplayer(네트워킹 훅) 인스턴스를 하나만 소유하고,
 * 연결 상태(status)에 따라 로비 화면(LobbyScreen) 또는 대전 화면(BattleScreen)을 보여준다.
 * - status가 "in_match"이고 matchSeed가 있으면 BattleScreen으로 전환한다.
 * - status가 "joined"가 되면(상대 입장 완료) 자동으로 sendReady()를 호출해 매치 시작을 준비한다.
 * 이 컴포넌트는 화면 전환/네트워킹 배선만 담당하며, 실제 게임 로직은 BattleScreen -> useGameEngine
 * (src/engine)에, 네트워킹은 useMultiplayer에 위임한다 (관심사 분리).
 */

import { useEffect, useRef } from "react";
import { useMultiplayer } from "../../hooks/useMultiplayer";
import { LobbyScreen } from "./LobbyScreen";
import { BattleScreen } from "./BattleScreen";

/** MultiplayerApp props */
export interface MultiplayerAppProps {
  /** 대전 모드를 완전히 벗어나 싱글플레이 타이틀로 돌아가기 */
  readonly onExit: () => void;
}

/**
 * 대전 모드 전체 흐름(로비 -> 매치)을 조립한다.
 * 입력: onExit(메인으로 돌아가기 콜백) / 출력: JSX
 */
export function MultiplayerApp({ onExit }: MultiplayerAppProps) {
  const network = useMultiplayer();
  const { status, roomCode, errorMessage, matchSeed, createRoom, joinRoom, sendReady, disconnect } = network;

  // 상대가 방에 들어와 status가 "joined"가 되면(호스트/게스트 공통) 자동으로 준비 완료를 알린다.
  // 두 번 이상 보내도 서버는 멱등적으로 처리하지만(hostReady/guestReady 플래그 재설정), 매치당 1회만 보내면 충분하다.
  const sentReadyRef = useRef(false);
  useEffect(() => {
    if (status === "joined" && !sentReadyRef.current) {
      sentReadyRef.current = true;
      sendReady();
    }
    if (status === "waiting_for_opponent" || status === "idle" || status === "connecting") {
      sentReadyRef.current = false;
    }
  }, [status, sendReady]);

  /** 대전 모드를 완전히 나간다: 소켓 연결을 끊고 상위(싱글플레이 타이틀)로 복귀한다 */
  const handleExit = () => {
    disconnect();
    onExit();
  };

  // 한 번 매치가 시작되면(matchSeed 확보) 이후 상대가 나가거나(opponent_left) 연결 오류가 나도
  // BattleScreen 쪽에서 그 상태를 직접 안내(오버레이)하므로, 로비로 되돌아가지 않고 계속 BattleScreen을 보여준다.
  const inMatch = matchSeed !== null;

  if (inMatch) {
    return <BattleScreen matchSeed={matchSeed} network={network} onExit={handleExit} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0f] p-4">
      <LobbyScreen
        status={status}
        roomCode={roomCode}
        errorMessage={errorMessage}
        createRoom={createRoom}
        joinRoom={joinRoom}
        onExit={handleExit}
      />
    </div>
  );
}
