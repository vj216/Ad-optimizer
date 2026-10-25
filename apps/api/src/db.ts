import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://ads:ads@localhost:5433/ads',
});

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS variants (
      id SERIAL PRIMARY KEY,
      campaign_id INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      headline TEXT NOT NULL,
      color TEXT NOT NULL,
      cta TEXT NOT NULL,
      true_ctr REAL NOT NULL -- the secret real click chance; the dashboard never shows it
    );
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY, -- unique id so the same event can never be saved twice
      campaign_id INT NOT NULL,
      variant_id INT NOT NULL,
      strategy TEXT NOT NULL, -- 'thompson' or 'uniform'
      type TEXT NOT NULL, -- 'impression' or 'click'
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_lookup
      ON events (campaign_id, strategy, variant_id, type);
  `);
}
