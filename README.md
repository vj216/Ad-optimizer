# Ad Creative Optimizer
![Dashboard demo: the learning robot pulls ahead of the random robot](docs/demo.gif)

Two robots show the same ads to the same pretend visitors. One picks ads at random (A/B test).
The other uses **Thompson sampling**, a multi-armed bandit, to learn which ad gets clicked and show it more.
The dashboard shows the learning robot pulling ahead in real time.

```mermaid
flowchart LR
  Sim[Visitor simulator<br/>Node + TypeScript] -->|impression + click events| K[(Kafka / Redpanda<br/>topic: ad-events)]
  K --> C[Consumer<br/>batches + idempotent insert]
  C --> P[(Postgres)]
  Sim -.direct mode.-> P
  P --> API[Stats API<br/>Fastify + Zod]
  API -->|poll every 1s| UI[React dashboard<br/>Recharts]
  Sim <-->|which ad next?| B[Allocators:<br/>Thompson vs Uniform]
```

## Why this exists
Ad platforms produce huge numbers of creative variants. Testing them with plain A/B tests wastes traffic
on losing ads. A bandit shifts traffic to winners while it is still learning. This project is a small model of that.

## Run it

```bash
# 1. start Postgres + Redpanda
docker compose -f infra/docker-compose.yml up -d

# 2. API (terminal 1)
cd apps/api && npm install
npm run dev                      # simple: events go straight to Postgres
# or: USE_KAFKA=true npm run dev  # events go through Kafka

# 3. Kafka consumer (terminal 2, only in Kafka mode)
cd apps/api && USE_KAFKA=true npm run consumer

# 4. Dashboard (terminal 3)
cd apps/web && npm install && npm run dev      # open http://localhost:5173
```

Create a campaign, press **Start visitors**, and watch.

## Tests
```bash
cd apps/api && DATABASE_URL=postgres://ads:ads@localhost:5433/ads npm test
cd apps/web && npm run build
```
CI (GitHub Actions) runs typecheck, tests against a real Postgres, and the web build on every push.

## Design decisions
- **Same visitors for both robots.** Each tick shows one ad per robot per visitor slot, so the comparison is fair.
- **Hidden "true click rate".** Each ad has a secret click chance in the database. The API never returns it, so the
  bandit has to discover the winner. It is used only to measure *regret* (clicks lost versus always showing the best ad).
- **Seeded randomness.** Tests are repeatable because the random generator takes a seed.
- **Idempotent writes.** Every event has a UUID and inserts use `ON CONFLICT DO NOTHING`, because Kafka can deliver a message twice.
- **Kafka key = ad id**, so one ad's events stay in order inside a partition.
- **Polling, not WebSockets.** The dashboard asks for new numbers each second. Simple and robust; see below for the upgrade.

## What I would improve next
- Push updates with WebSockets or Server-Sent Events instead of polling.
- Shard the events table with Citus and add time-bucketed rollups instead of counting raw events.
- Contextual bandits (different best ad per audience) and a proper Kafka schema registry.
- Auth, multiple users, and deployment on Kubernetes.
- A Playwright end-to-end test of the dashboard.
