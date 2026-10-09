'use client';

import type { DisclosureQuestionView } from '../lib/api';

/**
 * The disclosure questionnaire field renderer, MOVED unchanged from the former /project page (graduate
 * journey Phase 2) so the workspace can reuse it. The questionnaire itself is configuration fetched from the API.
 */
/** One configured question. Rendering follows the answer type from configuration; nothing is hard-coded per question. */
export function DisclosureField({ q, value, onChange }: { q: DisclosureQuestionView; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="field__label">{q.promptAr}{q.required ? <span className="chip" style={{ marginInlineStart: 8 }}>مطلوب</span> : null}</span>;
  const help = q.helpAr ? <span className="micro muted">{q.helpAr}</span> : null;
  switch (q.answerType) {
    case 'yes_no':
      return (
        <div className="field">{label}
          <div className="row" style={{ gap: 12 }}>
            {[{ v: true, t: 'نعم' }, { v: false, t: 'لا' }].map((o) => (
              <label key={String(o.v)} className="check-row"><input type="radio" name={q.key} checked={value === o.v} onChange={() => onChange(o.v)} /> <span>{o.t}</span></label>
            ))}
          </div>{help}
        </div>
      );
    case 'single_choice':
      return (
        <div className="field">{label}
          {q.options.map((o) => <label key={o.value} className="check-row"><input type="radio" name={q.key} checked={value === o.value} onChange={() => onChange(o.value)} /> <span>{o.labelAr}</span></label>)}{help}
        </div>
      );
    case 'multi_choice': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">{label}
          {q.options.map((o) => (
            <label key={o.value} className="check-row">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))} /> <span>{o.labelAr}</span>
            </label>
          ))}{help}
        </div>
      );
    }
    case 'text_list':
      return (
        <label className="field">{label}
          <input className="input" value={Array.isArray(value) ? (value as string[]).join('، ') : ''} onChange={(e) => onChange(e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean))} />{help}
        </label>
      );
    default:
      return (
        <label className="field">{label}
          <input className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />{help}
        </label>
      );
  }
}
