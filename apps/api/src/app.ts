import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { migrate, pool } from './db';
import { DirectSink, EventSink, KafkaSink } from './events';
import { Simulation } from './simulator';
import { computeRegret, getCounts, getVariants } from './stats';
import { generateVariants } from './variants';
import { mulberry32 } from './rng';


export async function buildApp() {
  await migrate();
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid input', details: err.issues });
    console.error(err);
    return reply.code(500).send({ error: 'Something went wrong' });
  });


  const useKafka = process.env.USE_KAFKA === 'true';
  const sink: EventSink = useKafka ? new KafkaSink() : new DirectSink();
  console.log(useKafka ? 'Mode: Kafka (run the consumer too!)' : 'Mode: direct to Postgres');

  const simulations = new Map<number, Simulation>();

  const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true, mode: useKafka ? 'kafka' : 'direct' };
  });

  const templateSchema = z.object({
    name: z.string().min(1).max(80),
    headlines: z.array(z.string()).min(1).max(10),
    colors: z.array(z.string()).min(1).max(10),
    ctas: z.array(z.string()).min(1).max(10),
    seed: z.number().int().optional(),
  });

  app.post('/campaigns', async (req, reply) => {
    const body = templateSchema.parse(req.body);
    const seed = body.seed ?? Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    const specs = generateVariants(body, 8, rng);

    const { rows } = await pool.query('INSERT INTO campaigns (name) VALUES ($1) RETURNING id, name', [body.name]);
    const campaign = rows[0];
    for (const s of specs) {
      const trueCtr = 0.01 + rng() * 0.07; // secret: between 1% and 8%
      await pool.query(
        'INSERT INTO variants (campaign_id, headline, color, cta, true_ctr) VALUES ($1,$2,$3,$4,$5)',
        [campaign.id, s.headline, s.color, s.cta, trueCtr],
      );
    }
    reply.code(201);
    return campaign;
  });

  app.get('/campaigns', async () => {
    const { rows } = await pool.query('SELECT id, name, created_at FROM campaigns ORDER BY id DESC LIMIT 50');
    return rows;
  });

  app.get('/campaigns/:id/stats', async (req, reply) => {
    const id = idParam(req);
    const { rows } = await pool.query('SELECT id, name FROM campaigns WHERE id = $1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Campaign not found' });

    const variants = await getVariants(id);
    const counts = await getCounts(id);
    const sim = simulations.get(id);

    const strategies: Record<string, unknown> = {};
    for (const name of ['thompson', 'uniform']) {
      const c = counts[name] ?? {};
      const per = variants.map((v) => ({
        variantId: v.id,
        impressions: c[v.id]?.impressions ?? 0,
        clicks: c[v.id]?.clicks ?? 0,
      }));
      const impressions = per.reduce((s, p) => s + p.impressions, 0);
      const clicks = per.reduce((s, p) => s + p.clicks, 0);
      strategies[name] = {
        variants: per,
        impressions,
        clicks,
        ctr: impressions ? clicks / impressions : 0,
        regret: computeRegret(variants, c),
      };
    }

    return {
      campaign: rows[0],
      running: sim?.running ?? false,
      eventsPerSecond: sim?.eventsPerSecond ?? 0,
      
      variants: variants.map(({ id, headline, color, cta }) => ({ id, headline, color, cta })),
      strategies,
    };
  });

  app.post('/campaigns/:id/start', async (req, reply) => {
    const id = idParam(req);
    const { eventsPerSecond } = z.object({ eventsPerSecond: z.number().int().min(1).max(500) }).parse(req.body ?? {});
    const variants = await getVariants(id);
    if (variants.length === 0) return reply.code(404).send({ error: 'Campaign not found' });

    let sim = simulations.get(id);
    if (!sim) {
      
      const counts = await getCounts(id);
      const initial = Object.fromEntries(
        ['thompson', 'uniform'].map((s) => [
          s,
          variants.map((v) => ({
            impressions: counts[s]?.[v.id]?.impressions ?? 0,
            clicks: counts[s]?.[v.id]?.clicks ?? 0,
          })),
        ]),
      );
      sim = new Simulation(id, variants.map((v) => ({ variantId: v.id, trueCtr: v.true_ctr })), sink, id * 7919, initial);
      simulations.set(id, sim);
    }
    sim.start(eventsPerSecond);
    return { running: true };
  });

  app.post('/campaigns/:id/stop', async (req) => {
    simulations.get(idParam(req))?.stop();
    return { running: false };
  });

  app.post('/campaigns/:id/reset', async (req) => {
    const id = idParam(req);
    
    simulations.get(id)?.stop();
    simulations.delete(id);
    await pool.query('DELETE FROM events WHERE campaign_id = $1', [id]);
    return { reset: true };
  });

  return app;
}
