import { describe,expect,it } from 'vitest';
import { buildTurnOrder, normalizeAnswer, parseWords, scoreGuess } from './game.js';

describe('normalización',()=>{
  it('ignora acentos, mayúsculas y espacios exteriores',()=>expect(normalizeAnswer('  ÁRBOL  ')).toBe('arbol'));
  it('consolida espacios internos',()=>expect(normalizeAnswer('Teléfono   móvil')).toBe('telefono movil'));
  it('limpia palabras duplicadas',()=>expect(parseWords('Árbol, arbol\n casa\n\nCasa')).toEqual(['Árbol','casa']));
});
describe('puntuación',()=>{
  it('premia respuestas rápidas y respeta límites',()=>{expect(scoreGuess(80000,80000)).toBe(500);expect(scoreGuess(0,80000)).toBe(100);expect(scoreGuess(40000,80000)).toBe(300);});
});
describe('rondas',()=>{
  it('da un turno por jugador en cada ronda',()=>expect(buildTurnOrder(['a','b','c'],2)).toEqual(['a','b','c','a','b','c']));
  it('acepta una sala de dos jugadores',()=>expect(buildTurnOrder(['a','b'],1)).toHaveLength(2));
});
