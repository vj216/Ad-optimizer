import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, Stats } from './api';


const AD_COLORS = ['#ff4f9a', '#7c5cff', '#1fc8a0', '#ffb627', '#3b9dff', '#ff7a45', '#9acd32', '#c06cff'];
const SMART = '#12a883';
const RANDOM = '#e69a00';


interface Point {
  t: number;
  smartCtr: number;
  randomCtr: number;
  smartRegret: number;
  randomRegret: number;
  share: Record<number, number>;
}


function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1d1233' : '#fff';
}
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export default function App() {
  const [campaigns, setCampaigns] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(100);
  const [form, setForm] = useState({
    name: 'Spring sale',
    headlines: 'Your next adventure starts here\nSave big this weekend\nMade for the way you move',
    colors: '#ff4f9a\n#3b82f6\n#14b8a6',
    ctas: 'Shop now\nLearn more',
  });
  const prev = useRef<Record<number, number>>({});
  const tick = useRef(0);

  const refreshList = async () => {
    try {
      const list = await api.list();
      setCampaigns(list);
      setSelected((s) => s ?? list[0]?.id ?? null);
    } catch {
      setError('Cannot reach the API. Is it running on port 3001?');
    }
  };
  useEffect(() => void refreshList(), []);

  const clearHistory = () => {
    setHistory([]);
    prev.current = {};
    tick.current = 0;
  };

  
  useEffect(() => {
    if (selected === null) return;
    clearHistory();
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.stats(selected);
        if (!alive) return;
        setStats(s);
        setError('');
        const smart = s.strategies.thompson;
        if (smart.impressions === 0) return;

        // Traffic share over the last second = change since the previous snapshot.
        const delta = smart.variants.map((v) => v.impressions - (prev.current[v.variantId] ?? 0));
        const total = delta.reduce((a, b) => a + b, 0);
        const share: Record<number, number> = {};
        smart.variants.forEach((v, i) => {
          share[v.variantId] = total > 0 ? delta[i] / total : 0;
          prev.current[v.variantId] = v.impressions;
        });
        if (total === 0 && tick.current > 0) return; //(paused)

        tick.current += 1;
        const point: Point = {
          t: tick.current,
          smartCtr: smart.ctr * 100,
          randomCtr: s.strategies.uniform.ctr * 100,
          smartRegret: smart.regret,
          randomRegret: s.strategies.uniform.regret,
          share,
        };
        setHistory((h) => [...h, point].slice(-120));
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = () =>
    run(async () => {
      const c = await api.create({
        name: form.name,
        headlines: lines(form.headlines),
        colors: lines(form.colors),
        ctas: lines(form.ctas),
      });
      await refreshList();
      setSelected(c.id);
    });

  const smart = stats?.strategies.thompson;
  const random = stats?.strategies.uniform;
  const lead = smart && random ? smart.clicks - random.clicks : 0;
  const shareChart = useMemo(
    () => history.map((p) => ({ t: p.t, ...Object.fromEntries(Object.entries(p.share).map(([k, v]) => [k, v * 100])) })),
    [history],
  );

  return (
    <main>
      <header>
        <h1>Ad Creative Optimizer</h1>
        <p>
          Two robots show the same ads to the same pretend visitors. One picks at random. The other learns which ad
          gets clicked and shows it more.
        </p>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <details className="panel" open={campaigns.length === 0}>
        <summary>Create a campaign</summary>
        <div className="form">
          <label>
            Campaign name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Headlines (one per line)
            <textarea rows={4} value={form.headlines} onChange={(e) => setForm({ ...form, headlines: e.target.value })} />
          </label>
          <label>
            Background colors (hex, one per line)
            <textarea rows={4} value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} />
          </label>
          <label>
            Button texts (one per line)
            <textarea rows={4} value={form.ctas} onChange={(e) => setForm({ ...form, ctas: e.target.value })} />
          </label>
          <button className="primary" onClick={create}>Create campaign</button>
          <p className="hint">We mix every headline, color and button text, then keep up to 8 ads.</p>
        </div>
      </details>

      {campaigns.length > 0 && (
        <div className="controls">
          <select value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Campaign">
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>
            ))}
          </select>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Visitors per second">
            {[20, 50, 100, 200, 400].map((n) => (
              <option key={n} value={n}>{n} visitors/second</option>
            ))}
          </select>
          {stats?.running ? (
            <button onClick={() => run(() => api.stop(selected!))}>Pause</button>
          ) : (
            <button className="primary" onClick={() => run(() => api.start(selected!, speed))}>Start visitors</button>
          )}
          <button
            onClick={() =>
              run(async () => {
                await api.reset(selected!);
                clearHistory();
              })
            }
          >
            Reset
          </button>
        </div>
      )}

      {stats && smart && random && (
        <>
          <section className="score" aria-label="Scoreboard">
            <div className="team" style={{ borderColor: SMART }}>
              <h2>Learning robot</h2>
              <div className="big">{smart.clicks.toLocaleString()}</div>
              <div>clicks · {pct(smart.ctr, 2)} click rate</div>
            </div>
            <div className="lead">
              {smart.impressions === 0
                ? 'Press “Start visitors”'
                : lead > 0
                  ? `Learning robot leads by ${lead} clicks`
                  : lead < 0
                    ? `Random robot leads by ${-lead} clicks (still learning)`
                    : 'Tied so far'}
            </div>
            <div className="team" style={{ borderColor: RANDOM }}>
              <h2>Random robot</h2>
              <div className="big">{random.clicks.toLocaleString()}</div>
              <div>clicks · {pct(random.ctr, 2)} click rate</div>
            </div>
          </section>

          <section className="ads" aria-label="Ads">
            {stats.variants.map((v, i) => {
              const s = smart.variants.find((x) => x.variantId === v.id)!;
              const r = random.variants.find((x) => x.variantId === v.id)!;
              const share = smart.impressions ? s.impressions / smart.impressions : 0;
              return (
                <article key={v.id} className="ad">
                  <div className="creative" style={{ background: v.color, color: textOn(v.color) }}>
                    <span className="badge" style={{ background: AD_COLORS[i % 8] }}>{String.fromCharCode(65 + i)}</span>
                    <strong>{v.headline}</strong>
                    <span className="cta" style={{ background: textOn(v.color), color: v.color }}>{v.cta}</span>
                  </div>
                  <div className="meter" title="Share of visitors the learning robot shows this ad to">
                    <div style={{ width: pct(share, 0), background: SMART }} />
                  </div>
                  <dl>
                    <div><dt>Learning robot shows it</dt><dd>{pct(share)}</dd></div>
                    <div><dt>Its click rate</dt><dd>{s.impressions ? pct(s.clicks / s.impressions, 2) : '–'}</dd></div>
                    <div><dt>Random robot click rate</dt><dd>{r.impressions ? pct(r.clicks / r.impressions, 2) : '–'}</dd></div>
                  </dl>
                </article>
              );
            })}
          </section>

          <section className="charts">
            <figure>
              <figcaption>Who gets the traffic? (learning robot, each second)</figcaption>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={shareChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8cdf2" />
                  <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(0)}%`} />
                  {stats.variants.map((v, i) => (
                    <Area key={v.id} type="monotone" dataKey={String(v.id)} name={String.fromCharCode(65 + i)} stackId="1" stroke={AD_COLORS[i % 8]} fill={AD_COLORS[i % 8]} isAnimationActive={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </figure>
            <figure>
              <figcaption>Click rate over time (%)</figcaption>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8cdf2" />
                  <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="smartCtr" name="Learning robot" stroke={SMART} strokeWidth={3} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="randomCtr" name="Random robot" stroke={RANDOM} strokeWidth={3} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </figure>
            <figure>
              <figcaption>Regret: clicks lost by not always showing the best ad (lower is better)</figcaption>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8cdf2" />
                  <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="smartRegret" name="Learning robot" stroke={SMART} strokeWidth={3} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="randomRegret" name="Random robot" stroke={RANDOM} strokeWidth={3} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </section>
        </>
      )}
    </main>
  );
}
