/**
 * Browser harness: the graduate's page runs in Chromium INSIDE the attempt sandbox; this driver runs outside it.
 *
 *  - The submission is served from memory at http://submission.test/; every other request is aborted and counted.
 *  - Queries go through the engine (CDP) or an isolated world, so page scripts cannot patch what a test reads.
 *  - Each test gets a fresh browser context; each attempt a fresh browser in a fresh sandbox.
 */
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import type { SubmittedFile } from '@naqla/domain';
import type { LayoutMetrics, PageDriver, Viewport } from './pack.js';

export const ORIGIN = 'http://submission.test';
const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8',
};

export async function launchSandboxedBrowser(executablePath: string, timeoutMs: number): Promise<Browser> {
  return chromium.launch({
    executablePath,
    chromiumSandbox: true,
    timeout: timeoutMs,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-extensions', '--disable-background-networking'],
    env: {},
  });
}

export class Driver implements PageDriver {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private worldId: number | null = null;
  private readonly dataModes = new Map<string, 'error' | 'slow' | 'empty' | 'ok'>();
  private readonly errors: string[] = [];
  private readonly overrides = new Map<string, string>();
  blocked = 0;

  constructor(private readonly browser: Browser, private readonly files: readonly SubmittedFile[], private readonly entry: string, private readonly stepTimeoutMs: number, readonly seed: number = 1) {}

  async open(path: string = this.entry, viewport: Viewport = DEFAULT_VIEWPORT): Promise<void> {
    await this.close();
    const ctx = await this.browser.newContext({ viewport, serviceWorkers: 'block', javaScriptEnabled: true, locale: 'ar' });
    this.context = ctx;
    ctx.setDefaultTimeout(this.stepTimeoutMs);
    await ctx.route('**/*', async (route) => {
      const url = route.request().url();
      if (!url.startsWith(`${ORIGIN}/`)) { this.blocked++; return route.abort('blockedbyclient'); }
      const rel = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')) || this.entry;
      const mode = [...this.dataModes.entries()].find(([suffix]) => rel.endsWith(suffix))?.[1] ?? 'ok';
      const override = [...this.overrides.entries()].find(([suffix]) => rel.endsWith(suffix))?.[1];
      const file = override !== undefined ? { path: rel, content: override } : this.files.find((f) => f.path === rel);
      if (mode === 'error') return route.fulfill({ status: 500, body: 'error', contentType: 'text/plain' });
      if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500));
      if (!file) return route.fulfill({ status: 404, body: 'not found', contentType: 'text/plain' });
      const ext = rel.split('.').pop()!.toLowerCase();
      const body = mode === 'empty' && ext === 'json' ? '[]' : file.content;
      return route.fulfill({ status: 200, body, contentType: TYPES[ext] ?? 'application/octet-stream' });
    });
    const page = await ctx.newPage();
    this.page = page;
    page.on('pageerror', (e) => { if (this.errors.length < 20) this.errors.push(String(e.message).slice(0, 160)); });
    page.on('dialog', (d) => { void d.dismiss().catch(() => undefined); });
    this.errors.length = 0;
    await page.goto(`${ORIGIN}/${path}`, { waitUntil: 'load' });
    this.cdp = await ctx.newCDPSession(page);
    const tree = (await this.cdp.send('Page.getFrameTree')) as { frameTree: { frame: { id: string } } };
    const world = (await this.cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'naqla-r2', grantUniveralAccess: false })) as { executionContextId: number };
    this.worldId = world.executionContextId;
  }

  private need(): { page: Page; cdp: CDPSession; worldId: number } {
    if (!this.page || !this.cdp || this.worldId === null) throw new Error('page not open');
    return { page: this.page, cdp: this.cdp, worldId: this.worldId };
  }

  async layout(): Promise<LayoutMetrics> {
    const { cdp } = this.need();
    const m = (await cdp.send('Page.getLayoutMetrics')) as { cssContentSize: { width: number; height: number }; cssLayoutViewport: { clientWidth: number; clientHeight: number } };
    return { contentWidth: Math.round(m.cssContentSize.width), contentHeight: Math.round(m.cssContentSize.height), viewportWidth: m.cssLayoutViewport.clientWidth, viewportHeight: m.cssLayoutViewport.clientHeight };
  }

  async inspect<T = unknown>(expression: string): Promise<T> {
    const { cdp, worldId } = this.need();
    const r = (await cdp.send('Runtime.evaluate', { expression: `(() => (${expression}))()`, contextId: worldId, returnByValue: true, awaitPromise: true, timeout: this.stepTimeoutMs })) as { result: { value?: unknown }; exceptionDetails?: { text?: string } };
    if (r.exceptionDetails) throw new Error(`inspect failed: ${r.exceptionDetails.text ?? 'exception'}`);
    return r.result.value as T;
  }

  async click(selector: string): Promise<void> { await this.need().page.click(selector); }
  async fill(selector: string, value: string): Promise<void> { await this.need().page.fill(selector, value); }
  async selectOption(selector: string, value: string): Promise<void> { await this.need().page.selectOption(selector, value); }
  async press(key: string): Promise<void> { await this.need().page.keyboard.press(key); }
  async wait(ms: number): Promise<void> { await new Promise((r) => setTimeout(r, Math.min(ms, this.stepTimeoutMs))); }

  async waitFor(expression: string, timeoutMs = 3000): Promise<boolean> {
    const until = Date.now() + Math.min(timeoutMs, this.stepTimeoutMs);
    while (Date.now() < until) {
      try { if (await this.inspect<boolean>(`Boolean(${expression})`)) return true; } catch { /* page navigating */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async focused(): Promise<{ tag: string; id: string; text: string; outlineVisible: boolean } | null> {
    return this.inspect(`(() => { const el = document.activeElement; if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const ring = s.boxShadow && s.boxShadow !== 'none';
      return { tag: el.tagName.toLowerCase(), id: el.id || '', text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60), outlineVisible: Boolean(outline || ring) }; })()`);
  }

  failRequestsTo(pathSuffix: string, mode: 'error' | 'slow' | 'empty' | 'ok'): void { this.dataModes.set(pathSuffix, mode); }
  pageErrors(): readonly string[] { return [...this.errors]; }
  overrideFile(pathSuffix: string, content: string): void { this.overrides.set(pathSuffix, content); }
  resetDataModes(): void { this.dataModes.clear(); this.overrides.clear(); }

  async close(): Promise<void> {
    const ctx = this.context;
    this.context = null; this.page = null; this.cdp = null; this.worldId = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }
}
