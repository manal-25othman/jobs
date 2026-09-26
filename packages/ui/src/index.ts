/**
 * @naqla/ui — shared UI primitives.
 *
 * DELIBERATELY EMPTY IN PHASE 0.
 *
 * The design tokens and components live in the frozen prototype at
 * apps/web/assets/css/. They move here when the screens are rebuilt in
 * Next.js, which is explicitly not Phase 0 work. Copying them now would create
 * two sources of truth for the same values, and the copy would start drifting
 * the moment either side changed.
 *
 * What belongs here later:
 *   - tokens.css, moved (not copied) from the frozen prototype
 *   - the component primitives from components.css, as React components
 *   - the bidi helpers (.term, .num, .transition) as typed wrappers
 *   - the evidence-state visuals, driven by @naqla/domain types so a new state
 *     cannot be rendered without a matching visual
 *
 * What must NOT happen here: a rule. Eligibility, thresholds and transitions
 * come from @naqla/domain. This package decides how something looks, never
 * whether it is true.
 */

export const UI_PACKAGE_STATUS = 'phase-0-empty' as const;
