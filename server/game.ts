import cardsBundle from '../src/data/cards_bundle.json' with { type: 'json' };
import {
  TIME_SLOTS,
  createBoard,
  lockBoardSlot,
  placeCardOnBoard,
  skipBoardSlot,
  validateGridPlacement,
} from '../src/shared/game/board.ts';
import { drawDailyHand } from '../src/shared/game/dice.ts';
import {
  STARTING_RESOURCES,
  applyOnPlayEffects,
  gainRestResources,
  passHandsClockwise,
  payDraftCost,
  validateCardUsage,
} from '../src/shared/game/rules.ts';
import { boardToTimeline, calculateScore } from '../src/shared/game/score.ts';
import type { BoardCell, GridPosition, PlayerState, RoomSnapshot, TravelCard } from '../src/shared/game/types.ts';

const cards = cardsBundle as TravelCard[];
const MAX_PLAYERS = 4;
const LAST_DAY = 5;
const PICKS_PER_DAY = 3;

export class GameRoom {
  snapshot: RoomSnapshot;
  private sockets = new Map<string, WebSocket>();
  private startTimer?: number;

  constructor(roomId: string) {
    this.snapshot = {
      roomId,
      phase: 'lobby',
      day: 1,
      pickIndex: 0,
      maxPlayers: MAX_PLAYERS,
      players: [],
      log: ['Room created. Waiting for players.'],
    };
  }

  join(playerId: string, name: string, socket: WebSocket) {
    if (this.snapshot.players.length >= MAX_PLAYERS && !this.snapshot.players.some((player) => player.playerId === playerId)) {
      throw new Error('Room is full.');
    }

    this.sockets.set(playerId, socket);
    if (!this.snapshot.players.some((player) => player.playerId === playerId)) {
      this.snapshot.players.push(createPlayer(playerId, name, this.snapshot.players.length));
      this.snapshot.log.push(`${name} joined the room.`);
    }
    this.scheduleAutoStart();
    this.broadcast();
    return this.snapshot;
  }

  start(playerId?: string) {
    if (playerId) this.requirePlayer(playerId);
    if (this.snapshot.players.length < 2 || this.snapshot.players.length > MAX_PLAYERS) {
      throw new Error('Start requires 2-4 connected players or bots.');
    }
    if (this.snapshot.phase !== 'lobby') return this.snapshot;
    if (this.startTimer) clearTimeout(this.startTimer);
    this.snapshot.phase = 'draft';
    this.snapshot.day = 1;
    this.snapshot.pickIndex = 0;
    this.snapshot.players = this.snapshot.players.map((player, index) => ({
      ...player,
      hand: drawDailyHand(cards, 1, index),
      chosen: [],
      storage: [],
      draftChoice: undefined,
      ready: false,
    }));
    this.snapshot.log.push('Day 1 draft started. Each traveler received 5 cards.');
    this.broadcast();
    return this.snapshot;
  }

  addBot() {
    if (this.snapshot.players.length >= MAX_PLAYERS) throw new Error('Room already has 4 players.');
    if (this.snapshot.phase !== 'lobby') throw new Error('Bots can only be added in the lobby.');

    const botNumber = this.snapshot.players.filter((player) => player.playerId.startsWith('bot-')).length + 1;
    this.snapshot.players.push(createPlayer(`bot-${Date.now()}-${botNumber}`, `Bot ${botNumber}`, this.snapshot.players.length));
    this.snapshot.log.push(`Bot ${botNumber} joined for local room testing.`);
    this.scheduleAutoStart();
    this.broadcast();
    return this.snapshot;
  }

  reset() {
    const roomId = this.snapshot.roomId;
    const players = this.snapshot.players.map((player, index) => createPlayer(player.playerId, player.name, index));
    this.snapshot = {
      roomId,
      phase: 'lobby',
      day: 1,
      pickIndex: 0,
      maxPlayers: MAX_PLAYERS,
      players,
      log: ['Room reset. Players kept in lobby.'],
    };
    this.broadcast();
    return this.snapshot;
  }

  pickCard(playerId: string, cardId: string) {
    const playerIndex = this.findPlayerIndex(playerId);
    if (this.snapshot.phase !== 'draft') throw new Error('Cards can only be picked during draft.');

    const player = this.snapshot.players[playerIndex];
    if (player.ready) throw new Error('You already chose for this draft pick.');
    if (!player.hand.includes(cardId)) throw new Error('Card is not in your draft hand.');

    const card = this.requireCard(cardId);

    this.snapshot.players[playerIndex] = {
      ...player,
      draftChoice: { cardId, mode: 'store' },
      ready: true,
    };

    this.snapshot.log.push(`${player.name} chose ${card.name}. Waiting for all travelers.`);

    this.advanceDraftIfReady();
    this.broadcast();
    return this.snapshot;
  }

