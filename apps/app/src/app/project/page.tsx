import { redirect } from 'next/navigation';

/**
 * The former demo-only submission page (graduate journey Phase 2, U5).
 *
 * It hard-coded one demo activity and its deliverables. Work now starts from the activity catalogue and is done in
 * /work/[projectId], generated from the activity's declared deliverables. The URL is kept and sends the graduate there.
 */
export default function ProjectPage() {
  redirect('/activities');
}
