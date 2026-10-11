> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Candidate specification for the integrated practical assessment (C5 condition 3).
> - Durations, thresholds, weights, mandatory flags and the borderline band are **SME values** (V-4, V-6), not set here.
> - Private inputs are described for reviewers only.

# Integrated practical task: `act_fe_integrated_junior` (candidate)

## 1. Specification

| Field | Candidate value |
|---|---|
| `code` | `act_fe_integrated_junior` |
| `level` | junior |
| `variant_family` (EXT-2 field, proposed) | `integrated_support_tickets` |
| `is_validation_activity` | false (this is the "project" in C3) |
| `can_yield_demonstrated` | true, only through an approved non-demo rubric and the authorized basis (D-118) |
| `can_yield_verified` | **false** (D-102) |
| `ai_usage_mode` | `ai_assisted` (allowed; disclosure is context, never a penalty, BR-025) |
| `estimated_minutes` | **V-6**: SME to set; first plan range 150–180 |
| Primary skills (declared) | `skl_css_responsive`, `skl_api_data_states`, `skl_frontend_debugging` (3) |
| Secondary skills (declared) | html, js, ui_state, code_reading, version_control, accessibility, technical_explanation |
| Readiness role | Its **pass** (pass rule DM-6) is the fact EXT-1 reads. Its **criterion results** are per-skill evidence |

### 1.1 Inputs

| Key | Learner sees | Private? | Content |
|---|---|---|---|
| `brief.support_tickets` | yes | no | The brief (§2) and acceptance list |
| `repo.starter` | «مادة تُقدَّم مع النشاط» until work starts | **yes** (`contains_planted_issue`) | Starter HTML/CSS/JS with a ticket list rendered from state, a status filter, and a **planted bug** (§1.4) |
| `api.mock_tickets` | described as «نقطة نهاية تجريبية» | **yes** (behaviour) | Mock endpoint with scenarios: success (n tickets), empty list, server error (500), slow response. Needs **CAP-4**. Until it exists the activity cannot be delivered as designed, and the UI says so (D-120: materials unavailable, never simulated) |

### 1.2 Deliverables

Mapping is explicit (no positional mapping).

| Key | Kind | Mandatory | Purpose |
|---|---|---|---|
| `file.index_html` | file | yes | Structure |
| `file.styles_css` | file | yes | Responsive layout |
| `file.app_js` | file | yes | Fetch, states, filter, fix |
| `note.bug_cause` | text | yes | Root cause of the planted bug, pointing to the code location |
| `answer.decision_1`, `answer.decision_2` | text | yes | Two decisions in their own code and why |
| `answer.code_walkthrough` | text | yes | Walk through how a status change reaches the screen (`code_understanding`, R1) |
| `link.pull_request` + `text.head_sha` | link + text | yes (Git placed here in every DM-4 option) | Branch, commits, PR. See `02-skills-and-git.md` §3 |
| `answer.git_diff_explained` | text | yes | G-4 |
| *(follow-up round)* `file.app_js@followup`, `note.followup_change` | — | — | Needs **CAP-7**. Not part of the deliverable set until built |

### 1.3 Criteria

Each criterion feeds only its own skill (decision pack §6.2).

| Criterion | Skill | Mandatory (proposed) | Notes |
|---|---|---|---|
| `semantic_structure` | html | proposed yes | Landmarks, heading order, list semantics for tickets, labelled filter |
| `responsive_layout` | css | proposed yes | Configured viewports (SME: which ones). No horizontal overflow |
| `data_states` | api_states | proposed yes | Loading, error (with retry), empty and success each visible and correct |
| `state_transitions` | ui_state | proposed yes | Filter and data states driven by state; retry resets state correctly |
| `root_cause_fixed` | debugging | proposed yes | Planted bug fixed at its cause |
| `cause_located_in_code` | code_reading | proposed yes | `note.bug_cause` names the location and why it produced the symptom |
| `code_understanding` | js | proposed yes under R1 (DM-5) | See §1.5 |
| `git_workflow` | version_control | proposed yes | G-1…G-4 |
| `decision_clarity` | technical_explanation | no | Two decisions explained with a reason |
| `a11y_basics` | accessibility | no; **never blocks other skills** | Keyboard path through filter and retry; visible focus |
| `no_regression` | debugging | no (needs CAP-1 to be fair; reviewer checklist until then) | Filter still works after the fix |
| `deliverables_complete` | — | gate | Presence only (D-118: not skill evidence) |

12 criteria including the gate (≥ 5 ✓).

### 1.4 Planted bug (private; for SME confirmation, V-6)

After a failed load, pressing «إعادة المحاولة» shows the tickets but the loading indicator never disappears. The `loading` flag is set again in the retry path but cleared only in the first-load success branch.

- **Fix at the cause:** clear `loading` in a path common to success and failure.
- **Symptom-hiding fix (not credited):** hiding the indicator with CSS, or removing it.

### 1.5 `code_understanding` (R1) until CAP-7 exists

The SME's method is modification + explanation. Without a follow-up round, the only honest interim is:
- a written walkthrough of the learner's own code (`answer.code_walkthrough`);
- `answer.git_diff_explained`.

**Open item OI-1 (SME):** does this interim suffice for a *blocking* criterion?
- **If not:** `code_understanding` is non-mandatory until CAP-7. This weakens the SME's "blocks" intent.
- **If so:** it stays mandatory, with the interim evidence.

Either way, AI disclosure plays **no** part in the outcome (BR-025).

### 1.6 Pass rule

DM-6: PR-1 (gate + all mandatory + total) or PR-2 (gate + all mandatory).
- The borderline band routes to human review (C4).
- A result is "passed" for EXT-1 only when it is standing, accepted (not `pending_validation`) and on an approved, non-demo version.

## 2. Learner brief (Arabic, candidate)

**العنوان:** لوحة طلبات الدعم: بناء وإصلاح وتسليم عبر Pull Request

**سياق العمل:** فريق الدعم يحتاج صفحة تعرض طلبات الدعم من الخادم، مع تصفيتها حسب الحالة. بدأ زميل العمل عليها ثم انتقل لمهمة أخرى، وترك بلاغًا: «بعد فشل التحميل والضغط على إعادة المحاولة، تظهر الطلبات لكن مؤشر التحميل لا يختفي».

**المطلوب منك:**
1. اجعلي الصفحة متجاوبة وبنيتها دلالية: قائمة الطلبات وعناصر التصفية واضحة على الهاتف والحاسوب.
2. اعرضي حالات البيانات كلها: جارٍ التحميل، وخطأ مع إمكانية إعادة المحاولة، ولا طلبات، والطلبات.
3. أصلحي البلاغ من سببه، واكتبي أين كان السبب ولماذا أنتج هذا العَرَض.
4. اشرحي قرارين اتخذتِهما في كودك ولماذا.
5. اشرحي كيف يصل تغيير الحالة في التصفية إلى ما يظهر على الشاشة، خطوة بخطوة في كودك.
6. اعملي على فرع، بإيداعات صغيرة موصوفة، وقدّمي Pull Request يشرح ما تغيّر ولماذا. أرسلي رابط الـPR ورمز آخر إيداع.

**ملاحظات:**
- استخدام أدوات الذكاء الاصطناعي مسموح؛ الإفصاح عنه سياق للمراجعة وليس سببًا لأي نتيجة.
- المهم أن تفهمي ما تسلّمينه وتستطيعي شرحه.
- التسليم لا يمنح مستوى بذاته؛ يُقيَّم عملك وفق معايير معلنة.