  discardDraftCard(playerId: string, cardId: string) {
    const playerIndex = this.findPlayerIndex(playerId);
    if (this.snapshot.phase !== 'draft') throw new Error('Cards can only be discarded during draft.');

    const player = this.snapshot.players[playerIndex];
    if (player.ready) throw new Error('You already chose for this draft pick.');
    if (!player.hand.includes(cardId)) throw new Error('Card is not in your draft hand.');

    const restSlot = TIME_SLOTS[this.snapshot.pickIndex];
    this.snapshot.players[playerIndex] = {
      ...player,
      draftChoice: { cardId, mode: 'rest' },
      ready: true,
    };

    this.snapshot.log.push(`${player.name} chose to rest during ${restSlot}. Waiting for all travelers.`);
    this.advanceDraftIfReady();
    this.broadcast();
    return this.snapshot;
  }

  placeCard(playerId: string, cardId: string, gridPosition: GridPosition) {
    const playerIndex = this.findPlayerIndex(playerId);
    if (this.snapshot.phase !== 'placement') throw new Error('Cards can only be placed during planning.');

    const player = this.snapshot.players[playerIndex];
    if (player.ready) throw new Error('Your plan for this day is already locked.');

    const card = this.requireCard(cardId);
    const placement = validateGridPlacement(player.board, gridPosition, this.snapshot.day);
    const usage = validateCardUsage(player, card);
    if (!placement.ok || !usage.ok) throw new Error(placement.reason ?? usage.reason ?? 'Invalid action.');

    this.snapshot.players[playerIndex] = {
      ...player,
      board: placeCardOnBoard(player.board, cardId, gridPosition),
      storage: player.storage.filter((id) => id !== cardId),
      chosen: [...player.chosen, cardId],
      resources: applyOnPlayEffects(player.resources, card),
    };

    this.snapshot.log.push(`${player.name} placed ${card.name} on day ${gridPosition.day} ${gridPosition.slot}.`);
    this.broadcast();
    return this.snapshot;
  }

  skipSlot(playerId: string, gridPosition: GridPosition) {
    const playerIndex = this.findPlayerIndex(playerId);
    if (this.snapshot.phase !== 'placement') throw new Error('Slots can only be skipped during planning.');

    const player = this.snapshot.players[playerIndex];
    if (player.ready) throw new Error('Your plan for this day is already locked.');
    const placement = validateGridPlacement(player.board, gridPosition, this.snapshot.day);
    if (!placement.ok) throw new Error(placement.reason ?? 'Invalid skip.');

    this.snapshot.players[playerIndex] = {
      ...player,
      board: skipBoardSlot(player.board, gridPosition),
      chosen: [...player.chosen, `skip-${gridPosition.day}-${gridPosition.slot}`],
    };
    this.snapshot.log.push(`${player.name} left day ${gridPosition.day} ${gridPosition.slot} as travel/rest time.`);
    this.broadcast();
    return this.snapshot;
  }

  endPlanning(playerId: string) {
    const playerIndex = this.findPlayerIndex(playerId);
    if (this.snapshot.phase !== 'placement') throw new Error('Planning is not active.');

    const player = this.snapshot.players[playerIndex];
    const openSlots = currentDayOpenSlots(player.board, this.snapshot.day);
    if (openSlots.length > 0) {
      throw new Error('Fill, skip, or rest every slot before ending the day.');
    }

    this.snapshot.players[playerIndex] = {
      ...player,
      ready: true,
    };

    this.advanceDayIfReady();
    this.broadcast();
    return this.snapshot;
  }

