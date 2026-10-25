import { Rng, sampleBeta } from './rng';

export interface ArmStats {
  impressions: number; // times people saw it
  clicks: number; // times people clicked it
}

// which ad should we show next?
export interface Allocator {
  name: string;
  choose(arms: ArmStats[], rng: Rng): number; // returns the position of the chosen ad
}

//  A/B test
export class UniformAllocator implements Allocator {
  name = 'uniform';
  choose(arms: ArmStats[], rng: Rng): number {
    return Math.floor(rng() * arms.length);
  }
}

// Thompson sampling.
// For each ad, make a "guess" of its click chance using what we've seen.
// Few views -> wide, (give new ads a chance).
// Many views -> narrow, confident guess. show the ad with the highest guess.
export class ThompsonAllocator implements Allocator {
  name = 'thompson';
  choose(arms: ArmStats[], rng: Rng): number {
    let best = 0;
    let bestGuess = -1;
    arms.forEach((arm, i) => {
      const guess = sampleBeta(arm.clicks + 1, arm.impressions - arm.clicks + 1, rng);
      if (guess > bestGuess) {
        bestGuess = guess;
        best = i;
      }
    });
    return best;
  }
}
