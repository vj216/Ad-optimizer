import { describe, expect, it } from 'vitest';
import { ArmStats, Allocator, ThompsonAllocator, UniformAllocator } from './bandit';
import { mulberry32, sampleBeta } from './rng';


const TRUE_CTRS = [0.02, 0.03, 0.05, 0.08];

function run(allocator: Allocator, rounds: number, seed: number) {
  const rng = mulberry32(seed);
  const arms: ArmStats[] = TRUE_CTRS.map(() => ({ impressions: 0, clicks: 0 }));
  let clicks = 0;
  for (let r = 0; r < rounds; r++) {
    const i = allocator.choose(arms, rng);
    arms[i].impressions++;
    if (rng() < TRUE_CTRS[i]) {
      arms[i].clicks++;
      clicks++;
    }
  }
  return { arms, clicks };
}

describe('bandit', () => {
  it('Thompson sampling earns more clicks than uniform A/B', () => {
    let thompsonWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const t = run(new ThompsonAllocator(), 5000, seed);
      const u = run(new UniformAllocator(), 5000, seed);
      if (t.clicks > u.clicks) thompsonWins++;
    }
    expect(thompsonWins).toBeGreaterThanOrEqual(9);
  });

  it('gives the best ad most of the traffic', () => {
    const { arms } = run(new ThompsonAllocator(), 5000, 42);
    const share = arms[3].impressions / 5000;
    expect(share).toBeGreaterThan(0.5);
  });

  it('is repeatable with the same seed', () => {
    expect(run(new ThompsonAllocator(), 500, 7).clicks).toBe(run(new ThompsonAllocator(), 500, 7).clicks);
  });
});

describe('sampleBeta', () => {
  it('has the right average (a / (a + b))', () => {
    const rng = mulberry32(3);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += sampleBeta(3, 7, rng);
    expect(sum / n).toBeCloseTo(0.3, 1);
  });
});
