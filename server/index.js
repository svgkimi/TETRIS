/**
 * server/index.js
 * -----------------------------------------------------------------------
 * Modern Tetris 대전(1:1 배틀) 모드를 위한 WebSocket 릴레이 서버 (v2).
 * 방 목록/이름/선택적 입장 코드/빈 방 5분 TTL/재대결/모드(공격전·스코어전)를 관리하고
 * 공격 라인/보드 요약 메시지를 중계한다. 게임 규칙(가비지 계산, 충돌판정 등)은 전혀
 * 알지 못한다 — 그건 클라이언트의 src/engine이 담당한다 (관심사 분리).
 *
 * 실행: `npm run server` (기본 포트 8787, PORT 환경변수로 변경 가능)
 *
 * ── 프로토콜 (JSON 텍스트 메시지, 항상 { type, ...payload } 형태) ──────────────
 *
 * Client -> Server
 *   { type: "list_rooms" }                          // 공개 방 목록 요청
 *   { type: "create_room", name?, code?, mode? }    // name: 방 이름(없으면 TETRISWORLD(n)),
 *                                                   // code: 선택 입장 코드(없으면 누구나 입장),
 *                                                   // mode: "attack"(기본) | "score"
 *   { type: "join_room", roomId, code? }            // 방 목록의 roomId로 입장 (코드 방이면 code 필수)
 *   { type: "ready" }                               // 준비 완료. 양쪽 다 ready면 match_start (재대결도 동일)
 *   { type: "attack", lines }                       // 공격전 전용: 상대에게 보낼 가비지 라인 수
 *   { type: "board_sync", summary }                 // 상대 미리보기용 보드 요약 (opaque)
 *   { type: "top_out", score? }                     // 내 게임오버 통지 (score: 스코어전 비교용)
 *   { type: "leave_room" }                          // 방에서 나가기 (연결은 유지)
 *
 * Server -> Client
 *   { type: "room_list", rooms: [{ roomId, name, hasCode, mode, playerCount }] }
 *   { type: "room_created", roomId, name, mode, hasCode }
 *   { type: "join_ok", roomId, name, mode }
 *   { type: "join_error", reason }
 *   { type: "opponent_joined" }
 *   { type: "match_start", seed, mode }             // 각 플레이어에게 서로 다른 seed 전송 (랜덤 블록)
 *   { type: "opponent_attack", lines }
 *   { type: "opponent_board_sync", summary }
 *   { type: "opponent_top_out", score? }
 *   { type: "opponent_left" }
 *   { type: "error", message }
 */
import { WebSocketServer } from "ws";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
/** 빈 방이 삭제되기까지의 유예 시간(ms) — 5분 */
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

/**
 * 방 하나의 상태.
 * @typedef {{
 *   roomId: string,
 *   name: string,
 *   code: string | null,
 *   mode: "attack" | "score",
 *   players: import("ws").WebSocket[],
 *   readySet: Set<import("ws").WebSocket>,
 *   emptyTimer: NodeJS.Timeout | null,
 * }} Room
 * @type {Map<string, Room>}
 */
const rooms = new Map();

/** 방 id 발급용 카운터 및 기본 이름(TETRISWORLD(n)) 카운터 */
let nextRoomSeq = 1;
let defaultNameSeq = 1;

/** 소켓이 열려 있으면 JSON 메시지를 전송한다. 입력: ws, message(객체) / 출력: 없음 */
function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** 방에서 주어진 소켓의 상대방 소켓을 반환한다. 입력: room, ws / 출력: 상대 소켓 또는 undefined */
function otherSocket(room, ws) {
  return room.players.find((p) => p !== ws);
}

/** 방 목록 브로드캐스트용 요약을 만든다. 입력: 없음 / 출력: room_list payload의 rooms 배열 */
function roomListSnapshot() {
  return [...rooms.values()].map((room) => ({
    roomId: room.roomId,
    name: room.name,
    hasCode: room.code !== null,
    mode: room.mode,
    playerCount: room.players.length,
  }));
}

