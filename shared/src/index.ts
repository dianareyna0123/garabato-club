export type Phase = 'lobby' | 'choosing' | 'drawing' | 'turnEnd' | 'finished';

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  guessed: boolean;
}

export interface GameSettings {
  rounds: number;
  turnSeconds: number;
  wordOptions: number;
  allowRepeats: boolean;
  maxPlayers: number;
  wordMode: 'custom' | 'mixed';
}

export interface RoomView {
  code: string;
  phase: Phase;
  players: PlayerView[];
  settings: GameSettings;
  customWordCount: number;
  drawerId?: string;
  round: number;
  totalRounds: number;
  wordLength?: number;
  wordHint?: string;
  turnEndsAt?: number;
  lastWord?: string;
  turnResults?: { playerId:string; name:string; position:number; points:number }[];
  message?: string;
}

export interface DrawPoint { x: number; y: number }
export interface DrawSegment {
  id: string;
  from: DrawPoint;
  to: DrawPoint;
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
}

export const DEFAULT_SETTINGS: GameSettings = {
  rounds: 3, turnSeconds: 80, wordOptions: 3, allowRepeats: false, maxPlayers: 8, wordMode: 'mixed'
};
