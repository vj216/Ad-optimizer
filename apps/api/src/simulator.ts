import { randomUUID } from 'node:crypto';
import { ArmStats, Allocator, ThompsonAllocator, UniformAllocator } from './bandit';
import { AdEvent, EventSink } from './events';
import { mulberry32, Rng } from './rng';

interface Arm {
  variantId: number;
  trueCtr: number; // secret real click chance
}


export class Simulation {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private rng: Rng;
  private strategies: { allocator: Allocator; stats: ArmStats[] }[];
  eventsPerSecond = 50;

  constructor(
    private campaignId: number,
    private arms: Arm[],
    private sink: EventSink,
    seed: number,
    initial?: Record<string, ArmStats[]>, // numbers saved from before
  ) {
    this.rng = mulberry32(seed);
    this.strategies = [new ThompsonAllocator(), new UniformAllocator()].map((allocator) => ({
      allocator,
      stats: initial?.[allocator.name] ?? arms.map(() => ({ impressions: 0, clicks: 0 })),
    }));
  }

  get running() {
    return this.timer !== undefined;
  }

  start(eventsPerSecond: number) {
    this.eventsPerSecond = eventsPerSecond;
    this.stop();
    this.timer = setInterval(() => void this.tick(), 100); // 10 ticks per second
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick() {
    if (this.busy) return; 
    this.busy = true;
    try {
      const perTick = Math.max(1, Math.round(this.eventsPerSecond / 10));
      const events: AdEvent[] = [];
      const ts = new Date().toISOString();
      for (const { allocator, stats } of this.strategies) {
        for (let n = 0; n < perTick; n++) {
          const i = allocator.choose(stats, this.rng);
          const arm = this.arms[i];
          stats[i].impressions++;
          const base = { campaignId: this.campaignId, variantId: arm.variantId, strategy: allocator.name, ts };
          events.push({ ...base, id: randomUUID(), type: 'impression' });
          if (this.rng() < arm.trueCtr) {
            stats[i].clicks++;
            events.push({ ...base, id: randomUUID(), type: 'click' });
          }
        }
      }
      await this.sink.send(events);
    } catch (err) {
      console.error('tick failed', err);
    } finally {
      this.busy = false;
    }
  }
}
