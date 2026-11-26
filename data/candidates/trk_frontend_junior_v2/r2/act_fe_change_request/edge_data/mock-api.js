/*
 * خدمة وهمية تحاكي خدمة المهام الداخلية للفريق.
 * لا تعدّلي هذا الملف: هو جزء من بيئة التجربة، لا من الكود الذي تعملين عليه.
 *
 * الحالة تُختار من العنوان: ?scenario=ok | empty | error | slow
 */
(function () {
  const scenario = new URLSearchParams(window.location.search).get('scenario') || 'ok';
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchTasks() {
    await wait(scenario === 'slow' ? 2000 : 300);
    if (scenario === 'error') {
      const error = new Error('Request failed with status 500');
      error.status = 500;
      throw error;
    }
    if (scenario === 'empty') return [];
    const response = await fetch('data/tasks.json');
    if (!response.ok) {
      const error = new Error('Request failed with status ' + response.status);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  window.mockApi = { fetchTasks, scenario };
})();
