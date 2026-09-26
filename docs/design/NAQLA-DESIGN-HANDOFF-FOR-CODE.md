# NAQLA — Design Handoff for Code (v1.0, frozen)

**Status: NAQLA DESIGN V1.1 — DESIGN READY FOR FREEZE AND ENGINEERING HANDOFF** (2026-09-24). Scope: MVP as listed in NAQLA-CORRECTION P7; Phase 2 — real market insights, LinkedIn photo/banner assessment, advanced onboarding, real LinkedIn import, framework specialization tracks, multi-project Verified logic; Later — direct LinkedIn writing, job marketplace, direct applications, custom portfolio domain, third-party credential verification, full business/entrepreneurship track.

Product: **نَقْلة / NAQLA** — AI Career Operating System. Working name "Career OS" is retired.
Tagline: **من المهارة إلى الدليل. / From skill to evidence.**

This document lets an engineer implement the UI without re-interpreting the design. It references, and does not replace:

- `SRS-001` (functional requirements) and the Data Foundation — product logic, evidence model, agents. Not restated here.
- `NAQLA-BRAND-GUIDELINES.dc.html` (v1.0) — identity, logo A3, tone of voice.
- `NAQLA-UI-DESIGN-SYSTEM.dc.html` (v1.0) — tokens and components, visual reference.
- `NAQLA-APP.dc.html` — the frozen screens (source of truth for layout and copy). `NAQLA-LOGO-FINAL.dc.html` — logo geometry.

No production code, no technical architecture in this document.

---

## 1. Information architecture (final)

**Demo Persona: Sara — Frontend Developer.** Demo data is illustrative. Frontend Developer is only a sample role. No framework, skill, education, certification, or experience should be inferred unless explicitly supplied by user data or supported evidence. Technology claims (a language or framework) require one of: user statement, repository/file that clearly proves it, or documented evidence metadata — otherwise evidence uses generic technical description (shared state, state sync, loading/error handling, UI testing, component behaviour). Every screen in NAQLA-APP / NAQLA-COMPLETION / NAQLA-CORRECTION uses one sample user (Sara, target role Frontend Developer). Nothing in components, data model, role definitions, skill requirements, assessments, learning recommendations, project evidence or CV/LinkedIn recommendations may be hard-coded to Frontend, React or JavaScript. Roles are `role_definition` records (name, required skills + weights, review status, source label); the same UI must serve Data Analyst, BI, Backend, UX/UI, AI roles and any other track without redesign. React is never a default requirement — it appears only when the user adds or proves it (framework specialization is Phase 2).

**Onboarding (7 steps, before first session):** language → target role → **confirm goal** («هذا هو هدفي المهني الأساسي الآن»; role requirements come from the role definition — if incomplete, show «البيانات غير مكتملة بعد», never invented requirements; changeable in Settings › Career goal) → CV upload or start without → first project (or start with an activity) → initial assessment → first next step. Progress label format: «الخطوة N من ٧» / "Step N of 7" (never `N/7`), plus a 7-segment bar; RTL must not invert meaning.

Primary navigation (5, fixed order): **Home · My Career · Projects · Skills & Evidence · Professional Profile**.
Career Companion is a layer over all sections, not a nav item.

Professional Profile sub-tabs: Overview · CV · LinkedIn · Case Studies · Career Assets · (Public profile — later, disabled).

## 2. Page inventory

| # | Page | Route (suggested) | Frozen screen in NAQLA-APP |
|---|---|---|---|
| 1 | Home (Career Decision Home) | `/` | N0 desktop + mobile, EN |
| 2 | My Career / Career Snapshot | `/career` | N1 |
| 3 | Projects | `/projects` | N2 |
| 4 | Mission / Activity workspace | `/projects/:id/activity/:id` | N3 |
| 5 | Skills & Evidence (+ selected-skill panel) | `/skills`, `/skills/:id` | N4 |
| 6 | Profile · Overview (scores, recruiter review, drill-down) | `/profile` | N9 desktop + mobile |
| 7 | Profile · CV | `/profile/cv` | N5 |
| 8 | Profile · LinkedIn | `/profile/linkedin` | N6 |
| 9 | Profile · Case Studies | `/profile/case-studies` | N7 |
| 10 | Profile · Career Assets | `/profile/assets` | N8 |
| 11 | Notifications (toast / banner / badge / nudge) | global | N10 |
| 12 | Career Companion states | global | N11 |
| 13 | Empty / loading / success / attention | global | N12 |
| 14 | Brand moments: auth, first session, settings/about, public case study, exported asset | `/auth`, `/onboarding`, `/settings/about` | N13 |

