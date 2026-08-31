import { DEFAULT_SETTINGS, type CanvasAction, type GameSettings, type Phase, type PlayerView, type RoomView } from '@garabato/shared';

export const DEFAULT_WORDS = ['árbol','avión','ballena','bicicleta','bombero','castillo','cocodrilo','corazón','dinosaurio','elefante','estrella','fantasma','guitarra','helado','mariposa','montaña','paraguas','pingüino','pirata','planeta','robot','sandía','teléfono','tiburón','tortuga','volcán'];

export function normalizeAnswer(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function isNearAnswer(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeAnswer(guess);
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedGuess || !normalizedAnswer || normalizedGuess === normalizedAnswer) return false;
  const allowedDistance = Math.min(3, Math.max(1, Math.floor(normalizedAnswer.length * 0.2)));
  return Math.abs(normalizedGuess.length - normalizedAnswer.length) <= allowedDistance
    && editDistance(normalizedGuess, normalizedAnswer) <= allowedDistance;
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

export function buildWordHint(word: string, revealedCount: number): string {
  const letterIndexes=[...word].map((char,index)=>char===' '?-1:index).filter(index=>index>=0);
  const revealOrder=[letterIndexes[Math.floor(letterIndexes.length/2)],letterIndexes[0]].filter((index,pos,list)=>index!==undefined&&list.indexOf(index)===pos);
  const revealed=new Set(revealOrder.slice(0,revealedCount));
  return [...word].map((char,index)=>char===' '?'|':revealed.has(index)?char:'_').join('');
}

export function undoLastStroke(segments: CanvasAction[]): { segments: CanvasAction[]; strokeId?: string } {
  const strokeId=segments.at(-1)?.id;
  return strokeId ? {segments:segments.filter(segment=>segment.id!==strokeId),strokeId} : {segments};
}

export interface Player { id: string; socketId?: string; name: string; score: number; isHost: boolean; connected: boolean; guessed: boolean; lastSeen: number }
export interface Room {
  code: string; phase: Phase; players: Map<string, Player>; settings: GameSettings; customWords: string[];
  turnOrder: string[]; turnIndex: number; round: number; drawerId?: string; secretWord?: string;
  options?: string[]; usedWords: Set<string>; turnEndsAt?: number; chooseEndsAt?: number; turnTimer?: NodeJS.Timeout; chooseTimer?: NodeJS.Timeout; hintTimers: NodeJS.Timeout[];
  guessOrder: { playerId:string; name:string; position:number; points:number }[]; history: CanvasAction[];
}

export function roomView(room: Room): RoomView {
  const players: PlayerView[] = [...room.players.values()].map(({ id,name,score,isHost,connected,guessed }) => ({ id,name,score,isHost,connected,guessed }));
  const totalMs=room.settings.turnSeconds*1000,start=(room.turnEndsAt||0)-totalMs,elapsed=Math.max(0,Date.now()-start);
  const revealedCount=room.phase==='drawing'?Math.min(2,Math.floor(elapsed/(totalMs/3))):0;
  const hint = room.secretWord ? buildWordHint(room.secretWord,revealedCount) : undefined;
  return { code: room.code, phase: room.phase, players, settings: room.settings, customWordCount: room.customWords.length,
    drawerId: room.drawerId, round: room.round, totalRounds: room.settings.rounds, wordLength: room.secretWord?.replace(/\s/g,'').length,
    wordHint: hint, turnEndsAt: room.turnEndsAt, chooseEndsAt:room.chooseEndsAt,
    lastWord: room.phase==='turnEnd'?room.secretWord:undefined,
    turnResults: room.phase==='turnEnd'?room.guessOrder:undefined };
}

export function newRoom(code: string): Room {
  return { code, phase:'lobby', players:new Map(), settings:{...DEFAULT_SETTINGS}, customWords:[], turnOrder:[], turnIndex:-1, round:0, usedWords:new Set(), hintTimers:[], guessOrder:[], history:[] };
}
