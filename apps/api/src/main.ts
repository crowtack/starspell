import { createApiApp } from './app.factory.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env['API_PORT'] ?? '3001');
  const app = await createApiApp();
  await app.listen(port);
  process.stdout.write(`Starspell API listening on http://localhost:${String(port)}\n`);
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(
    `API failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