Each page answers within 5 seconds: goal · where am I · next step · what I've proven · what's missing · what happens next.

## 3. Design tokens

### Color (light theme only, v1)
```
--bg            #F7F6F2   app background
--bg-2          #F2F4EF   secondary bg, tabs track, hover
--surface       #FFFFFF   cards, nav, toasts
--border        #E3E7DF   hairlines, card ring
--text          #1F2A24   primary
--text-body     #3D4A43   paragraphs
--text-2        #5F6B63   labels, secondary
--text-muted    #879089   close icons, dashed gap
--primary       #1F5A4E   next action block, primary CTA, selected nav, links, Demonstrated
--primary-hover #18483F
--primary-tint  #E5F1ED   selected nav bg, "new" chips, tinted rows
--primary-on    #FFFFFF   text on primary
--primary-soft-text #B9D6CC  kicker on primary block
--primary-soft-body #D6E8E1  body on primary block
--mint          #7FC8B4   logo end-dot, companion "new" center ONLY. Never bg or text.
--mint-quiet    #DDF2EA   companion silent center
--sage          #7BAA8B   Practiced half-dot
--sage-tint     #EEF6F1
--success       #2F7D57 / bg #EAF6EF
--info          #6C8799 / bg #EEF4F8 / text #3F5A6B
--attention     #B07A7A / bg #F7ECEC / text #8A5252   (dusty rose; paused, unsupported claim, reminder)
--critical      #A94442 / bg #FCEEEE   (failures only — never for gaps or low scores)
```
Forbidden anywhere: orange, amber, mustard, purple, neon, gradients on UI surfaces.
Screen balance: 70–80 % light neutral/white · 10–15 % soft tints · 5–10 % primary. Exactly one dark (primary) block per screen: the Next Action.

### Typography
```
--font-ar  "IBM Plex Sans Arabic"   --font-en "IBM Plex Sans"   weights 400 / 500 / 600
display 40/1.2/600 (marketing, splash)     h1 26/1.4/500     h2 18–20/1.45/500
body 15/1.75/400     body-sm 13/1.65     label 12/1.4/500     micro 11
button 14/500        numbers 22–34/500, font-variant-numeric: tabular-nums, --font-en
```
600 only for the wordmark and display. Letter-spacing 0 everywhere except wordmark NAQLA (0.18em, uppercase).

### Spacing / radius / shadow
```
space: 4 8 12 16 20 24 28 32 44
page padding: desktop 30px top / 44px sides · mobile 20px
card padding: 22/24 desktop · 16 mobile · gap between cards 20 · inside card 12
radius: 20 card · 16 card-sm · 14 banner/toast · 12 button/input/nav-item · 10 chip-lg · 8 chip · 6 badge · 999 pill
shadow-card:  0 0 0 1px #E3E7DF, 0 1px 2px rgba(31,42,36,.04)
shadow-float: 0 8px 24px rgba(31,42,36,.12), 0 0 0 1px #E3E7DF
focus:        outline 2px #1F5A4E, offset 3px, radius 10
```

## 4. Grid, breakpoints, layout

- **≥ 1200 desktop**: side nav 88px + content. Content grids: two columns `minmax(0,1.15–1.25fr) minmax(0,1fr)`; Skills page `1fr 400px` (selected-skill aside); Mission `1.5fr 380px`.
- **768–1199 tablet**: side nav stays; two-column grids collapse to one; selected-skill aside becomes a bottom sheet; profile tabs scroll horizontally.
- **< 768 mobile**: bottom nav 72px + `env(safe-area-inset-bottom)`; single column; content `padding-bottom: 90px`; Next Action block full-width; progress strip stacks (overall, then CV | LinkedIn side by side).
- Text boxes never fixed height; all grid tracks `minmax(0, …)`; no `white-space: nowrap` on Arabic body copy.

## 5. RTL / LTR

- Direction from `dir` on `<html>`; Arabic is default. All spacing uses logical properties (`inline-start/end`, `margin-inline`, `inset-inline`).
- Mirror: chevrons, arrows, progress direction, chain diagram (Project → … → Asset flows in reading direction), nav order. Do **not** mirror: clock, bell, check, logo mark.
- Logo lockup: mark first in reading direction (right of «نَقْلة» in RTL, left of NAQLA in LTR). Never mirror the mark itself.
- English terms inside Arabic UI (`Headline`, `About`, `Featured`, `Practiced`, `Demonstrated`, `Verified`, `API`, `CSS`, `ATS`) render in `<span dir="ltr" class="term">` with `--font-en`. LinkedIn section names keep their official English form.
- Numbers: percentages, deltas, counts in progress components → Western digits, `--font-en`, tabular, wrapped `dir="ltr"`. Counts inside Arabic sentences → Arabic-Indic digits. Never mix within one line. Percent sign after the number in both languages (`74%`).
- English copy: sentence case, no exclamation marks, second person present tense.

