import { GameRoom } from './game.ts';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string;
  method: string;
  params?: Record<string, unknown>;
};

const rooms = new Map<string, GameRoom>();
let waitingRoomId: string | undefined;

export function handlePlayerSocket(socket: WebSocket) {
  socket.addEventListener('message', (event) => {
    try {
      const request = JSON.parse(String(event.data)) as JsonRpcRequest;
      const result = dispatch(socket, request);
      if (request.id) socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown server error.';
      socket.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message } }));
    }
  });
}

function dispatch(socket: WebSocket, request: JsonRpcRequest) {
  const params = request.params ?? {};

  switch (request.method) {
    case 'match.find': {
      const room = findOrCreateWaitingRoom();
      return room.join(String(params.playerId), String(params.name ?? 'Traveler'), socket);
    }
    case 'match.reset': {
      rooms.clear();
      waitingRoomId = undefined;
      return { roomId: 'reset', phase: 'lobby', day: 1, pickIndex: 0, maxPlayers: 4, players: [], log: [] };
    }
    case 'room.create': {
      const roomId = String(params.roomId ?? `room-${Math.random().toString(16).slice(2, 8)}`);
      const room = new GameRoom(roomId);
      rooms.set(roomId, room);
      waitingRoomId = roomId;
      return room.join(String(params.playerId), String(params.name ?? 'Host'), socket);
    }
    case 'room.join': {
      const roomId = String(params.roomId);
      const room = getRoom(roomId);
      return room.join(String(params.playerId), String(params.name ?? 'Player'), socket);
    }
    case 'room.start': {
      const room = getRoom(String(params.roomId));
      return room.start(String(params.playerId));
    }
    case 'room.addBot': {
      const room = getRoom(String(params.roomId));
      return room.addBot();
    }
    case 'room.reset': {
      const room = getRoom(String(params.roomId));
      return room.reset();
    }
    case 'player.placeCard': {
      const room = getRoom(String(params.roomId));
      return room.placeCard(String(params.playerId), String(params.cardId), params.gridPosition as never);
    }
    case 'player.pickCard': {
      const room = getRoom(String(params.roomId));
      return room.pickCard(String(params.playerId), String(params.cardId));
    }
    case 'player.discardDraftCard': {
      const room = getRoom(String(params.roomId));
      return room.discardDraftCard(String(params.playerId), String(params.cardId));
    }
    case 'player.skipSlot': {
      const room = getRoom(String(params.roomId));
      return room.skipSlot(String(params.playerId), params.gridPosition as never);
    }
    case 'player.endPlanning': {
      const room = getRoom(String(params.roomId));
      return room.endPlanning(String(params.playerId));
    }
    default:
      throw new Error(`Unsupported JSON-RPC method: ${request.method}`);
  }
}

function getRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Room ${roomId} does not exist.`);
  return room;
}

function findOrCreateWaitingRoom() {
  const waitingRoom = waitingRoomId ? rooms.get(waitingRoomId) : undefined;
  if (waitingRoom && waitingRoom.snapshot.phase === 'lobby' && waitingRoom.snapshot.players.length < 4) {
    return waitingRoom;
  }

  const roomId = `TRIP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const room = new GameRoom(roomId);
  rooms.set(roomId, room);
  waitingRoomId = roomId;
  return room;
}
