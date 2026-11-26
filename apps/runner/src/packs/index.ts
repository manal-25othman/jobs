import type { TestPack } from '../pack.js';
import { demoPack } from './demo.js';
import { actFeDebugImprovePack } from './act_fe_debug_improve.js';
import { actFeChangeRequestPack } from './act_fe_change_request.js';
import { actFeIntegratedLeaveRequestsPack } from './act_fe_integrated_leave_requests.js';

/** Candidate packs by activity. Each stays `candidate` until a named expert approves it. */
export const PACKS: Readonly<Record<string, TestPack>> = {
  [demoPack.activityId]: demoPack,
  [actFeDebugImprovePack.activityId]: actFeDebugImprovePack,
  [actFeChangeRequestPack.activityId]: actFeChangeRequestPack,
  [actFeIntegratedLeaveRequestsPack.activityId]: actFeIntegratedLeaveRequestsPack,
};

export function packFor(activityId: string): TestPack {
  const p = PACKS[activityId];
  if (!p) throw new Error(`[r2_pack] No test pack for ${activityId}.`);
  return p;
}