## 6. Navigation

- Desktop side nav: white, `border-inline-end 1px --border`, 88 wide. Items 64×58, icon 18 (Phosphor Regular 1.5px) + label 10. Selected: `--primary-tint` bg + `--primary` text. Hover: `--bg-2`. Logo mark 30px at top (link to Home). Avatar 32 at bottom.
- Mobile bottom nav: 5 items, 72px + safe area, icon 18 + label 10, same states.
- Badges: dot 7px (`--attention`, 2px white ring) = "something new"; numeric pill (min 16, `--attention` bg, white text, `--font-en`) only on **Profile** = count of ready improvements. Never a badge on the logo mark or on the companion.

## 7. Component states

**Button** — primary (`--primary` bg, white), secondary (`--primary-tint` bg, `--primary` text), ghost (`--bg-2`), on-dark (white bg, `--primary` text). Height 44. Hover: `--primary-hover` / `#D6E8E1`; active `translateY(1px)`; disabled opacity .45; loading: 14px spinner inside the button, label "جارٍ…". One primary per screen.
**Input** — 44h, radius 12, ring 1px `--border`; focus ring 2px `--primary`; error ring 1.5px `--critical` + 12px message below.
**Tabs** — track `--bg-2` radius 14 padding 4; item radius 10; selected `--primary` bg white text.
**Filter pills** — radius 999; selected `--primary`; unselected white + ring.
**Card** — white, `shadow-card`, radius 20, padding 22/24. Lists inside a card use hairline rows (`border-bottom 1px --border`, 11–13px vertical padding), never one card per row.
**Next Action block** — the only dark block; `--primary` bg; kicker 12 `--primary-soft-text`; title 20–24/500; reason 13–14 `--primary-soft-body`; CTA white; secondary link `--primary-soft-text`.
**Chain (Project → Progress → Skill → Evidence → Achievement → Asset)** — 6 nodes 10px, connectors 1.5px; done = filled, current = 2px ring, future = 1.5px `--border` ring; dashed ring = "evidence pending". On dark block use white/35 % white.

## 8. Evidence-state semantics (must match Data Foundation)

Canonical progression (forward only in V1): **No evidence (Gap) → Self-reported → Practiced → Demonstrated → Verified.** Practiced never becomes Demonstrated without a passed evaluation; Demonstrated never becomes Verified automatically — Verified needs an independent rule and additional verification source (Phase 2). Learning completion and practice never change evidence state. Career Evidence Report shows only what evidence supports (Demonstrated / Verified as proven; Practiced as "in progress", never as a claim). Per skill/evidence when needed: status · source · evaluation result · human contribution · AI usage disclosure · outputs generated · integrity check. AI usage never lowers a skill by itself — what matters is what the user did, what AI helped with, and whether the user can explain and defend the work.

| State | Meaning | Dot | Wording AR | Wording EN | CV | LinkedIn |
|---|---|---|---|---|---|---|
| gap | role needs it, no activity | 10px dashed `--text-muted` | فجوة | Gap | ✗ | ✗ |
| self_reported | user claimed, no project | 10px outline `--text-2` | مُعلنة ذاتيًا | Self-reported | ✗ (flag if present) | ✗ |
| practiced | appears in a user project, not evaluated | half-filled `--sage` | ظهرت في مشروع · Practiced | Practiced | as project description only | ✗ (mention in project) |
| demonstrated | evaluated activity passed | filled `--primary` | مُثبتة بدليل · Demonstrated | Demonstrated | ✓ bullet | ✓ skill |
| verified | second-project technical review | seal icon `--primary` | موثّقة · Verified | Verified | ✓ | ✓ |

