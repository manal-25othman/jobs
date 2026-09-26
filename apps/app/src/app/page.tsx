import Link from 'next/link';
import { EVIDENCE_STATES, INVARIANTS, DOMAIN_RULESET_VERSION } from '@naqla/domain';

/**
 * Entry point for Vertical Slice 1.
 *
 * Not a migration of the frozen Home screen — that screen shows scores,
 * projects, a companion and a skills grid, none of which this slice builds.
 * Migrating it would mean rendering data that does not exist yet.
 */
export default function Home() {
  return (
    <main className="wrap">
      <h1>نَقْلة</h1>
      <p className="body-sm muted">من المهارة إلى الدليل. / From skill to evidence.</p>

      <section className="next-action">
        <span className="kicker">الشريحة الأولى · المسار كاملًا</span>
        <h2>من عمل حقيقي إلى دليل مُقيَّم، ثم إلى مخرج مهني قابل للدفاع عنه</h2>
        <p>
          الهدف ← المشروع ← التسليم ← التقييم ← حالة الدليل ← بند السيرة ← تقرير الأدلة.
        </p>
        <div>
          <Link className="btn btn--on-dark" href="/goal">ابدئي</Link>
        </div>
      </section>

      <section className="card">
        <h2>ما هو مفروض في هذه النسخة</h2>
        <div className="rows">
          <p className="body-sm">
            الثوابت المفروضة: <span className="num">{INVARIANTS.length}</span> — في النطاق وفي قاعدة البيانات معًا.
          </p>
          <p className="body-sm">
            سلّم الدليل: <span className="transition" lang="en">{EVIDENCE_STATES.join(' → ')}</span>
          </p>
          <p className="body-sm">
            إصدار قواعد النطاق: <span className="term" lang="en">{DOMAIN_RULESET_VERSION}</span>
          </p>
        </div>
        <p className="disclaimer">
          القيم أعلاه مقروءة من <span className="term" lang="en">@naqla/domain</span> ولا تُعاد كتابتها هنا.
          ولا يُستدعى أي نموذج لغوي في هذه الشريحة.
        </p>
      </section>

      <section className="card">
        <h2>ما لم يُبنَ بعد</h2>
        <p className="body-sm muted">
          لا نسب جاهزية، ولا بنّاء سيرة، ولا لينكدإن، ولا مركز تعلّم، ولا تنبيهات، ولا رفيق مهني.
          النموذج البصري المُجمَّد باقٍ في <span className="term" lang="en">apps/web/</span> مرجعًا، ولم تُنقل شاشاته.
        </p>
      </section>
    </main>
  );
}