  broadcast() {
    const message = JSON.stringify({ jsonrpc: '2.0', method: 'room.snapshot', params: this.snapshot });
    for (const socket of this.sockets.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  private advanceDraftIfReady() {
    if (!this.snapshot.players.length || !this.snapshot.players.every((player) => player.ready)) return;

    this.resolveDraftChoices();
    this.snapshot.pickIndex += 1;

    if (this.snapshot.pickIndex < PICKS_PER_DAY) {
      this.snapshot.players = passHandsClockwise(this.snapshot.players).map((player) => ({
        ...player,
        draftChoice: undefined,
        ready: false,
      }));
      this.snapshot.log.push('Hands passed to the next traveler.');
      return;
    }

    this.snapshot.phase = 'placement';
    this.snapshot.players = this.snapshot.players.map((player) => ({
      ...player,
      hand: [],
      draftChoice: undefined,
      ready: false,
    }));
    this.snapshot.log.push(`Day ${this.snapshot.day} planning opened. Place stored cards onto morning, afternoon, and evening.`);
  }

  private advanceDayIfReady() {
    if (!this.snapshot.players.length || !this.snapshot.players.every((player) => player.ready)) return;

    this.snapshot.players = this.snapshot.players.map((player) => ({
      ...player,
      storage: [],
      chosen: [],
      draftChoice: undefined,
      ready: false,
    }));

    if (this.snapshot.day >= LAST_DAY) {
      this.finishGame();
      return;
    }

    this.snapshot.day += 1;
    this.snapshot.pickIndex = 0;
    this.snapshot.phase = 'draft';
    this.snapshot.players = this.snapshot.players.map((player, index) => ({
      ...player,
      hand: drawDailyHand(cards, this.snapshot.day, index + this.snapshot.day * 10),
      draftChoice: undefined,
    }));
    this.snapshot.log.push(`Day ${this.snapshot.day} draft started. New hands dealt.`);
  }

  private finishGame() {
    let winner: PlayerState | undefined;
    let winningScore = -Infinity;
    for (const player of this.snapshot.players) {
      const score = calculateScore(player.board, cards, player.resources).totalVp;
      if (score > winningScore) {
        winningScore = score;
        winner = player;
      }
    }

    this.snapshot.phase = 'finished';
    this.snapshot.winnerId = winner?.playerId;
    this.snapshot.timeline = winner ? boardToTimeline(winner.board, cards) : [];
    this.snapshot.log.push(`Match finished. Winner: ${winner?.name ?? 'none'} with ${winningScore} VP.`);
  }

  private resolveDraftChoices() {
    const pickSlot = TIME_SLOTS[this.snapshot.pickIndex];

    this.snapshot.players = this.snapshot.players.map((player, index) => {
      const choice = player.draftChoice;
      if (!choice || !player.hand.includes(choice.cardId)) return player;

      const hand = player.hand.filter((id) => id !== choice.cardId);
      if (choice.mode === 'rest') {
        return {
          ...player,
          board: skipBoardSlot(player.board, { day: this.snapshot.day, slot: pickSlot }),
          hand,
          chosen: [...player.chosen, `rest-${this.snapshot.day}-${pickSlot}`],
          resources: gainRestResources(player.resources),
        };
      }

      const card = this.requireCard(choice.cardId);
      const payment = payDraftCost(player.resources, card);
      const board = payment.exhausted ? lockRandomNextDaySlot(player.board, this.snapshot.day, index + this.snapshot.pickIndex) : player.board;

      if (payment.debtAdded > 0) {
        this.snapshot.log.push(`${player.name} borrowed ${payment.debtAdded} Xu to keep ${card.name}.`);
      }
      if (payment.exhausted) {
        this.snapshot.log.push(`${player.name} overexerted. A future slot was locked.`);
      }

      return {
        ...player,
        board,
        hand,
        storage: [...player.storage, choice.cardId],
        resources: payment.resources,
      };
    });
  }

  private requirePlayer(playerId: string) {
    if (!this.snapshot.players.some((player) => player.playerId === playerId)) {
      throw new Error('Player must join room first.');
    }
  }

  private findPlayerIndex(playerId: string) {
    const playerIndex = this.snapshot.players.findIndex((player) => player.playerId === playerId);
    if (playerIndex < 0) throw new Error('Unknown player.');
    return playerIndex;
  }

  private requireCard(cardId: string) {
    const card = cards.find((item) => item.card_id === cardId);
    if (!card) throw new Error('Unknown card.');
    return card;
  }

  private scheduleAutoStart() {
    if (this.snapshot.phase !== 'lobby') return;
    if (this.snapshot.players.length >= MAX_PLAYERS) {
      this.start();
      return;
    }
    if (this.snapshot.players.length < 2 || this.startTimer) return;

    this.snapshot.log.push('Match starts soon.');
    this.startTimer = setTimeout(() => {
      try {
        this.start();
      } catch {
        this.startTimer = undefined;
      }
    }, 5000);
  }
}

function createPlayer(playerId: string, name: string, _index: number): PlayerState {
  return {
    playerId,
    name,
    board: createBoard(),
    hand: [],
    chosen: [],
    storage: [],
    draftChoice: undefined,
    resources: { ...STARTING_RESOURCES },
    ready: false,
  };
}

function currentDayOpenSlots(board: BoardCell[], day: number) {
  return board.filter((cell) => cell.day === day && !cell.card_id && !cell.skipped && !cell.locked);
}

function lockRandomNextDaySlot(board: BoardCell[], currentDay: number, seed: number) {
  const nextDay = currentDay + 1;
  const candidates = board.filter((cell) => cell.day === nextDay && !cell.card_id && !cell.skipped && !cell.locked);
  if (!candidates.length) return board;

  const target = candidates[seed % candidates.length];
  return lockBoardSlot(board, target);
}
