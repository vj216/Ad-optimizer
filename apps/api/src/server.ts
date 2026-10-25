import { buildApp } from './app';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API ready on http://localhost:${port}`);
