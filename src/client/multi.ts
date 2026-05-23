import type { GridPosition, RoomSnapshot } from '../shared/game/types';

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: TParams;
};

export type JsonRpcResponse<TResult = unknown> = {
  jsonrpc: '2.0';
  id?: string;
  result?: TResult;
  error?: { code: number; message: string };
  method?: string;
  params?: TResult;
};

type SnapshotListener = (snapshot: RoomSnapshot) => void;
type StatusListener = (status: string) => void;
type ErrorListener = (message: string) => void;

export class MultiplayerClient {
  private socket?: WebSocket;
  private listeners = new Set<SnapshotListener>();
  private statusListeners = new Set<StatusListener>();
  private errorListeners = new Set<ErrorListener>();
  private pending: JsonRpcRequest[] = [];
  private sequence = 0;

  connect(url = websocketUrl()) {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;

    this.emitStatus('connecting');
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => {
      this.emitStatus('connected');
      this.flushPending();
    });
    this.socket.addEventListener('close', () => this.emitStatus('offline'));
    this.socket.addEventListener('error', () => this.emitStatus('error'));
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  onSnapshot(listener: SnapshotListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  createRoom(playerId: string, name: string, roomId?: string) {
    this.send('room.create', { roomId, playerId, name });
  }

  joinRoom(roomId: string, playerId: string, name: string) {
    this.send('room.join', { roomId, playerId, name });
  }

  startGame(roomId: string, playerId: string) {
    this.send('room.start', { roomId, playerId });
  }

  addBot(roomId: string) {
    this.send('room.addBot', { roomId });
  }

  resetRoom(roomId: string) {
    this.send('room.reset', { roomId });
  }

  findMatch(playerId: string, name: string) {
    this.send('match.find', { playerId, name });
  }

  resetMatchmaking() {
    this.send('match.reset', {});
  }

  placeCard(roomId: string, playerId: string, cardId: string, gridPosition: GridPosition) {
    this.send('player.placeCard', {
      roomId,
      playerId,
      cardId,
      gridPosition,
      timestamp: Date.now(),
    });
  }

  pickCard(roomId: string, playerId: string, cardId: string) {
    this.send('player.pickCard', { roomId, playerId, cardId, timestamp: Date.now() });
  }

  discardDraftCard(roomId: string, playerId: string, cardId: string) {
    this.send('player.discardDraftCard', { roomId, playerId, cardId, timestamp: Date.now() });
  }

  skipSlot(roomId: string, playerId: string, gridPosition: GridPosition) {
    this.send('player.skipSlot', { roomId, playerId, gridPosition, timestamp: Date.now() });
  }

  endPlanning(roomId: string, playerId: string) {
    this.send('player.endPlanning', { roomId, playerId, timestamp: Date.now() });
  }

  private send(method: string, params: unknown) {
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: `rpc-${Date.now()}-${this.sequence++}`,
      method,
      params,
    };

    if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
      this.pending.push(message);
      this.connect();
      return;
    }

    if (this.socket.readyState === WebSocket.CONNECTING) {
      this.pending.push(message);
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: string) {
    const message = JSON.parse(data) as JsonRpcResponse<RoomSnapshot>;
    if (message.error) {
      this.errorListeners.forEach((listener) => listener(message.error?.message ?? 'Server error'));
      return;
    }
    if (message.method === 'room.snapshot' && message.params) {
      this.listeners.forEach((listener) => listener(message.params as RoomSnapshot));
    }
    if (message.result && isRoomSnapshot(message.result)) {
      this.listeners.forEach((listener) => listener(message.result as RoomSnapshot));
    }
  }

  private emitStatus(status: string) {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private flushPending() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const messages = [...this.pending];
    this.pending = [];
    messages.forEach((message) => this.socket?.send(JSON.stringify(message)));
  }
}

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8787/ws`;
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return Boolean(value && typeof value === 'object' && 'roomId' in value && 'players' in value);
}
