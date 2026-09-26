import { EVIDENCE_STATES, INVARIANTS, DOMAIN_RULESET_VERSION } from '@naqla/domain';
import { CURRENT_API_VERSION, SLICE_1_ENDPOINTS } from '@naqla/contracts';

/**
 * Phase 0 landing page.
 *
 * It renders values imported from @naqla/domain to prove the dependency
 * direction works in the Next.js build too: the UI reads the rules, it does
 * not restate them. No frozen screen has been migrated.
 */
export default function Home() {
  return (
    <main>
      <h1>نَقْلة / NAQLA</h1>
      <p>من المهارة إلى الدليل. / From skill to evidence.</p>

      <h2>Phase 0 — foundations only</h2>
      <p>
        لم تُنقل أي شاشة من النموذج المُجمَّد بعد. هذه الصفحة تثبت اتجاه
        الاعتماد فقط: الواجهة تقرأ القواعد من <code>@naqla/domain</code> ولا
        تعيد تعريفها.
      </p>

      <ul>
        <li>Domain ruleset: <code>{DOMAIN_RULESET_VERSION}</code></li>
        <li>API contract version: <code>{CURRENT_API_VERSION}</code></li>
        <li>Invariants enforced: <code>{INVARIANTS.length}</code></li>
        <li>
          Evidence states:{' '}
          <code>{EVIDENCE_STATES.join(' → ')}</code>
        </li>
        <li>Planned slice-1 endpoints (not implemented): <code>{SLICE_1_ENDPOINTS.length}</code></li>
      </ul>

      <p>
        المرجع البصري المُجمَّد باقٍ في <code>apps/web/</code> ولا يُعدَّل.
      </p>
    </main>
  );
}
