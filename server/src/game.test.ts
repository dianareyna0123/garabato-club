import { describe,expect,it } from 'vitest';
import { buildTurnOrder, normalizeAnswer, parseWords, scoreGuess } from './game.js';

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
});
