> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Candidate specifications for the two distinct short validation tasks (C3).
> - Durations, thresholds and mandatory flags are SME values.
> - Each task belongs to a **different variant family** from the integrated task and from each other (EXT-2, I-2), so the same solution cannot satisfy two of them.

# Short validation tasks (candidate)

## Short Task A: `act_fe_short_profile_card`

| Field | Candidate value |
|---|---|
| `variant_family` | `short_profile_card_fetch` (different domain, data shape, layout and state set from `integrated_support_tickets`) |
| `is_validation_activity` | **true** (C3: the distinct short task; EXT-2, I-1) |
| `can_yield_verified` | false |
| `ai_usage_mode` | `ai_assisted` |
| `estimated_minutes` | SME value (draft 45–60) |
| Primary skills | `skl_css_responsive`, `skl_api_data_states` (2; both `is_core` under P-1) |
| Secondary skills | html, js, ui_state, accessibility |
| Git | not placed (DM-4: keeps the task short) |

**Inputs:**
- `brief.profile_card` (visible).
- `api.mock_profile` (private behaviour): success, not found (404), server error, slow. Needs CAP-4.
- No starter code: the learner builds from scratch, unlike the integrated task.

**Deliverables:**

| Key | Kind | Mandatory |
|---|---|---|
| `file.index_html`, `file.styles_css`, `file.app_js` | file | yes |
| `answer.states_explained` | text | yes |

**Criteria:** 7 including the gate (≥ 5 ✓).

| Criterion | Skill | Mandatory (proposed) |
|---|---|---|
| `semantic_structure` | html | yes |
| `responsive_layout` | css | yes |
| `data_states` (loading / not-found / error / success) | api_states | yes |
| `state_transitions` (a "show more / less" toggle and a retry, both state-driven) | ui_state | yes |
| `js_correctness` | js | yes |
| `a11y_keyboard` | accessibility | no; never blocks other skills |
| `deliverables_complete` | — | gate |

**Learner brief (Arabic):**
> **بطاقة عضو الفريق**
> اعرضي بطاقة متجاوبة لعضو فريق تُجلب بياناته من الخادم: الاسم والدور وصورة ونبذة قصيرة مع زر «عرض المزيد / أقل».
> اعرضي كل الحالات: جارٍ التحميل، والعضو غير موجود، وخطأ مع إعادة المحاولة، والبطاقة.
> البطاقة تبقى مقروءة على الهاتف والحاسوب، ويمكن الوصول إلى أزرارها بلوحة المفاتيح.
> اشرحي في فقرة قصيرة كيف تنتقل الواجهة بين الحالات في كودك.

## Short Task B: `act_fe_short_bugfix`

| Field | Candidate value |
|---|---|
| `variant_family` | `short_cart_total_bugfix` (different code base, bug class and data from the integrated task's planted bug) |
| `is_validation_activity` | **true** |
| `can_yield_verified` | false |
| `ai_usage_mode` | `ai_assisted` |
| `estimated_minutes` | SME value (draft 30–45) |
| Primary skills | `skl_frontend_debugging`, `skl_code_reading` (2; both `is_core` under P-1; under P-2 this task would fail `activity_core_primary_skill_count`) |
| Secondary skills | version_control (G-P1, G-P3), technical_explanation |
| Git | placed in **G-P1** and G-P3 |

**Inputs:**
- `repo.cart` (private, `contains_planted_issue`): a small cart page. The total shows «1005» instead of «15» because quantity input values are strings and are concatenated, not added. A second function, `formatPrice`, is used in the code-reading question.
- `report.bug` (visible).

**Deliverables:**

| Key | Kind | Mandatory |
|---|---|---|
| `file.app_js` | file | yes |
| `note.bug_cause` | text | yes |
| `answer.code_reading` («ماذا تفعل الدالة formatPrice ومتى تُستدعى؟») | text | yes |
| `link.pull_request` + `text.head_sha` | link + text | yes in G-P1 / G-P3 |
| `answer.git_diff_explained` | text | yes in G-P1 / G-P3 |

**Criteria:** 7 including the gate (≥ 5 ✓).

| Criterion | Skill | Mandatory (proposed) |
|---|---|---|
| `root_cause_fixed` (converts at the input boundary, not by patching the displayed string) | debugging | yes |
| `cause_located_in_code` | code_reading | yes |
| `code_explained` (formatPrice: what, when, edge case) | code_reading | yes, **assessed even if the fix fails** (Alt. B independence) |
| `no_regression` (reviewer checklist: add, remove, zero quantity) | debugging | no |
| `git_workflow` | version_control | yes where placed |
| `fix_explained` | technical_explanation | no |
| `deliverables_complete` | — | gate |

**Learner brief (Arabic):**
> **إصلاح مجموع السلة**
> بلاغ من مستخدم: «أضفت منتجين، فظهر المجموع 1005 بدل 15».
> أصلحي الخطأ من سببه على فرع جديد، وقدّمي Pull Request يشرح ما تغيّر ولماذا، وأرسلي رابطه ورمز آخر إيداع.
> اكتبي أين كان السبب في الكود ولماذا أنتج هذا الرقم.
> اشرحي ماذا تفعل الدالة `formatPrice` ومتى تُستدعى.

## Why these count as distinct (for SME review, DM-3)

| | Integrated | Task A | Task B |
|---|---|---|---|
| Domain | support tickets | team profile | shopping cart |
| Starting point | starter code + planted bug | from scratch | existing code + different bug class |
| API states | list: loading / error / empty / success | single resource: loading / not-found / error / success | none |
| Bug class | async state not reset | — | type coercion at an input boundary |
| Code reading | own code walkthrough | — | unfamiliar function explained |

**SME question:** are these differences enough that the same solution, or a lightly edited copy, cannot meet the second task's criteria (I-2)?
