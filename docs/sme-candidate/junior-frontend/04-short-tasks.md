> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** The two distinct short practical tasks (C3, F5), Rev. 2.
> - **Both adapted from 0.2.1 activities**, so working content is reused, not discarded (decision pack §H).
> - Durations, weights, thresholds and mandatory flags are SME values.

# Short practical tasks (candidate)

## Task A: `act_fe_short_accessible_registration`

**Derived from `act_fe_debug_improve@0.1.0`** («تسجيل في ورشة»).

| Field | Value |
|---|---|
| `variant_family` | `workshop_registration_form` (different domain, starting code and behaviours from INT) |
| `is_validation_activity` | **true** |
| `can_yield_verified` | false |
| `ai_usage_mode` | `ai_assisted` |
| `estimated_minutes` | SME value (0.2.1: 90; draft 60) |
| Primary skills | html, css, js (unchanged) |
| Secondary skills | accessibility, forms_validation, debugging, code_reading |
| Covers (F5) | semantic HTML, accessibility incl. **forms and keyboard**, responsive, JS validation without a framework |
| Git | not assessed (F4) |

**Inputs (reused):**
- `repo.registration_page` (private): an existing page with the 0.2.1 planted issues:
  - a hidden-overflow mask that hides a width fault;
  - a «زر لا يعمل» complaint whose cause is focus or handler, not the button;
  - an e-mail field that accepts invalid input;
  - non-semantic controls.
- `report.complaints` (private): three user complaints, one describing a symptom rather than a cause.

**Deliverables (reused):**
- `file.index_html`, `file.styles_css`, `file.app_js`;
- `note.root_causes`;
- `answer.explanation` («إحدى الشكاوى تقول "الزر لا يعمل". ما السبب الفعلي الذي وجدتِه، وكيف تأكدتِ؟»).

**Rubric** (values blank; 7 criteria including the gate, ≥ 5 ✓):

| # | Criterion | Skill | Mandatory (proposed) | Status | Reviewer observes |
|---|---|---|---|---|---|
| 1 | `semantic_fixed` | html | yes | reused | buttons are buttons, headings ordered, the form uses form/label |
| 2 | `a11y_keyboard_forms` | accessibility | no; never blocks other skills | adapted from `a11y_basics_fixed` | every control labelled, **error messages tied to their fields**, form usable by keyboard alone, focus visible |
| 3 | `responsive_fixed` | css | yes | reused | no horizontal scroll at 360 px; the mask removed and the width cause fixed; sidebar at 1024 px |
| 4 | `validation_fixed` | js | yes | reused | an invalid e-mail is rejected with a message beside the field; a reasonable check (does not reject common valid addresses); the error is not swallowed |
| 5 | `root_cause_note` | debugging | yes | reused | one line per fault naming the cause, not the symptom |
| 6 | `scope_discipline` | code_reading | no | reused | changes at the fault locations; the page not rewritten |
| 7 | `deliverables_complete` | — | gate | reused | files and note present |

**Integrity checks (reused):**
- `explain_symptom_vs_cause`;
- `planted_hidden_overflow`;
- `deterministic_email_signal`;
- `files_present`.

`followup_change_breakpoint` and `output_consistency_layout` stay `future_deterministic` and inactive (F3: no universal follow-up).

**Learner brief (Arabic):**
> **صفحة التسجيل في الورشة**
> صفحة «تسجيل في ورشة» قائمة تلقّت شكاوى: تنكسر على الجوال، ولا تعمل بلوحة المفاتيح، وتقبل بريدًا غير صالح. مسؤولة التسويق تريد إطلاقها خلال يومين.
> أصلحي البنية الدلالية وإتاحة النموذج (تسميات واضحة، ورسائل خطأ مرتبطة بحقولها، واستخدام كامل بلوحة المفاتيح مع تركيز ظاهر)، والسلوك المتجاوب، والتحقق من البريد، **دون إعادة كتابة الصفحة**.
> اكتبي لكل عطل سطرًا يسمّي سببه لا عَرَضه، وأجيبي: إحدى الشكاوى تقول «الزر لا يعمل»؛ ما السبب الفعلي الذي وجدتِه، وكيف تأكدتِ؟

## Task B: `act_fe_short_read_and_fix`

**Derived from `act_fe_change_request@0.1.0`** («مهام الفريق»).

