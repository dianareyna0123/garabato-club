import { describe,expect,it } from 'vitest';
import { buildTurnOrder, normalizeAnswer, parseWords, scoreGuess, undoLastStroke } from './game.js';
import type { DrawSegment } from '@garabato/shared';

describe('normalización',()=>{
  it('ignora acentos, mayúsculas y espacios exteriores',()=>expect(normalizeAnswer('  ÁRBOL  ')).toBe('arbol'));
  it('consolida espacios internos',()=>expect(normalizeAnswer('Teléfono   móvil')).toBe('telefono movil'));
  it('limpia palabras duplicadas',()=>expect(parseWords('Árbol, arbol\n casa\n\nCasa')).toEqual(['Árbol','casa']));
});
describe('puntuación',()=>{
  it('premia rapidez dentro de la posición',()=>{expect(scoreGuess(1,80000,80000)).toBe(500);expect(scoreGuess(1,0,80000)).toBe(450);expect(scoreGuess(1,40000,80000)).toBe(475);});
  it('reduce los puntos según el orden de acierto',()=>{expect(scoreGuess(1,60000,80000)).toBeGreaterThan(scoreGuess(2,60000,80000));expect(scoreGuess(2,60000,80000)).toBeGreaterThan(scoreGuess(3,60000,80000));});
  it('mantiene posiciones distintas con el máximo de jugadores',()=>{for(let p=1;p<11;p++)expect(scoreGuess(p,40000,80000)).toBeGreaterThan(scoreGuess(p+1,40000,80000));});
});
describe('rondas',()=>{
  it('da un turno por jugador en cada ronda',()=>expect(buildTurnOrder(['a','b','c'],2)).toEqual(['a','b','c','a','b','c']));
  it('acepta una sala de dos jugadores',()=>expect(buildTurnOrder(['a','b'],1)).toHaveLength(2));
  it('da exactamente un turno a cada uno de cuatro jugadores por ronda',()=>{const order=buildTurnOrder(['a','b','c','d'],3);expect(order).toHaveLength(12);for(let round=0;round<3;round++)expect(order.slice(round*4,round*4+4)).toEqual(['a','b','c','d']);});
});
describe('deshacer',()=>{
  it('elimina todos los segmentos de la última pincelada',()=>{const make=(id:string):DrawSegment=>({id,from:{x:0,y:0},to:{x:1,y:1},color:'#000000',width:5,tool:'pen'});const result=undoLastStroke([make('trazo-1'),make('trazo-2'),make('trazo-2')]);expect(result.strokeId).toBe('trazo-2');expect(result.segments.map(s=>s.id)).toEqual(['trazo-1']);});
});
