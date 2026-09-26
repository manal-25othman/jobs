/**
 * Minimum-context redaction (privacy §12).
 *
 * An agent receives only the field paths its definition allows. The manifest
 * of what was actually passed is returned alongside, so the invocation record
 * states exactly what the agent saw — not what it might have seen.
 */
import { agentDefinition, type AgentType } from './contracts.js';

export interface RedactionResult {
  readonly context: Readonly<Record<string, unknown>>;
  readonly passedPaths: readonly string[];
  readonly redactedPaths: readonly string[];
}

/** Keys that never reach any agent, whatever the allow-list says. */
const NEVER: ReadonlySet<string> = new Set([
  'email', 'password', 'rawUpload', 'objectPath', 'object_path', 'bucket', 'signedUrl', 'token', 'tokenHash',
  'companionConversation', 'privateNotes', 'auditEvents', 'serviceRoleKey',
]);

export function redactForAgent(agentType: AgentType, full: Readonly<Record<string, unknown>>): RedactionResult {
  const allowed = agentDefinition(agentType).allowedContext;
  const context: Record<string, unknown> = {};
  const passed: string[] = []; const redacted: string[] = [];

  for (const [key, value] of Object.entries(full)) {
    if (NEVER.has(key)) { redacted.push(key); continue; }
    if (allowed.includes(key)) { context[key] = stripNever(value); passed.push(key); continue; }
    // Dotted allow-list entries: 'projects.title' lets through only that sub-field.
    const sub = allowed.filter((a) => a.startsWith(key + '.')).map((a) => a.slice(key.length + 1));
    if (sub.length > 0 && value && typeof value === 'object') {
      const pick = (o: Record<string, unknown>) => Object.fromEntries(sub.filter((s) => s in o).map((s) => [s, o[s]]));
      context[key] = Array.isArray(value) ? value.map((v) => pick(v as Record<string, unknown>)) : pick(value as Record<string, unknown>);
      passed.push(...sub.map((s) => `${key}.${s}`));
      continue;
    }
    redacted.push(key);
  }
  return { context, passedPaths: passed, redactedPaths: redacted };
}

function stripNever(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNever);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !NEVER.has(k)).map(([k, x]) => [k, stripNever(x)]));
  }
  return v;
}
