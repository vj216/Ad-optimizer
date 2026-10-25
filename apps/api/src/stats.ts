import { pool } from './db';

export interface VariantRow {
  id: number;
  headline: string;
  color: string;
  cta: string;
  true_ctr: number;
}

export async function getVariants(campaignId: number): Promise<VariantRow[]> {
  const { rows } = await pool.query(
    'SELECT id, headline, color, cta, true_ctr FROM variants WHERE campaign_id = $1 ORDER BY id',
    [campaignId],
  );
  return rows;
}

export interface Counts {
  impressions: number;
  clicks: number;
}

// strategy -> variantId -> counts
export async function getCounts(campaignId: number): Promise<Record<string, Record<number, Counts>>> {
  const { rows } = await pool.query(
    `SELECT strategy, variant_id,
            count(*) FILTER (WHERE type = 'impression')::int AS impressions,
            count(*) FILTER (WHERE type = 'click')::int AS clicks
     FROM events WHERE campaign_id = $1 GROUP BY strategy, variant_id`,
    [campaignId],
  );
  const out: Record<string, Record<number, Counts>> = { thompson: {}, uniform: {} };
  for (const r of rows) (out[r.strategy] ??= {})[r.variant_id] = { impressions: r.impressions, clicks: r.clicks };
  return out;
}


export function computeRegret(variants: VariantRow[], counts: Record<number, Counts>): number {
  const best = Math.max(...variants.map((v) => v.true_ctr));
  let regret = 0;
  for (const v of variants) regret += (counts[v.id]?.impressions ?? 0) * (best - v.true_ctr);
  return Math.round(regret * 10) / 10;
}
