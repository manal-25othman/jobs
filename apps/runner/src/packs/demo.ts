/** A tiny pack used only by the runner's own tests (activity `act_r2_selftest`). */
import type { TestPack } from '../pack.js';

export const demoPack: TestPack = {
  activityId: 'act_r2_selftest', version: '0.0.1', status: 'candidate', entry: 'index.html', humanOnlyCriteria: [],
  staticChecks: [],
  tests: [
    { id: 'functional.heading', criterionKey: 'c_heading', layer: 'functional', mode: 'automated', labelAr: 'عنوان الصفحة ظاهر',
      run: async (p) => { await p.open(); const t = await p.inspect<string>(`document.querySelector('h1')?.textContent ?? ''`); return { pass: t.trim().length > 0 }; } },
    { id: 'responsive.page_width_360', criterionKey: 'c_responsive', layer: 'responsive', mode: 'automated', labelAr: 'لا تمرير أفقي على عرض 360',
      run: async (p) => { await p.open(undefined, { width: 360, height: 740 }); const m = await p.layout(); return { pass: m.contentWidth <= m.viewportWidth, noteAr: `عرض المحتوى ${m.contentWidth} على شاشة ${m.viewportWidth}` }; } },
    { id: 'functional.counter', criterionKey: 'c_counter', layer: 'functional', mode: 'automated', labelAr: 'الزر يزيد العدّاد',
      run: async (p) => { await p.open(); await p.click('#inc'); await p.click('#inc'); const v = await p.inspect<string>(`document.querySelector('#count')?.textContent ?? ''`); return { pass: v.trim() === '2' }; } },
  ],
};
