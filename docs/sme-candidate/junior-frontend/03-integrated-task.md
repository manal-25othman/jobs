> **DRAFT · NOT SME APPROVED · NOT PUBLISHED · NOT IMPORTED.** Integrated practical assessment (C5 condition 3), Rev. 2.
> - **Adapted from `act_fe_build_interface@0.1.0`** («طلب إجازة»). Its scenario and working criteria are reused (decision pack §H).
> - Durations, weights, thresholds, mandatory flags and the borderline band are SME values.

# INT: `act_fe_integrated_leave_requests` (candidate)

## 1. Specification

| Field | Value |
|---|---|
| Derived from | `act_fe_build_interface@0.1.0` (`source_refs` + `CHANGES.md`) |
| `variant_family` (ENG-2) | `leave_requests_list` |
| `is_validation_activity` | false ("the project", C3) |
| `can_yield_verified` | **false** (D-102) |
| `ai_usage_mode` | `ai_assisted` (disclosure is context only, BR-025) |
| `estimated_minutes` | SME value (0.2.1: 120; with the bug fix and Git, draft 150) |
| Primary skills | css, api_states, debugging |
| Secondary skills | html, js, ui_state, code_reading, version_control, accessibility, technical_explanation, requirements_reading |
| Tasks | `tsk_fe_build_from_brief`, `tsk_fe_fetch_api`, `tsk_fe_data_states`, `tsk_fe_responsive_page`, `tsk_fe_fix_ui_bug`, **`tsk_fe_version_control_flow` (new)** |
| Readiness role | Its **pass** (pass rule J-4) is the fact EXT-1 reads. Its **criteria** feed per-skill paths |

### Inputs

| Key | Status | Learner sees | Private | Content |
|---|---|---|---|---|
| `brief.leave_requests` | adapted from `brief.leave_request` | yes | no | Page for previous leave requests, plus an acceptance list. Contains one deliberate conflict with the API data (sort order) |
| `repo.starter` | **new** | «مادة تُقدَّم مع النشاط» | **yes** (`contains_planted_issue`) | Page shell + `requests.js` that loads the list, with a **planted bug** (§3) |
| `api.mock_requests` | reused | described | behaviour private | 200 (list) · 500 · empty list · slow. Needs ENG-4 |

### Deliverables

| Key | Status | Kind | Mandatory | Feeds |
|---|---|---|---|---|
| `file.index_html`, `file.styles_css`, `file.app_js` | reused | file | yes | html, css, api, ui, debugging |
| `note.data_flow` | reused | text | yes | `code_understanding` |
| `answer.clarification` | reused | text | yes | `judgment_assumption_check` |
| `note.bug_trace` | new | text | yes | `problem_traced` |
| `answer.decisions` | new | text | yes | `decision_clarity` |
| `link.pull_request` + `text.head_sha` | new | link + text | yes | `git_workflow` |
| `answer.git_diff_explained` | new | text | yes | `git_workflow` (G-4) |

## 2. Rubric (values blank)

| # | Criterion | Skill | Mandatory (proposed, SME-25 basis) | Status | Reviewer observes |
|---|---|---|---|---|---|
| 1 | `semantic_structure` | html | yes | reused | ordered headings, landmarks, the list as a list, a labelled filter/control |
| 2 | `responsive_layout` | css | **yes** (was no) | adapted | usable at 360 px and 1024 px with no horizontal scroll |
| 3 | `data_states` | api_states | yes | reused | loading, error with retry, empty and success are each visible and understandable |
| 4 | `state_transitions` | ui_state | yes | reused | state explicit, view follows it; retry resets state; no two contradictory states |
| 5 | `problem_traced` | code_reading | yes | new | `note.bug_trace` names the location in the **starter code** and how it produced the symptom |
| 6 | `root_cause_fixed` | debugging | yes | new | the planted bug fixed at its cause, not hidden |
| 7 | `code_understanding` | js | yes (F2: everyone) | adapted from `explanation_clarity` | `note.data_flow` explains, with reference to **own** code, where state lives and how data reaches the view |
| 8 | `git_workflow` | version_control | yes | new | G-1…G-4 (`02-skills-and-git.md` §3) |
| 9 | `decision_clarity` | technical_explanation | no | new | two decisions, each with a reason |
| 10 | `judgment_assumption_check` | requirements_reading | no | adapted | the brief/API conflict is named and a choice stated |
| 11 | `a11y_basics` | accessibility | no; **never blocks other skills** | new | keyboard path through the controls; visible focus |
| 12 | `deliverables_complete` | — | gate | reused | files and notes present (presence only, not skill evidence) |

**Pass (J-4):**
- PR-1 = gate + mandatory 1–8 + total; or PR-2 = gate + mandatory 1–8.
- Borderline → human review (C4).
- Counts for EXT-1 only when standing, accepted and on an approved non-demo version.

**Not required:** a live modification round (F3), or any AI-specific challenge (F2).

## 3. Planted bug (reviewer-only; SME to confirm)

After a 500 response, the user presses «إعادة المحاولة». The list appears, but the loading indicator stays.
- **Cause:** `isLoading` is set again on retry but cleared only in the first-load success branch.
- **Fixed at the cause:** clearing it on a path common to success and failure.
- **Not credited:** hiding it with CSS, or deleting it.

## 4. Learner brief (Arabic)

**صفحة طلبات الإجازة: بناء وإصلاح وتسليم عبر Pull Request**

**سياق العمل:** يريد فريق الموارد البشرية صفحة يرى فيها الموظف طلبات إجازته السابقة، تُجلب من خدمة داخلية. بدأ زميل العمل على الصفحة ثم انتقل إلى مهمة أخرى، وترك بلاغًا: «بعد فشل التحميل والضغط على إعادة المحاولة، تظهر الطلبات لكن مؤشر التحميل لا يختفي».

**المطلوب منك:**
1. ابني الصفحة ببنية دلالية، واجعليها مقروءة على الجوال والحاسوب دون تمرير أفقي.
2. اعرضي حالات البيانات كلها: جارٍ التحميل، وخطأ مع إمكانية إعادة المحاولة، ولا طلبات، والطلبات.
3. حدّدي أين سبب البلاغ في الكود المُقدَّم ولماذا أنتج هذا العَرَض، ثم أصلحيه من سببه.
4. اشرحي في ملاحظة قصيرة، بالإشارة إلى كودك، أين تُحفظ الحالة وكيف تصل البيانات إلى الشاشة.
5. اذكري قرارين اتخذتِهما ولماذا، وإن وجدتِ تعارضًا بين الوصف والبيانات فاذكريه وما قرّرتِه.
6. اعملي على فرع، بإيداعات صغيرة موصوفة، وقدّمي Pull Request يشرح ما تغيّر ولماذا. أرسلي رابطه ورمز آخر إيداع، واشرحي أهم ما غيّرتِه بالإشارة إلى أسطر محددة.

**ملاحظات:**
- استخدام أدوات الذكاء الاصطناعي مسموح، والإفصاح عنه سياق للمراجعة ولا يؤثر في النتيجة.
- المطلوب أن تفهمي ما تسلّمينه وتستطيعي شرحه.
- التسليم لا يمنح مستوى بذاته؛ يُقيَّم عملك وفق معايير معلنة.
