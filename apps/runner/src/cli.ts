/**
 * Runner entry point for the API (development only). Reads one JSON request on stdin, writes one JSON result on
 * stdout. The request carries the files of ONE pinned snapshot; the runner has no database, network or secret.
 *   { "activityId": "...", "files": [{ "path", "content" }], "commitSha": "..."|null, "origin": "synthetic" }
 */
import { DomainError, type SubmittedFile } from '@naqla/domain';
import { packFor } from './packs/index.js';
import { runAttempt } from './run.js';
import { sweepStaleAttempts } from './sandbox.js';

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const req = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { activityId: string; files: SubmittedFile[]; starterFiles?: SubmittedFile[]; commitSha: string | null; origin: string };
  sweepStaleAttempts();
  const result = await runAttempt({ pack: packFor(req.activityId), files: req.files, starterFiles: req.starterFiles ?? [], commitSha: req.commitSha, origin: req.origin as 'synthetic' });
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

main().catch((e: unknown) => {
  const message = e instanceof DomainError ? e.message : e instanceof Error ? e.message.split('\n')[0] : 'runner failed';
  process.stdout.write(JSON.stringify({ ok: false, error: String(message).slice(0, 300) }));
  process.exitCode = 1;
});
