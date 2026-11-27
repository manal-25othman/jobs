/**
 * R2 development sandbox backend: Linux namespaces + cgroups + an unprivileged user.
 *
 * Each attempt gets:
 *  - fresh network, PID, IPC, UTS and mount namespaces (no network interface but a down loopback; no host processes),
 *  - a read-only root filesystem, with every host location that could hold data, code or credentials hidden under
 *    empty tmpfs mounts (/home, /root, /var, /run, /srv, /mnt, /media, /opt) and only the binaries the attempt needs
 *    bound back read-only,
 *  - a size-limited private /tmp and /dev/shm, the submission bound read-only at /tmp/work,
 *  - user nobody (65534), no_new_privs, every capability dropped, an empty environment,
 *  - its own cgroups: memory, pids and a CPU quota,
 *  - a wall-clock limit enforced from outside, then teardown: every process in its cgroups killed, the cgroups and
 *    the attempt directory removed.
 *
 * This is a DEVELOPMENT backend for SYNTHETIC code. The owner's rule (round 2, item 2) is that ordinary containers or
 * namespaces are not, alone, the security boundary for untrusted code: production needs a kernel-isolating backend
 * (gVisor / microVM, R2 design §2). `assertBackendAllowed` refuses this backend in production, and the domain refuses
 * any origin but `synthetic`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_R2_LIMITS as DEFAULT_LIMITS_FOR_SWEEP, DomainError, assertRunnerLimits, type RunnerLimits, type SubmittedFile } from '@naqla/domain';

export const BACKEND_NAME = 'namespace-dev';
const ROOT_DIR = process.env.R2_ATTEMPT_ROOT ?? '/var/lib/naqla-r2';
const CGROUP_ROOT = '/sys/fs/cgroup';
const CONTROLLERS = ['memory', 'pids', 'cpu'] as const;
/** cgroup v2 (unified hierarchy: most current hosts, GitHub-hosted runners) or v1 (one tree per controller). */
const CGROUP_V2 = existsSync(join(CGROUP_ROOT, 'cgroup.controllers'));
const V2_PARENT = join(CGROUP_ROOT, 'naqla-r2');

function cgroupPathsFor(id: string): string[] {
  return CGROUP_V2 ? [join(V2_PARENT, id)] : CONTROLLERS.map((c) => join(CGROUP_ROOT, c, 'naqla-r2', id));
}

function ensureV2Parent(): void {
  mkdirSync(V2_PARENT, { recursive: true });
  // Enable the controllers for the attempt groups below the parent (and on the root's subtree, when allowed).
  for (const dir of [CGROUP_ROOT, V2_PARENT]) {
    try { writeFileSync(join(dir, 'cgroup.subtree_control'), '+memory +pids +cpu'); } catch { /* already on, or delegated by the host */ }
  }
}
const NOBODY = 65534;

export function assertBackendAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new DomainError('[r2_backend] The namespace development backend is refused in production; production needs a kernel-isolating backend (R2 design §2), not yet approved.');
  }
}

export interface BackendProbe { readonly available: boolean; readonly reasons: readonly string[] }

/** Whether this machine can host the development backend (root, unshare, setpriv, writable cgroup v1). */
export function probeBackend(): BackendProbe {
  const reasons: string[] = [];
  if (process.platform !== 'linux') reasons.push('not linux');
  if (process.getuid?.() !== 0) reasons.push('the trusted runner must start as root to create namespaces and cgroups');
  for (const bin of ['/usr/bin/unshare', '/usr/bin/setpriv']) if (!existsSync(bin)) reasons.push(`missing ${bin}`);
  if (CGROUP_V2) {
    try {
      const have = readFileSync(join(CGROUP_ROOT, 'cgroup.controllers'), 'utf8');
      for (const c of CONTROLLERS) if (!have.split(/\s+/).includes(c)) reasons.push(`cgroup v2 controller ${c} unavailable`);
    } catch { reasons.push('cgroup v2 controllers unreadable'); }
  } else {
    for (const c of CONTROLLERS) if (!existsSync(join(CGROUP_ROOT, c))) reasons.push(`no cgroup v1 controller ${c}`);
  }
  return { available: reasons.length === 0, reasons };
}

export function chromiumPath(): string {
  if (process.env.R2_CHROMIUM) return process.env.R2_CHROMIUM;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
      for (const sub of ['chrome-linux64', 'chrome-linux']) {
        const p = join(base, d, sub, 'chrome');
        if (existsSync(p)) return p;
      }
    }
  }
  throw new DomainError('[r2_backend] No Chromium found for the browser harness (set R2_CHROMIUM).');
}

export interface Attempt {
  readonly id: string;
  readonly dir: string;
  readonly workDir: string;
  readonly wrapper: string;
  readonly limits: RunnerLimits;
  readonly cgroups: readonly string[];
}

