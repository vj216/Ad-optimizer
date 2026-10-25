// pick up batches of events from Kafka and writes them into Postgres.
import { kafka, TOPIC, ensureTopic, insertEvents, AdEvent } from './events';
import { migrate } from './db';

await migrate();
await ensureTopic();

const consumer = kafka.consumer({ groupId: 'ad-events-writer' });
await consumer.connect();
await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

await consumer.run({
  eachBatchAutoResolve: true, 
  eachBatch: async ({ batch, heartbeat }) => {
    const events = batch.messages.map((m) => JSON.parse(m.value!.toString()) as AdEvent);
    await insertEvents(events);
    await heartbeat();
    console.log(`saved ${events.length} events`);
  },
});

console.log('consumer is listening...');
