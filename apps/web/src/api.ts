
export interface Variant {
  id: number;
  headline: string;
  color: string;
  cta: string;
}
export interface StrategyStats {
  variants: { variantId: number; impressions: number; clicks: number }[];
  impressions: number;
  clicks: number;
  ctr: number;
  regret: number;
}
export interface Stats {
  campaign: { id: number; name: string };
  running: boolean;
  eventsPerSecond: number;
  variants: Variant[];
  strategies: { thompson: StrategyStats; uniform: StrategyStats };
}
export interface CampaignInput {
  name: string;
  headlines: string[];
  colors: string[];
  ctas: string[];
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  list: () => request<{ id: number; name: string }[]>('/campaigns'),
  create: (input: CampaignInput) => request<{ id: number; name: string }>('/campaigns', 'POST', input),
  stats: (id: number) => request<Stats>(`/campaigns/${id}/stats`),
  start: (id: number, eventsPerSecond: number) => request(`/campaigns/${id}/start`, 'POST', { eventsPerSecond }),
  stop: (id: number) => request(`/campaigns/${id}/stop`, 'POST'),
  reset: (id: number) => request(`/campaigns/${id}/reset`, 'POST'),
};
