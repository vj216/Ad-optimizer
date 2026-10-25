import { describe, expect, it } from 'vitest';
import { generateVariants } from './variants';

describe('generateVariants', () => {
  it('returns every combination when there are few', () => {
    const v = generateVariants({ headlines: ['A', 'B'], colors: ['red', 'blue'], ctas: ['Go'] });
    expect(v).toHaveLength(4);
  });

  it('caps the number of variants', () => {
    const v = generateVariants({ headlines: ['A', 'B', 'C'], colors: ['1', '2', '3'], ctas: ['x', 'y'] }, 8);
    expect(v).toHaveLength(8);
  });

  it('has no duplicates and ignores blanks/repeats', () => {
    const v = generateVariants({ headlines: ['A', 'A', ' '], colors: ['red'], ctas: ['Go'] });
    expect(v).toHaveLength(1);
    const many = generateVariants({ headlines: ['A', 'B', 'C'], colors: ['1', '2', '3'], ctas: ['x', 'y'] });
    expect(new Set(many.map((m) => JSON.stringify(m))).size).toBe(many.length);
  });

  it('is repeatable', () => {
    const t = { headlines: ['A', 'B', 'C'], colors: ['1', '2', '3'], ctas: ['x', 'y'] };
    expect(generateVariants(t)).toEqual(generateVariants(t));
  });
});