### Canonical transition (implement exactly; ordinal 0→4)
```
No evidence (0) → Self-reported (1) → Practiced (2) → Demonstrated (3) → Verified (4)
```
- Every normal user activity moves a skill **forward or keeps it**; it never moves it backward. Short check / validation activity: `practiced → demonstrated`. Evaluated platform activity: `(any ≤ 2) → demonstrated`. Second-project technical review: `demonstrated → verified`. Adding a skill manually: `no evidence → self_reported`. Linking a project that uses it: `self_reported → practiced`.
- Backward movement (`downgrade`, `revoke`, `review`) is **not** in v1.0. Do not model or render it. If added later it is an explicit, labelled review state, never a side-effect of an activity.
- Rendering rule: write transitions as `from → to` inside `<span dir="ltr">` (isolated bidi run) so the arrow never reverses visually in RTL. Compare ordinals in code; never derive direction from string order in the UI.
- UI copy for a promotion: «Practiced → Demonstrated» / «ظهرت في مشروع → مُثبتة بدليل». Never «Demonstrated → Practiced».

- My Career section label is «أهم ثلاث نقاط تحتاج تقدّمًا» / "Top three things that need progress" — never "gaps" when the list contains a Practiced or Self-reported skill; "gap" is reserved for the `gap` state.

Rules: never write «أتقنت» / "mastered". Practiced ≠ proven; self-reported ≠ proven. A skill with `self_reported` listed in the user's CV as expertise is an **unsupported claim** → attention state + recruiter note. Skill level bar: 4 cells (0–4 = gap/self/practiced/demonstrated/verified); cell 1 dashed when gap; "being proven" = current cell striped.

## 9. Progress / score semantics

**Fixed disclaimer, shown with every score (AR/EN):** «مؤشر جاهزية داخلي من نقلة، وليس درجة توظيف أو ضمان قبول.» / "An internal NAQLA readiness indicator — not a hiring score or a guarantee." Scores come from an internal rubric, not a labor-market prediction.

**Re-assessment loop (CV and LinkedIn):** Assessment → recommendations (ranked by impact, each traceable to a field/evidence) → **Preview** (current vs. suggested, optional edit) → **user approval** → apply (CV: in Builder; LinkedIn: user copies and applies externally in MVP) → re-assess → before/after (`68% → 73%`) stored as a version. No system-generated professional wording (Headline, About, CV bullet, project description, summary) is ever applied without explicit user approval. Buttons that lead to a change are labelled «معاينة» / "Preview", never «تطبيق» directly.

**Data source rule (binding):** every displayed readiness percentage (Profile / CV / LinkedIn), score delta (`+4`, `+3` …), evidence count, skill count, chain stage, progress value, deliverable count and time estimate is **dynamic application data** supplied by the future scoring/evidence domain layer. None of the numbers in the frozen screens (71 %, 74 %, 68 %, 2/6, 4/4, +4 …) are UI constants — they are sample data for the mockups and must not be hard-coded. The UI renders whatever the domain layer returns and shows the corresponding empty/loading state when data is absent.

- Three scores: **Professional Profile**, **CV**, **LinkedIn**. All are NAQLA internal readiness indices. UI must state this once per screen (`مؤشر جاهزية داخلي من نقلة — ليس تقييمًا من لينكدإن ولا ضمانًا للتوظيف`).
- Display: label + number (`--font-en`, tabular) + 7px bar + one explanatory line + **«كيف حُسبت؟ / How is this calculated?»** (button, toggles drill-down inline; label becomes «إخفاء التفاصيل»).
- Drill-down contents (CV): role alignment · summary · projects · achievements · skills · evidence-backed claims · ATS structure — each with status word (ضعيف/متوسط/جيد/قوي) **and a reason sentence**. Second column: supported now / waiting for evaluation / unsupported / the next action that moves the score most (with expected delta).
- LinkedIn drill-down categories: target-role alignment · evidence-backed claims · core sections complete (Headline, About, Experience, Education, Projects, Skills, Featured, Certifications) · professional positioning · projects & education.
- Scores change only from: project completed · skill demonstrated · evidence created · achievement generated · CV updated · LinkedIn updated. Never from filling fields alone. Delta chip `+N` (`--success` on `--success-bg`) appears after the bar animation and persists for the session; explanation line: «+4 — أضفتِ مشروعًا مُقيَّمًا وحدّثتِ الـHeadline».
- Progress copy is evidence-based: with 2/6 skills say «بدأ ملفك يثبت نفسه: مهارة مُثبتة، ثلاث تنتظر دليلًا» — never "halfway".
- Recruiter-style review: 3–4 items, each = observation + why + which score it moves + delta. Every item must trace to a concrete field/evidence in the user's data. No agent names in UI.

## 10. Notifications

