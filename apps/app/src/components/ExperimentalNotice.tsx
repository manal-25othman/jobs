/**
 * D-136 — the one label every DEMO (experimental) activity and result carries: it is not professionally approved,
 * and nothing done on it grants a skill level, job readiness or a career claim. Shown wherever demo content or a
 * result on it appears (catalogue, activity, workspace, My Work, evaluation).
 */
export const EXPERIMENTAL_LABEL_AR = 'محتوى تجريبي غير معتمد مهنيًا';

export function ExperimentalNotice({ kind }: { kind: 'activity' | 'result' }) {
  return (
    <div className="banner banner--attention" role="note" data-testid="experimental-notice">
      <span className="grow">
        <strong style={{ fontWeight: 500 }}>{EXPERIMENTAL_LABEL_AR}</strong>
        {' · '}
        {kind === 'result'
          ? 'نتيجة تجريبية للتجربة الداخلية فقط: لا تمنح مستوى مهارة ولا جاهزية للعمل، ولا تُستخدم في أي ادعاء مهني.'
          : 'للتجربة الداخلية فقط: لم يعتمده خبير، ولا يمنح مستوى مهارة ولا جاهزية للعمل.'}
      </span>
    </div>
  );
}

/** The short chip form, for lists. */
export function ExperimentalChip() {
  return <span className="chip chip--attention" data-testid="experimental-chip">{EXPERIMENTAL_LABEL_AR}</span>;
}
