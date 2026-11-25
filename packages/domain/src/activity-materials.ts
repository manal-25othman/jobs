/**
 * Phase B, package 3 (PO decisions 3 and 4) — activity starter materials and the start rule.
 *
 * An activity declares its inputs; an input that is delivered as a file (`materialRequired`) must be covered by at
 * least one GRADUATE material before anyone can start the activity. Reviewer materials (reference solutions,
 * planted-defect explanations) never count toward starting and are never shown to a graduate. The database enforces
 * the same rule on every new project (0039); this module is the rule the API applies first and explains in Arabic.
 */
import { DomainError } from './errors.js';

export interface MaterialInput { readonly key: string; readonly materialRequired: boolean }
export interface MaterialRecord { readonly audience: 'graduate' | 'reviewer'; readonly coversInputKeys: readonly string[] }
export interface Startability { readonly startable: boolean; readonly missingInputKeys: readonly string[] }

export const STARTER_MATERIALS_MISSING_AR =
  'لا يمكن بدء هذا النشاط بعد: مواد البداية التي يحتاجها (الملفات والبيانات) لم تُتح على المنصّة. سيصبح متاحًا حين تُضاف، وأعمالك السابقة تبقى كما هي.';

export function activityStartability(inputs: readonly MaterialInput[], materials: readonly MaterialRecord[]): Startability {
  const covered = new Set(materials.filter((m) => m.audience === 'graduate').flatMap((m) => m.coversInputKeys));
  const missingInputKeys = inputs.filter((i) => i.materialRequired && !covered.has(i.key)).map((i) => i.key).sort();
  return { startable: missingInputKeys.length === 0, missingInputKeys };
}

export function assertActivityStartable(inputs: readonly MaterialInput[], materials: readonly MaterialRecord[]): void {
  const s = activityStartability(inputs, materials);
  if (!s.startable) throw new DomainError(`[starter_materials_missing] ${STARTER_MATERIALS_MISSING_AR}`, { missingInputKeys: s.missingInputKeys });
}

/** Material files are named safely (no path, no traversal) and versioned. */
export function assertMaterialFileName(name: string): void {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name) || name.startsWith('.')) throw new DomainError(`[material_name] unsafe material file name: ${name}`);
}
