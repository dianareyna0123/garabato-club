import { DEFAULT_SETTINGS, type DrawSegment, type GameSettings, type Phase, type PlayerView, type RoomView } from '@garabato/shared';

export const DEFAULT_WORDS = ['árbol','avión','ballena','bicicleta','bombero','castillo','cocodrilo','corazón','dinosaurio','elefante','estrella','fantasma','guitarra','helado','mariposa','montaña','paraguas','pingüino','pirata','planeta','robot','sandía','teléfono','tiburón','tortuga','volcán'];

export function normalizeAnswer(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function parseWords(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[,\n\r]+/).map(w => w.trim().replace(/\s+/g, ' ')).filter(w => {
    const key = normalizeAnswer(w);
    if (!key || key.length > 40 || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 500);
}

export function scoreGuess(position: number, remainingMs: number, totalMs: number): number {
  const rankBase = Math.max(100, 450 - (Math.max(1, position) - 1) * 35);
  const speedRatio = Math.max(0, Math.min(1, remainingMs / totalMs));
  return Math.round(rankBase + 50 * speedRatio);
}

export function buildTurnOrder(playerIds: string[], rounds: number): string[] {
  return Array.from({ length: rounds }, () => [...playerIds]).flat();
}

export function undoLastStroke(segments: DrawSegment[]): { segments: DrawSegment[]; strokeId?: string } {
  const strokeId=segments.at(-1)?.id;
  return strokeId ? {segments:segments.filter(segment=>segment.id!==strokeId),strokeId} : {segments};
}

export interface Player { id: string; socketId?: string; name: string; score: number; isHost: boolean; connected: boolean; guessed: boolean; lastSeen: number }
export interface Room {
  code: string; phase: Phase; players: Map<string, Player>; settings: GameSettings; customWords: string[];
  turnOrder: string[]; turnIndex: number; round: number; drawerId?: string; secretWord?: string;
  options?: string[]; usedWords: Set<string>; turnEndsAt?: number; turnTimer?: NodeJS.Timeout; chooseTimer?: NodeJS.Timeout;
  guessOrder: { playerId:string; name:string; position:number; points:number }[]; history: DrawSegment[];
}

export function roomView(room: Room): RoomView {
  const players: PlayerView[] = [...room.players.values()].map(({ id,name,score,isHost,connected,guessed }) => ({ id,name,score,isHost,connected,guessed }));
  const hint = room.secretWord ? room.secretWord.split('').map(c => c === ' ' ? '  ' : '_').join(' ') : undefined;
  return { code: room.code, phase: room.phase, players, settings: room.settings, customWordCount: room.customWords.length,
    drawerId: room.drawerId, round: room.round, totalRounds: room.settings.rounds, wordLength: room.secretWord?.replace(/\s/g,'').length,
    wordHint: hint, turnEndsAt: room.turnEndsAt,
    lastWord: room.phase==='turnEnd'?room.secretWord:undefined,
    turnResults: room.phase==='turnEnd'?room.guessOrder:undefined };
}

export function newRoom(code: string): Room {
  return { code, phase:'lobby', players:new Map(), settings:{...DEFAULT_SETTINGS}, customWords:[], turnOrder:[], turnIndex:-1, round:0, usedWords:new Set(), guessOrder:[], history:[] };
}