Semantic color contract (frozen): **green `--success`** = success / evidence created / completed · **`--primary` teal** = new improvement available · **neutral / `--info` blue-gray** = informational · **rose `--attention`** = paused, unsupported claim, reminder, attention-required · **`--critical`** = failed save, destructive confirm, hard errors only. **No orange, amber or mustard anywhere in the product.**

- Types: `success` (dot `--success`), `improvement` (dot `--primary`), `reminder/attention` (dot `--attention`), `info` (dot `--info`). `critical` only for failures.
- **Toast**: white, `shadow-float`, radius 14, 8px color dot + 13px text + optional action link. One at a time (queue); 4s auto-dismiss (persist while hovered/focused; 8s if it has an action). Desktop: bottom-start, 24px above companion. Mobile: above bottom nav + safe area, full width − 32.
- **Contextual banner**: one per screen, top of content, tinted bg (`--success-bg` for new evidence, `--attention-bg` for paused, `--bg-2` for info) with 28px icon square, text, action link, × (persists until action/dismiss; dismissed state remembered per event).
- **Badge**: see §6.
- **Companion nudge**: see §11. Never more than one nudge visible.
- Copy examples (frozen): «تم إنشاء دليل جديد: إدارة الحالة · Demonstrated» · «لينكدإن تحسّن +٤ بعد إضافة مشروعك.» · «مشروعك «متتبّع عادات» متوقف منذ ٣ أيام.» · «لديك مهارة جديدة جاهزة للعرض.»

## 11. Career Companion

**One assistant in the UI: «الرفيق المهني» / Career Companion.** Internally the orchestration layer selects a mode/agent specialization per context — `recruitment` · `technical` · `personal_branding` · `business` (reserved, Later) · `motivation_progress` — and the UI may show a mode label («بعين مسؤول توظيف» · «مراجعة تقنية» · «تحسين التقديم المهني»), never a separate persona, name or bot.

Mark: 44px circle `--primary`, inner dot 12px. Derived from logo A3 (the mint end-dot). Never a robot, face, avatar, chat bubble, or agent name.

| State | Visual | Trigger | Exit |
|---|---|---|---|
| silent | inner dot `--mint-quiet`, no motion | nothing pending | — |
| new-insight | inner dot `--mint`, pulse 2.6s loop (box-shadow ring 0→12px) | new insight available | opened or dismissed |
| nudge | pill (white, `shadow-float`, radius 999): mark 28 + one sentence + one action | insight with a time-boxed action | 8s, first scroll, ×, or action → returns to new-insight |
| expanded | panel 320w: header (mark 22 + «الرفيق المهني» + minimize), three fixed blocks **الخطوة / لماذا / بعدها**, question chips («ماذا ينقصني؟» «اقترحي بديلًا»); no text field by default (appears on «اسألي») | tap mark/nudge | minimize |
| inline insight | inside page: mark 32 + label + 14px paragraph + up to two links | always, one per screen | — |

Positioning / collision: desktop `bottom 28px`, `inset-inline-start 112px` (24px from side nav). Mobile `bottom: calc(72px + env(safe-area-inset-bottom) + 12px)`, `inset-inline-end 16px`, `max-width calc(100% − 32px)`. Must never overlap: primary CTA, focused input, submission area, bottom nav, system safe areas. If its rect intersects any of those → collapse to mark only (44×44) beside, not over. Hidden while keyboard or a bottom sheet is open. Motion: nudge enters with `rise` (8px, 300ms).

## 12. Motion

```
easing: cubic-bezier(.2,.8,.2,1)   (single curve; no bounce/overshoot)
state change (hover, tab, chip): 150–200ms
element enter "rise": opacity 0→1, translateY 8→0, 300ms
progress: counter + bar together 600ms, then delta chip "pop" (scale .6→1, 400ms)
skill level: new cell fills 300ms, label swaps after
evidence card: rise 350ms; seal pop 400ms at +300ms
success: circle pop 450ms; check stroke draw 400ms at +250ms; then "what changed" line rise
new asset: rise 400ms; 1.5px primary ring fades over 2s after 1s
companion pulse: 2.6s loop, only in new-insight
toast: rise in 300ms / fade out 200ms
skeleton: shimmer 1.2s linear
```
`prefers-reduced-motion: reduce` → keep opacity fades (≤200ms), remove translations, scale pops, pulse, shimmer (static skeleton).

## 13. Accessibility

