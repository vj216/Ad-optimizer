import { Kafka, Producer } from 'kafkajs';
import { pool } from './db';

export interface AdEvent {
  id: string;
  campaignId: number;
  variantId: number;
  strategy: string;
  type: 'impression' | 'click';
  ts: string;
}

export const TOPIC = 'ad-events';

export const kafka = new Kafka({
  clientId: 'ad-optimizer',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(','),
});

export async function ensureTopic(): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({ waitForLeaders: true, topics: [{ topic: TOPIC, numPartitions: 3 }] });
  await admin.disconnect();
}

export async function insertEvents(events: AdEvent[]): Promise<void> {
  if (events.length === 0) return;
  await pool.query(
    `INSERT INTO events (id, campaign_id, variant_id, strategy, type, ts)
     SELECT * FROM unnest($1::uuid[], $2::int[], $3::int[], $4::text[], $5::text[], $6::timestamptz[])
     ON CONFLICT (id) DO NOTHING`,
    [
      events.map((e) => e.id),
      events.map((e) => e.campaignId),
      events.map((e) => e.variantId),
      events.map((e) => e.strategy),
      events.map((e) => e.type),
      events.map((e) => e.ts),
    ],
  );
}

export interface EventSink {
  send(events: AdEvent[]): Promise<void>;
  close(): Promise<void>;
}

export class DirectSink implements EventSink {
  send(events: AdEvent[]) {
    return insertEvents(events);
  }
  async close() {}
}

export class KafkaSink implements EventSink {
  private producer: Producer = kafka.producer();
  private ready: Promise<void>;
  constructor() {
    this.ready = ensureTopic().then(() => this.producer.connect());
  }
  async send(events: AdEvent[]) {
    await this.ready;
    await this.producer.send({
      topic: TOPIC,
      messages: events.map((e) => ({ key: String(e.variantId), value: JSON.stringify(e) })),
    });
  }
  async close() {
    await this.ready;
    await this.producer.disconnect();
  }
}
