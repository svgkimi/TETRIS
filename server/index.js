/**
 * server/index.js
 * -----------------------------------------------------------------------
 * Modern Tetris 대전(1:1 배틀) 모드를 위한 최소 WebSocket 릴레이 서버.
 * 방 생성/입장 관리와 공격 라인/보드 요약 메시지 중계, 매치 시작 시드 배포만 담당하며
 * 게임 규칙(가비지 라인 계산, 충돌판정 등)은 전혀 알지 못한다 — 그건 클라이언트의
 * src/engine이 담당한다 (관심사 분리).
 *
 * 실행: `npm run server` (기본 포트 8787, PORT 환경변수로 변경 가능)
 *
 * ── 프로토콜 (JSON 텍스트 메시지, 항상 { type, ...payload } 형태) ──────────────
 *
 * Client -> Server
 *   { type: "create_room" }
 *   { type: "join_room", roomCode }
 *   { type: "ready" }                 // 카운트다운 완료, 플레이 준비됨
 *   { type: "attack", lines }         // 상대에게 보낼 공격(가비지) 라인 수
 *   { type: "board_sync", summary }   // 상대방 미리보기 렌더링용 가벼운 보드 요약 (형식은 클라이언트가 정의)
 *   { type: "top_out" }               // 내가 게임오버됨 (상대방 승리 처리용)
 *
 * Server -> Client
 *   { type: "room_created", roomCode }
 *   { type: "join_ok", roomCode }
 *   { type: "join_error", reason }
 *   { type: "opponent_joined" }
 *   { type: "match_start", seed }     // 양쪽 다 ready되면 동일 시드로 동시에 전송 (같은 피스 시퀀스 보장)
 *   { type: "opponent_attack", lines }
 *   { type: "opponent_board_sync", summary }
 *   { type: "opponent_top_out" }
 *   { type: "opponent_left" }
 *   { type: "error", message }
 */
import { WebSocketServer } from "ws";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
/** 방 코드에 쓰는 문자 집합. 혼동되기 쉬운 0/O, 1/I는 제외한다 */
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;

/**
 * 방 하나의 상태.
 * @typedef {{ host: import("ws").WebSocket, guest: import("ws").WebSocket | null, hostReady: boolean, guestReady: boolean }} Room
 * @type {Map<string, Room>}
 */
const rooms = new Map();

/** 기존 방과 겹치지 않는 랜덤 방 코드를 생성한다. 입력: 없음 / 출력: 방 코드 문자열 */
function generateRoomCode() {
  let code;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

/** 소켓이 열려 있으면 JSON 메시지를 전송한다. 입력: ws, message(객체) / 출력: 없음 */
function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** 방에서 주어진 소켓의 상대방 소켓을 반환한다. 입력: room, ws / 출력: 상대 소켓 또는 null */
function otherSocket(room, ws) {
  return room.host === ws ? room.guest : room.host;
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.roomCode = null;
  ws.role = null; // "host" | "guest"

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "잘못된 메시지 형식입니다" });
      return;
    }

    switch (message.type) {
      case "create_room": {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { host: ws, guest: null, hostReady: false, guestReady: false });
        ws.roomCode = roomCode;
        ws.role = "host";
        send(ws, { type: "room_created", roomCode });
        break;
      }

      case "join_room": {
        const room = rooms.get(message.roomCode);
        if (!room) {
          send(ws, { type: "join_error", reason: "존재하지 않는 방입니다" });
          return;
        }
        if (room.guest) {
          send(ws, { type: "join_error", reason: "이미 인원이 가득 찬 방입니다" });
          return;
        }
        room.guest = ws;
        ws.roomCode = message.roomCode;
        ws.role = "guest";
        send(ws, { type: "join_ok", roomCode: message.roomCode });
        send(room.host, { type: "opponent_joined" });
        break;
      }

      case "ready": {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        if (ws.role === "host") room.hostReady = true;
        if (ws.role === "guest") room.guestReady = true;
        if (room.hostReady && room.guestReady && room.host && room.guest) {
          const seed = Math.floor(Math.random() * 2 ** 31);
          send(room.host, { type: "match_start", seed });
          send(room.guest, { type: "match_start", seed });
          room.hostReady = false;
          room.guestReady = false;
        }
        break;
      }

      case "attack": {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        send(otherSocket(room, ws), { type: "opponent_attack", lines: message.lines });
        break;
      }

      case "board_sync": {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        send(otherSocket(room, ws), { type: "opponent_board_sync", summary: message.summary });
        break;
      }

      case "top_out": {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        send(otherSocket(room, ws), { type: "opponent_top_out" });
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    send(otherSocket(room, ws), { type: "opponent_left" });
    rooms.delete(ws.roomCode);
  });
});

console.log(`[tetris-battle-server] listening on ws://localhost:${PORT}`);