/** The directories an attempt needs back, read-only, after the host locations are hidden. */
export type Exposure = 'browser' | 'node';

function exposedDirs(kind: Exposure): string[] {
  if (kind === 'browser') return [dirname(dirname(chromiumPath()))];
  return [dirname(dirname(process.execPath))];
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function prepareAttempt(files: readonly SubmittedFile[], limits: RunnerLimits, exposure: Exposure): Attempt {
  assertBackendAllowed();
  assertRunnerLimits(limits);
  const probe = probeBackend();
  if (!probe.available) throw new DomainError(`[r2_backend] Development backend unavailable: ${probe.reasons.join('; ')}`);

  const id = `a${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
  const dir = join(ROOT_DIR, id);
  const workDir = join(dir, 'work');
  mkdirSync(workDir, { recursive: true, mode: 0o755 });
  chmodSync(ROOT_DIR, 0o711);
  chmodSync(dir, 0o711);
  for (const f of files) {
    const p = join(workDir, f.path);
    mkdirSync(dirname(p), { recursive: true, mode: 0o755 });
    writeFileSync(p, f.content, { mode: 0o644 });
  }

  const cgroups = cgroupPathsFor(id);
  if (CGROUP_V2) ensureV2Parent();
  for (const cg of cgroups) mkdirSync(cg, { recursive: true });
  if (CGROUP_V2) {
    const cg = cgroups[0]!;
    writeFileSync(join(cg, 'memory.max'), String(limits.memoryMiB * 1024 * 1024));
    try { writeFileSync(join(cg, 'memory.swap.max'), '0'); } catch { /* no swap accounting */ }
    writeFileSync(join(cg, 'pids.max'), String(limits.maxProcesses));
    writeFileSync(join(cg, 'cpu.max'), `${limits.cpuPercent * 1000} 100000`);
  } else {
  const [mem, pids, cpu] = cgroups as [string, string, string];
  writeFileSync(join(mem, 'memory.limit_in_bytes'), String(limits.memoryMiB * 1024 * 1024));
  try { writeFileSync(join(mem, 'memory.memsw.limit_in_bytes'), String(limits.memoryMiB * 1024 * 1024)); } catch { /* swap accounting off */ }
  writeFileSync(join(pids, 'pids.max'), String(limits.maxProcesses));
  writeFileSync(join(cpu, 'cpu.cfs_period_us'), '100000');
  writeFileSync(join(cpu, 'cpu.cfs_quota_us'), String(limits.cpuPercent * 1000));
  }

  const ro = exposedDirs(exposure);
  const stage = ro.map((d, i) => `mkdir -p /tmp/.ro/${i}; mount --bind ${shq(d)} /tmp/.ro/${i}`).join('\n');
  const restore = ro.map((d, i) => `mkdir -p ${shq(d)}; mount --move /tmp/.ro/${i} ${shq(d)}; mount -o remount,bind,ro ${shq(d)}`).join('\n');
  const hide = ['/home', '/root', '/var', '/run', '/srv', '/mnt', '/media', '/opt'];
  const inner = `set -e
W="$0"
mount --make-rprivate /
mount -t tmpfs -o size=${limits.diskMiB}m,mode=1777,nosuid,nodev tmpfs /tmp
mkdir -p /tmp/work /tmp/home
mount --bind "$W" /tmp/work
mount -o remount,bind,ro,nosuid,nodev /tmp/work
${stage}
for d in ${hide.join(' ')}; do if [ -d "$d" ]; then mount -t tmpfs -o size=1m,mode=755,nosuid,nodev tmpfs "$d"; fi; done
${restore}
rmdir /tmp/.ro/* /tmp/.ro 2>/dev/null || true
mount -o remount,bind,ro /
mount -t tmpfs -o size=${Math.min(limits.diskMiB, 128)}m,mode=1777,nosuid,nodev tmpfs /dev/shm
if [ -d /sys/fs/cgroup ]; then mount -t tmpfs -o size=1m,ro tmpfs /sys/fs/cgroup; fi
chown ${NOBODY}:${NOBODY} /tmp/home
cd /tmp/work
exec env -i HOME=/tmp/home PATH=/usr/bin:/bin LANG=C.UTF-8 setpriv --reuid=${NOBODY} --regid=${NOBODY} --clear-groups --no-new-privs --inh-caps=-all --bounding-set=-all -- "$@"`;
  const wrapper = join(dir, 'enter.sh');
  writeFileSync(wrapper, `#!/bin/bash
set -e
${cgroups.map((cg) => `echo $$ > ${shq(join(cg, 'cgroup.procs'))}`).join('\n')}
exec /usr/bin/unshare --net --pid --ipc --uts --mount --fork --mount-proc -- /bin/bash -c ${shq(inner)} ${shq(workDir)} "$@"
`, { mode: 0o700 });
  return { id, dir, workDir, wrapper, limits, cgroups };
}

function cgroupPids(cg: string): number[] {
  try {
    return readFileSync(join(cg, 'cgroup.procs'), 'utf8').split('\n').filter(Boolean).map(Number);
  } catch { return []; }
}

/** Kills everything the attempt started and removes every trace of it. Safe to call twice. */
export function cleanupAttempt(a: Attempt): { killed: number } {
  let killed = 0;
  for (let round = 0; round < 20; round++) {
    const live = new Set(a.cgroups.flatMap(cgroupPids));
    if (live.size === 0) break;
    for (const pid of live) { try { process.kill(pid, 'SIGKILL'); killed++; } catch { /* gone */ } }
    execFileSync('/bin/sleep', ['0.05']);
  }
  for (const cg of a.cgroups) { try { rmSync(cg, { recursive: false, force: true }); } catch { try { execFileSync('/bin/rmdir', [cg]); } catch { /* busy */ } } }
  rmSync(a.dir, { recursive: true, force: true });
  return { killed };
}

/**
 * Removes attempts left behind by a runner that was killed mid-attempt (kills their processes first).
 * Run at worker start; an attempt older than `olderThanMs` cannot still be legitimately running.
 */
export function sweepStaleAttempts(olderThanMs = 10 * 60 * 1000): number {
  let swept = 0;
  const ids = new Set<string>();
  if (existsSync(ROOT_DIR)) for (const n of readdirSync(ROOT_DIR)) ids.add(n);
  for (const c of CGROUP_V2 ? ['.'] : CONTROLLERS) {
    const base = CGROUP_V2 ? V2_PARENT : join(CGROUP_ROOT, c, 'naqla-r2');
    if (existsSync(base)) for (const n of readdirSync(base)) if (/^a[0-9a-z]+$/.test(n)) ids.add(n);
  }
  for (const id of ids) {
    if (!/^a[0-9a-z]+$/.test(id)) continue;
    const ts = parseInt(id.slice(1, 9), 36);
    if (Number.isFinite(ts) && Date.now() - ts < olderThanMs) continue;
    cleanupAttempt({ id, dir: join(ROOT_DIR, id), workDir: join(ROOT_DIR, id, 'work'), wrapper: '', limits: DEFAULT_LIMITS_FOR_SWEEP, cgroups: cgroupPathsFor(id) });
    swept++;
  }
  return swept;
}

/** Memory high-water mark of the attempt (for calibration). */
export function attemptPeakMemoryMiB(a: Attempt): number | null {
  try { return Math.round(Number(readFileSync(join(a.cgroups[0]!, CGROUP_V2 ? 'memory.peak' : 'memory.max_usage_in_bytes'), 'utf8')) / 1048576); } catch { return null; }
}

export function attemptOomKilled(a: Attempt): boolean {
  try {
    if (CGROUP_V2) return /oom_kill [1-9]/.test(readFileSync(join(a.cgroups[0]!, 'memory.events'), 'utf8'));
    return /oom_kill [1-9]/.test(readFileSync(join(a.cgroups[0]!, 'memory.oom_control'), 'utf8')) || Number(readFileSync(join(a.cgroups[0]!, 'memory.failcnt'), 'utf8')) > 0;
  } catch { return false; }
}

export interface ProcessRun { code: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }

const MAX_CAPTURE = 64 * 1024;

/** Runs one command inside the attempt's sandbox; the wall-clock limit is enforced from outside. */
export function runInSandbox(a: Attempt, argv: readonly string[], opts: { timeoutMs?: number | undefined } = {}): Promise<ProcessRun> {
  const timeoutMs = opts.timeoutMs ?? a.limits.wallSeconds * 1000;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(a.wrapper, argv as string[], { stdio: ['ignore', 'pipe', 'pipe'], env: {} });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d: Buffer) => { if (stdout.length < MAX_CAPTURE) stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < MAX_CAPTURE) stderr += d.toString('utf8'); });
    const timer = setTimeout(() => {
      timedOut = true;
      for (const cg of a.cgroups) for (const pid of cgroupPids(cg)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout: stdout.slice(0, MAX_CAPTURE), stderr: stderr.slice(0, MAX_CAPTURE), timedOut, durationMs: Date.now() - started });
    });
  });
}

/** An executable that Playwright can launch as "Chromium": it enters the attempt's sandbox first. */
export function chromiumEntry(a: Attempt): string {
  const p = join(a.dir, 'chromium.sh');
  writeFileSync(p, `#!/bin/bash\nexec ${shq(a.wrapper)} ${shq(chromiumPath())} "$@"\n`, { mode: 0o700 });
  return p;
}
