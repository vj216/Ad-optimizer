import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { pool } from './db';

// These tests need a real Postgres. They only run when DATABASE_URL is set
// (our GitHub Actions workflow sets it).
describe.skipIf(!process.env.DATABASE_URL)('API with a real database', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a campaign, simulates visitors, and reports stats without leaking secrets', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/campaigns',
      payload: { name: 'Test', headlines: ['A', 'B'], colors: ['#ff0000'], ctas: ['Go'], seed: 1 },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    await app.inject({ method: 'POST', url: `/campaigns/${id}/start`, payload: { eventsPerSecond: 200 } });
    await new Promise((r) => setTimeout(r, 1500));
    await app.inject({ method: 'POST', url: `/campaigns/${id}/stop`, payload: {} });

    const stats = (await app.inject({ method: 'GET', url: `/campaigns/${id}/stats` })).json();
    expect(stats.variants).toHaveLength(2);
    expect(stats.strategies.thompson.impressions).toBeGreaterThan(0);
    expect(stats.strategies.thompson.impressions).toBe(stats.strategies.uniform.impressions);
    expect(JSON.stringify(stats)).not.toContain('true_ctr');

    await app.inject({ method: 'POST', url: `/campaigns/${id}/reset`, payload: {} });
    const after = (await app.inject({ method: 'GET', url: `/campaigns/${id}/stats` })).json();
    expect(after.strategies.thompson.impressions).toBe(0);
  });

  it('rejects bad input with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/campaigns', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
  });
});