- Text contrast ≥ 4.5:1 (body), ≥ 3:1 (≥ 24px). On tints use the role's dark text token, not the role color. `--primary-soft-text` on `--primary` is for 12px kicker only; body on primary uses `--primary-soft-body`.
- Status never by color alone: evidence states carry shape + text; attention carries triangle icon + text; success carries check.
- Focus visible everywhere (2px `--primary`, offset 3). Full keyboard path through nav → banner → next action → content → companion (companion is last in DOM order, `aria-live="polite"` for nudges).
- Hit targets ≥ 44px on mobile (nav items, buttons, companion, toast action).
- Toasts: `role="status"`; banners: `role="region"` with `aria-label`; critical errors: `role="alert"`.
- Score drill-down: `aria-expanded` on the toggle; content is a real DOM region, not a tooltip.
- Language tags: `lang="ar"` on root, `lang="en"` on `.term` spans and English screens.
- Font sizes never below 11px (micro labels only), body 15/13.

## 14. Empty / loading / error / success

- **Empty**: tinted card (`--bg`), 44px icon square, one-line title in the product voice («لا دراسات حالة بعد — وهذا طبيعي»), one line saying what will create it and from where, one link. Never a blank area.
- **Loading**: skeletons sized to the real content (same radius, same line heights), shimmer; content replaces in place with `rise`. Button-level loading inside the button.
- **Success**: `--success-bg` block with check circle + «تمّ» sentence + «ما تغيّر» line (deltas). Optional undo link in toast.
- **Attention** (`--attention`): paused project, unsupported claim, reminder. Copy names the fix.
- **Error/critical** (`--critical`): save failed, upload failed, destructive confirm. Message + retry. Never for skill gaps or low scores.

## 15. Mobile safe areas

Bottom nav height 72 + `env(safe-area-inset-bottom)`. Content `padding-bottom = 72 + safe + 18`. Companion and toasts stack above the nav: toast above companion when both present (companion collapses to mark). Respect `env(safe-area-inset-top)` for the header; no fixed elements under the status bar.

## 16. Logo assets and usage (A3, locked)

Geometry (160 grid): start dot `circle(40,124) r14`; path `M40 124 C40 70 70 46 104 42`, stroke 20, round caps; end dot `circle(134,40) r10` `--mint`. Gap end-of-path→dot = 0.4 × stroke.

Size classes: `≥ 48px` stroke 20 / r14 / r10 · `24–47px` stroke 22 / r16 / r11 · `≤ 23px` stroke 26 / r18 / r13 **monochrome** (end dot same color as path).

Assets to export (SVG + PNG @1x/2x/3x): `mark-primary` (teal+mint), `mark-mono-charcoal`, `mark-mono-white` (+mint on dark), `mark-favicon-16` (mono teal), `app-icon-1024` (teal bg radius 22 %, mark 60 % width, optically centered slightly above middle), `lockup-ar-horizontal`, `lockup-en-horizontal` (mark left), `lockup-bilingual-stacked`, `wordmark-ar` («نَقْلة» with tashkeel, Plex Arabic 600), `wordmark-en` (NAQLA, Plex 500, 0.18em).
Clear space ½ mark height. Min sizes: mark 16, lockup 96 wide. Never: stretch, rotate, gradient, shadow, recolor, badge on mark, wordmark without tashkeel.
Where the name appears: auth, onboarding/first session, settings › about, splash, public case study footer, exported/shared assets. Inside the app the mark alone; nav items keep icons.

## 17. Design Freeze Checklist

- [x] IA and navigation fixed (5 sections + Companion layer; Profile sub-tabs)
- [x] Brand: name, tagline, logo A3 geometry and size classes, lockups, do/don't
- [x] Color tokens (no orange/amber), typography, spacing, radius, shadow, focus
- [x] Breakpoints and RTL/LTR rules incl. embedded-term and number handling
- [x] All components with states (button, input, tabs, nav, card, next-action, chain, chips, badges)
- [x] Evidence-state semantics and wording table, canonical forward-only transition (0→4), RTL-safe arrow rendering
- [x] Score semantics, disclaimer, drill-down structure, delta behavior
- [x] Notification types, placement, timing, queueing
- [x] Companion states, positioning and collision rules
- [x] Motion spec + reduced-motion
- [x] Accessibility requirements
- [x] Empty / loading / success / attention / critical patterns
- [x] Mobile safe-area rules
- [x] Frozen screens: 14 pages AR desktop, Home + Profile Overview AR mobile, Home EN desktop, brand moments
- [ ] Open for implementation phase (not blocking freeze): EN mobile and EN versions of secondary pages follow the mirrored rules in §5 — no new design decisions required; final copy review by product owner.
