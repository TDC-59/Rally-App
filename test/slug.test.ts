import { describe, expect, it } from 'vitest';
import { slugify, slugProblem } from '../src/domain/slug';

describe('slugs', () => {
  it('slugifies names', () => {
    expect(slugify('Angry Archies')).toBe('angry-archies');
    expect(slugify('  Crème Brûlée Co.  ')).toBe('creme-brulee-co');
    expect(slugify('Fish & Chips')).toBe('fish-and-chips');
    expect(slugify('x'.repeat(60))).toHaveLength(40);
    expect(slugify('a'.repeat(39) + ' b')).toBe('a'.repeat(39));
  });
  it('validates', () => {
    expect(slugProblem('angry-archies')).toBeNull();
    expect(slugProblem('a')).toBe('length');
    expect(slugProblem('-tacos')).toBe('characters');
    expect(slugProblem('tacos-')).toBe('characters');
    expect(slugProblem('ta--cos')).toBe('characters');
    expect(slugProblem('Tacos')).toBe('characters');
    expect(slugProblem('app')).toBe('reserved');
    expect(slugProblem('near-me')).toBe('reserved');
  });
});