/** 빈 방 삭제 타이머를 (재)설정한다. 방에 사람이 있으면 타이머를 해제한다. */
function updateEmptyTimer(room) {
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  if (room.players.length === 0) {
    room.emptyTimer = setTimeout(() => rooms.delete(room.roomId), EMPTY_ROOM_TTL_MS);
  }
}

/** ws를 소속 방에서 제거하고 상대에게 opponent_left를 알린다. 방이 비면 5분 TTL을 건다. */
function leaveRoom(ws) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  ws.roomId = null;
  if (!room) return;
  const opponent = otherSocket(room, ws);
  room.players = room.players.filter((p) => p !== ws);
  room.readySet.delete(ws);
  room.readySet.clear(); // 인원이 바뀌면 준비 상태는 무효
  send(opponent, { type: "opponent_left" });
  updateEmptyTimer(room);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.roomId = null;

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "잘못된 메시지 형식입니다" });
      return;
    }

    switch (message.type) {
      case "list_rooms": {
        send(ws, { type: "room_list", rooms: roomListSnapshot() });
        break;
      }

      case "create_room": {
        leaveRoom(ws);
        const roomId = `R${nextRoomSeq++}`;
        const rawName = typeof message.name === "string" ? message.name.trim().slice(0, 24) : "";
        const name = rawName || `TETRISWORLD(${defaultNameSeq++})`;
        const rawCode = typeof message.code === "string" ? message.code.trim().toUpperCase().slice(0, 8) : "";
        const code = rawCode || null;
        const mode = message.mode === "score" ? "score" : "attack";
        const room = { roomId, name, code, mode, players: [ws], readySet: new Set(), emptyTimer: null };
        rooms.set(roomId, room);
        ws.roomId = roomId;
        send(ws, { type: "room_created", roomId, name, mode, hasCode: code !== null });
        break;
      }

      case "join_room": {
        const room = rooms.get(message.roomId);
        if (!room) {
          send(ws, { type: "join_error", reason: "존재하지 않는 방입니다" });
          return;
        }
        if (room.players.length >= 2) {
          send(ws, { type: "join_error", reason: "이미 인원이 가득 찬 방입니다" });
          return;
        }
        if (room.code !== null) {
          const given = typeof message.code === "string" ? message.code.trim().toUpperCase() : "";
          if (given !== room.code) {
            send(ws, { type: "join_error", reason: "입장 코드가 일치하지 않습니다" });
            return;
          }
        }
        leaveRoom(ws);
        room.players.push(ws);
        ws.roomId = room.roomId;
        updateEmptyTimer(room);
        send(ws, { type: "join_ok", roomId: room.roomId, name: room.name, mode: room.mode });
        send(otherSocket(room, ws), { type: "opponent_joined" });
        break;
      }

      case "ready": {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        room.readySet.add(ws);
        // 양쪽 모두 준비되면 매치 시작. 각자 서로 다른 시드를 받아 블록 시퀀스가 달라진다(랜덤 블록).
        if (room.players.length === 2 && room.players.every((p) => room.readySet.has(p))) {
          room.readySet.clear();
          for (const player of room.players) {
            send(player, { type: "match_start", seed: Math.floor(Math.random() * 2 ** 31), mode: room.mode });
          }
        }
        break;
      }

      case "attack": {
        const room = rooms.get(ws.roomId);
        if (!room || room.mode !== "attack") return; // 스코어전에서는 공격 무시
        send(otherSocket(room, ws), { type: "opponent_attack", lines: message.lines });
        break;
      }

      case "board_sync": {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        send(otherSocket(room, ws), { type: "opponent_board_sync", summary: message.summary });
        break;
      }

      case "top_out": {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        send(otherSocket(room, ws), { type: "opponent_top_out", score: message.score });
        break;
      }

      case "leave_room": {
        leaveRoom(ws);
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => leaveRoom(ws));
});

console.log(`[tetris-battle-server] listening on ws://localhost:${PORT}`);