| Field | Value |
|---|---|
| `variant_family` | `team_tasks_change` (different domain and code base from INT). INT *builds* states from scratch; B *diagnoses* a misclassified state in existing code |
| `is_validation_activity` | **true** |
| `can_yield_verified` | false |
| `ai_usage_mode` | `ai_assisted` |
| `estimated_minutes` | SME value (0.2.1: 90; draft 60) |
| Primary skills | **code_reading, debugging, js** (0.2.1: js, ui_state, api_states) |
| Secondary skills | ui_state, api_states, technical_explanation |
| Covers (F5) | Code Reading of existing code (read, explain, trace), basic debugging, JS; plus UI state and the empty API state |
| Git | not assessed (F4) |

**Inputs (reused):**
- `repo.team_tasks` (private; planted: `app.js` treats an empty list `[]` as an error);
- `request.change` (filter by status + the bug report);
- `api.mock_tasks` (may return an empty list).

**Deliverables:**

| Key | Status | Mandatory |
|---|---|---|
| `file.app_js` | reused | yes |
| `file.index_html` | reused | no |
| `answer.component_explained` («ماذا تفعل الدالة `renderTasks` حين تكون الحالة كذا؟») | **new** | yes |
| `note.decision` (where the problem originates, what changed, the rejected alternative) | reused | yes |
| `answer.explanation` | reused | yes |

**Rubric** (values blank; 8 criteria including the gate, ≥ 5 ✓):

| # | Criterion | Skill | Mandatory (proposed) | Status | Reviewer observes |
|---|---|---|---|---|---|
| 1 | `component_explained` | code_reading | yes | **new** | explains correctly what the given component does with the given state, from the code |
| 2 | `problem_traced` | code_reading | yes | adapted from `code_reading` | `note.decision` names where the empty-as-error problem originates and why; the change is in that place within the existing structure |
| 3 | `root_cause_fixed` | debugging | yes | reused | the "list is empty" condition is fixed at its cause, not hidden (e.g. a try/catch around rendering) |
| 4 | `filter_in_state` | ui_state | yes | reused | the filter changes state and the view follows; one source of truth |
| 5 | `empty_state_correct` | api_states | yes | reused | an empty list and an empty filter result show a state message, not an error |
| 6 | `js_correctness` | js | yes | reused | no accidental globals, rejection handled, no scattered shared mutation |
| 7 | `decision_explained` | technical_explanation | no | reused | names the root cause, what changed and the rejected alternative |
| 8 | `deliverables_complete` | — | gate | reused | script and note present |

**Separation (F1):**
- Criteria 1–2 (Code Reading) and criterion 3 (Debugging) are scored separately.
- A learner who traces correctly but fixes wrongly gets a Code Reading result and no Debugging result, and the other way round.

**Integrity checks (reused):**
- `explain_rejected_alternative`;
- `planted_empty_as_error`;
- `deterministic_state_signal`;
- `edge_empty_after_filter`;
- `files_present`.

`followup_second_filter` stays inactive.

**Learner brief (Arabic):**
> **قائمة مهام الفريق: اقرئي ثم أصلحي**
> قائمة «مهام الفريق» تعمل منذ شهر. صاحب المنتج يطلب: (١) تصفية المهام بالحالة، (٢) إصلاح بلاغ: عند خلو القائمة تظهر رسالة خطأ بدل «لا مهام».
> قبل أن تعدّلي: اقرئي الكود القائم واشرحي ماذا تفعل الدالة `renderTasks` حين تكون الحالة كما في المثال المرفق.
> ثم حدّدي أين ينشأ سبب البلاغ ولماذا، وأصلحيه في موضعه، ونفّذي التصفية ضمن البنية الحالية.
> اشرحي قرارك والبديل الذي رفضتِه.

## Why INT, A and B are distinct (for SME confirmation)

| | INT | A | B |
|---|---|---|---|
| Domain | leave requests | workshop registration | team tasks |
| Starting point | starter shell + planted async-state bug | existing page with 4 planted faults | existing project with a planted state-classification bug |
| Main behaviour assessed | build responsive UI + API states; trace and fix; Git | semantics, accessible form, responsive repair, validation | read and explain a component; trace and fix; state-driven filter |
| API states | builds loading / error / empty / success | — | corrects empty-vs-error classification |
| Code Reading | traces the bug in the starter | (extra: scope) | explains a component + traces |
