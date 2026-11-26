/**
 * Phase B, package 5 (PO decision 6) — the three guidance capabilities and their permission-aware READ tools.
 *
 * No new agent is created: each capability is a narrow use of contracts that already exist (vision registry
 * A01–A19, `docs/agents/05-master-agent-contract-map.md`) and of the two implemented agents behind the gateway.
 *
 *   career_guidance      — A01 (one next step), A02 (Career Snapshot, FR-U-014), A04 via the recruitment agent
 *   learning_guidance    — A07 (registry resource + mandatory practice), A03 via the technical agent
 *   assessment_feedback  — A13 results explained, A15 developmental feedback via the technical agent
 *   improvement_hints    — R1 (code-review guidance): A15 + A03 progressive hints per unmet criterion, never code
 *
 * Every tool READS; none writes. A tool runs as the graduate (row security) or over published/visible content only,
 * and a capability may call only the tools listed for it. A tool never returns assessment-design data (planted
 * defects, reviewer references, reference solutions) or another user's data.
 */

export const GUIDANCE_CAPABILITIES = ['career_guidance', 'learning_guidance', 'assessment_feedback', 'improvement_hints'] as const;
export type GuidanceCapability = (typeof GUIDANCE_CAPABILITIES)[number];

export type ToolScope = 'own_data' | 'visible_content' | 'verified_registry';

export interface GuidanceToolSpec {
  readonly name: 'occupation_profile' | 'skill_explanation' | 'approved_resources' | 'skill_activities' | 'my_progress' | 'my_feedback';
  readonly purposeAr: string;
  readonly scope: ToolScope;
  readonly contract: string;
  readonly capabilities: readonly GuidanceCapability[];
}

export const GUIDANCE_TOOLS: readonly GuidanceToolSpec[] = [
  { name: 'occupation_profile', purposeAr: 'ملف الدور المهني المختار (الغاية، المسؤوليات، المتوقع من المبتدئ)', scope: 'visible_content', contract: 'A02', capabilities: ['career_guidance'] },
  { name: 'skill_explanation', purposeAr: 'شرح المهارة: ما هي، ولماذا يحتاجها الدور، وعلامات إتقانها', scope: 'visible_content', contract: 'A02/A07', capabilities: ['career_guidance', 'learning_guidance', 'improvement_hints'] },
  { name: 'approved_resources', purposeAr: 'موارد التعلّم المتحقَّق منها في السجل، والنشاط التطبيقي بعدها', scope: 'verified_registry', contract: 'A07', capabilities: ['learning_guidance', 'improvement_hints'] },
  { name: 'skill_activities', purposeAr: 'أنشطة الدور التي تتدرّب فيها على المهارة', scope: 'visible_content', contract: 'A07', capabilities: ['career_guidance', 'learning_guidance'] },
  { name: 'my_progress', purposeAr: 'تقدّمك: مستوى التحقق، والأدلة المُقيَّمة، والأعمال الجارية — لك وحدك', scope: 'own_data', contract: 'A01/A02', capabilities: ['career_guidance', 'learning_guidance'] },
  { name: 'my_feedback', purposeAr: 'نتيجة تقييم عملك وملاحظات كل معيار — لصاحب العمل وحده', scope: 'own_data', contract: 'A13/A15', capabilities: ['assessment_feedback', 'improvement_hints'] },
];

export interface CapabilitySpec {
  readonly capability: GuidanceCapability;
  readonly labelAr: string;
  readonly contracts: readonly string[];
  readonly agentType: 'recruitment' | 'technical';
  readonly tools: readonly GuidanceToolSpec['name'][];
}

export const CAPABILITIES: readonly CapabilitySpec[] = GUIDANCE_CAPABILITIES.map((capability) => ({
  capability,
  labelAr: { career_guidance: 'الإرشاد المهني والخطوة التالية', learning_guidance: 'إرشاد التعلّم والتوجيه التقني', assessment_feedback: 'شرح التقييم وطريق التحسين', improvement_hints: 'تلميحات التحسين خطوة خطوة' }[capability],
  contracts: { career_guidance: ['A01', 'A02', 'A04'], learning_guidance: ['A07', 'A03'], assessment_feedback: ['A13', 'A15'], improvement_hints: ['A15', 'A03'] }[capability],
  agentType: capability === 'career_guidance' ? 'recruitment' as const : 'technical' as const,
  tools: GUIDANCE_TOOLS.filter((t) => t.capabilities.includes(capability)).map((t) => t.name),
}));

export function capabilitySpec(c: string): CapabilitySpec {
  const s = CAPABILITIES.find((x) => x.capability === c);
  if (!s) throw new Error(`unknown guidance capability '${c}'`);
  return s;
}

/** A capability may call only its own tools. */
export function assertToolAllowed(capability: GuidanceCapability, tool: GuidanceToolSpec['name']): void {
  if (!capabilitySpec(capability).tools.includes(tool)) throw new Error(`tool '${tool}' is not available to capability '${capability}'`);
}

/** The disclosure shown with every guidance answer while only the test provider exists (OPEN-023). */
export const GUIDANCE_TEST_PROVIDER_NOTICE_AR = 'إرشاد تجريبي من قوالب ثابتة تنسخ بياناتك المسجّلة فقط؛ لا يعمل نموذج ذكاء اصطناعي حقيقي بعد. لا يغيّر مستواك ولا يقيّم عملك.';
