/*
 * خدمة وهمية تحاكي خدمة الموارد البشرية الداخلية. لا تعدّلي هذا الملف.
 * الحالة من العنوان: ?scenario=ok | empty | error | slow | flaky
 */
(function () {
  const scenario = new URLSearchParams(window.location.search).get('scenario') || 'ok';
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let calls = 0;

  function serverError() {
    const error = new Error('Request failed with status 500');
    error.status = 500;
    return error;
  }

  async function fetchLeaveRequests() {
    calls += 1;
    await wait(scenario === 'slow' ? 3000 : 400);
    if (scenario === 'error') throw serverError();
    // if (scenario === 'flaky' && calls === 1) throw serverError();
    if (scenario === 'empty') return [];
    const response = await fetch('data/leave-requests.json');
    if (!response.ok) {
      const error = new Error('Request failed with status ' + response.status);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  window.mockApi = { fetchLeaveRequests, scenario };
})();
