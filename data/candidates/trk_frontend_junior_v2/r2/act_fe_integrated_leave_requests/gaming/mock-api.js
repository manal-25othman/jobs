/*
 * خدمة وهمية تحاكي خدمة الموارد البشرية الداخلية. لا تعدّلي هذا الملف.
 * الحالة من العنوان: ?scenario=ok | empty | error | slow | flaky
 */
(function () {
  const scenario = new URLSearchParams(window.location.search).get('scenario') || 'ok';
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let calls = 0;
  const SHIPPED = [{"id": 4011, "type": "annual", "startDate": "2026-02-08", "endDate": "2026-02-12", "days": 5, "status": "approved", "submittedAt": "2026-01-20"}, {"id": 4187, "type": "sick", "startDate": "2026-04-14", "endDate": "2026-04-15", "days": 2, "status": "approved", "submittedAt": "2026-04-14"}, {"id": 4302, "type": "emergency", "startDate": "2026-06-03", "endDate": "2026-06-03", "days": 1, "status": "rejected", "submittedAt": "2026-06-02"}, {"id": 4455, "type": "annual", "startDate": "2026-08-16", "endDate": "2026-08-27", "days": 10, "status": "approved", "submittedAt": "2026-07-05"}, {"id": 4620, "type": "annual", "startDate": "2026-12-20", "endDate": "2026-12-24", "days": 5, "status": "pending", "submittedAt": "2026-11-18"}];

  function serverError() {
    const error = new Error('Request failed with status 500');
    error.status = 500;
    return error;
  }

  async function fetchLeaveRequests() {
    calls += 1;
    await wait(scenario === 'slow' ? 3000 : 200);
    if (scenario === 'error') throw serverError();
    if (scenario === 'flaky' && calls === 1) throw serverError();
    if (scenario === 'empty') return [];
    return SHIPPED.slice();
  }

  window.mockApi = { fetchLeaveRequests, scenario };
})();
