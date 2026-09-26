/* NAQLA — sample application data
 *
 * BINDING RULE (Handoff §9): every readiness percentage, delta, evidence count,
 * skill count, chain stage, progress value, deliverable count and time estimate
 * is DYNAMIC APPLICATION DATA. None of these numbers are UI constants.
 * This module stands in for the future scoring/evidence domain layer.
 * Replace it with real API responses — the UI must not be touched.
 *
 * Demo persona (Handoff §1): Sara — target role Frontend Developer.
 * Frontend Developer is only a SAMPLE role. Nothing in the UI, components or
 * copy may be hard-coded to Frontend, React or JavaScript.
 */
window.NAQLA_DATA = {
  meta: { source: 'sample', generatedAt: null },

  user: { displayName: 'سارة', initial: 'س', locale: 'ar' },

  goal: {
    // Comes from a role_definition record — never invented requirements (§1)
    roleId: 'role_frontend_dev',
    roleLabelEn: 'Frontend Developer',
    reviewStatus: 'reviewed',
    sourceLabel: 'تعريف دور مُراجَع'
  },

  // Readiness indices — internal NAQLA rubric, not a hiring score (§9)
  scores: {
    profile:  { value: 71, delta: null, note: 'ملفك بدأ يثبت نفسه بدليل واحد مُقيَّم.' },
    cv:       { value: 74, delta: null, note: 'بند سيرة واحد مدعوم بدليل، وواحد ينتظر تقييمًا.' },
    linkedin: { value: 68, delta: 4,    note: 'أضفتِ مشروعًا مُقيَّمًا وحدّثتِ الـHeadline.' }
  },

  // Evidence states: gap · self_reported · practiced · demonstrated · verified (§8)
  skills: [
    { id: 'sk_state',      name: 'إدارة حالة الواجهة', state: 'demonstrated',  source: 'نشاط مُقيَّم · لوحة مهام تفاعلية', evidenceCount: 1,
      onCv: true,  onLinkedIn: true,  roleDemand: null },
    { id: 'sk_testing',    name: 'اختبار الواجهات',    state: 'practiced',     source: 'مشروع شخصي · متتبّع عادات', evidenceCount: 0,
      proving: true, onCv: 'project', onLinkedIn: false, roleDemand: '7/10' },
    { id: 'sk_components', name: 'بناء المكونات',      state: 'practiced',     source: 'مشروع التخرج', evidenceCount: 0,
      onCv: 'project', onLinkedIn: false, roleDemand: null },
    { id: 'sk_css',        name: 'CSS متقدم',          state: 'self_reported', source: 'مُعلنة ذاتيًا · لا مشروع يُظهرها', evidenceCount: 0,
      onCv: false, onLinkedIn: false, roleDemand: null },
    { id: 'sk_a11y',       name: 'الأداء وإمكانية الوصول', state: 'gap',       source: null, evidenceCount: 0,
      next: true,  onCv: false, onLinkedIn: false, roleDemand: '9/10' },
    { id: 'sk_api',        name: 'العمل مع API',       state: 'gap',           source: null, evidenceCount: 0,
      onCv: false, onLinkedIn: false, roleDemand: '6/10' }
  ],

  nextAction: {
    kicker: 'خطوتك التالية جاهزة',
    estimateMinutes: 5,
    title: 'حدّثي الـHeadline في لينكدإن — صار مدعومًا بدليل.',
    reason: '«مطوّرة واجهات أمامية · إدارة حالة واجهة مُثبتة». الصياغة جاهزة، وهي التعديل الذي يرفع لينكدإن أكثر من أي شيء آخر.',
    ctaLabel: 'عرض الصياغة',
    ctaHref: 'profile-linkedin.html'
  },

  lastImprovement: {
    when: 'أمس',
    title: '«لوحة مهام تفاعلية» قُيّمت',
    body: 'إدارة الحالة انتقلت من «لا دليل» إلى Demonstrated. نتج عنها بند سيرة، ومهارة لينكدإن، ومسودة دراسة حالة.',
    transition: { from: 'No evidence', to: 'Demonstrated' },
    assets: ['بند سيرة', 'مهارة لينكدإن', 'دراسة حالة']
  },

  projects: [
    { id: 'p1', title: 'لوحة مهام تفاعلية', kind: 'نشاط منصة', status: 'evidenced',
      stage: 5, deliverables: { done: 4, total: 4 }, skills: ['sk_state'], updated: 'أمس' },
    { id: 'p2', title: 'متتبّع عادات', kind: 'مشروع شخصي', status: 'paused',
      stage: 2, deliverables: { done: 2, total: 6 }, skills: ['sk_components','sk_api'], updated: 'منذ ٣ أيام' },
    { id: 'p3', title: 'صفحة معطوبة — تشخيص وإصلاح', kind: 'نشاط منصة', status: 'in_progress',
      stage: 3, deliverables: { done: 1, total: 5 }, skills: ['sk_components'], updated: 'اليوم' }
  ],

  // Chain: Project → Progress → Skill → Evidence → Achievement → Asset (§7)
  chainLabels: ['مشروع', 'تقدّم', 'مهارة', 'دليل', 'إنجاز', 'أصل'],

  notifications: [
    { id: 'n1', type: 'success',     text: 'تم إنشاء دليل جديد: إدارة الحالة · Demonstrated', action: 'اعرضي ما تغيّر', href: 'skills.html' },
    { id: 'n2', type: 'improvement', text: 'لينكدإن تحسّن +٤ بعد إضافة مشروعك.', action: 'عرض', href: 'profile-linkedin.html' },
    { id: 'n3', type: 'attention',   text: 'مشروعك «متتبّع عادات» متوقف منذ ٣ أيام.', action: 'استئناف', href: 'projects.html' }
  ],

  companion: {
    state: 'new-insight',
    step:   'حدّثي الـHeadline في لينكدإن.',
    why:    'صار لديك دليل يدعم الصياغة الجديدة.',
    after:  'بعدها: التحقق القصير لمهارة «بناء المكونات».',
    chips: ['ماذا ينقصني؟', 'اقترحي بديلًا', 'لماذا هذه الخطوة؟']
  }
};
