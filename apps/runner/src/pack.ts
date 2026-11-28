/**
 * Test pack contract. A pack is team-written test content for one activity; it is CANDIDATE until a named expert
 * approves it. Tests run in the TRUSTED driver: the graduate's code only ever runs inside the sandboxed browser page,
 * and every assertion — and every expected value — stays outside it, so the code can neither read nor forge results.
 */
import type { TestLayer, TestMode, SubmittedFile } from '@naqla/domain';

export interface Viewport { readonly width: number; readonly height: number }

export interface LayoutMetrics {
  /** Full scrollable content width / height, measured by the browser engine (CDP), not by page JavaScript. */
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/** What a test can do. Every query here is answered by the engine or an isolated world, never by page globals. */
export interface PageDriver {
  /**
   * The attempt's input seed. Tests derive their varied inputs from it (viewport widths, names, addresses, data
   * records), so the values differ from run to run and cannot be special-cased, yet a run can be reproduced.
   */
  readonly seed: number;
  /** Opens a page of the submission at a viewport (default 1280×800). Network outside the submission is blocked. */
  open(path?: string, viewport?: Viewport): Promise<void>;
  layout(): Promise<LayoutMetrics>;
  /**
   * Evaluates an expression in an ISOLATED world: same DOM, separate JavaScript globals, so the page cannot patch
   * what the test reads. The expression must return JSON-serialisable data.
   */
  inspect<T = unknown>(expression: string): Promise<T>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
  /** Chooses an option of a <select> as a user would (trusted input events from the engine). */
  selectOption(selector: string, value: string): Promise<void>;
  /** The element that has focus, described from the isolated world. */
  focused(): Promise<{ tag: string; id: string; text: string; outlineVisible: boolean } | null>;
  wait(ms: number): Promise<void>;
  /** Waits until the isolated-world expression is truthy, or the timeout passes (returns false). */
  waitFor(expression: string, timeoutMs?: number): Promise<boolean>;
  /** Makes the next requests for a submission data file fail or be delayed (data-state tests). */
  failRequestsTo(pathSuffix: string, mode: 'error' | 'slow' | 'empty' | 'ok'): void;
  /**
   * Serves different content for a submission file (e.g. other data in `data/tasks.json`) so a test can vary its
   * inputs and tell real behaviour from hard-coded output. The page sees the input only, never what is expected.
   */
  overrideFile(pathSuffix: string, content: string): void;
  /** Uncaught page errors since the last open (messages only, truncated). Observed, not returned to the graduate. */
  pageErrors(): readonly string[];
}

/**
 * `notApplicable`: the state the test needs was never reached (e.g. no error state, so no retry control to try). The
 * runner reports it as `skipped`: never a pass, never a fail — the defect that blocked it is measured by its own test.
 */
export interface TestOutcomeReport { readonly pass: boolean; readonly notApplicable?: boolean; readonly noteAr?: string }

export interface PackTest {
  /** Neutral id, e.g. `responsive.page_width_360`. Must not name a planted defect or the expected value. */
  readonly id: string;
  readonly criterionKey: string;
  readonly layer: TestLayer;
  readonly mode: TestMode;
  readonly labelAr: string;
  readonly run: (page: PageDriver) => Promise<TestOutcomeReport>;
}

/** A static check reads source TEXT only (never executes it) — code-quality and gaming signals. */
export interface StaticCheck {
  readonly id: string;
  readonly criterionKey: string;
  readonly layer: TestLayer;
  readonly mode: TestMode;
  readonly labelAr: string;
  readonly run: (files: readonly SubmittedFile[], starter: readonly SubmittedFile[]) => TestOutcomeReport;
}

export interface TestPack {
  readonly activityId: string;
  readonly version: string;
  readonly status: 'candidate';
  /** The page a browser test opens by default. */
  readonly entry: string;
  readonly tests: readonly PackTest[];
  readonly staticChecks: readonly StaticCheck[];
  /** Criteria the pack deliberately leaves to a person (documented, never tested). */
  readonly humanOnlyCriteria: readonly { readonly criterionKey: string; readonly whyAr: string }[];
}
