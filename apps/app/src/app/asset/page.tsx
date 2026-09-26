'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loading } from '../../components/Session';

/**
 * D-074: there is no direct CV-bullet generation any more. Wording is a
 * Recruitment Agent proposal the user previews and approves on /proposals.
 * This route stays only so old links land somewhere sensible.
 */
function AssetRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const evidenceId = params.get('evidence');
  useEffect(() => { router.replace(evidenceId ? `/proposals?focus=${evidenceId}` : '/proposals'); }, [router, evidenceId]);
  return <Loading />;
}

export default function AssetPage() {
  return <Suspense fallback={<Loading />}><AssetRedirect /></Suspense>;
}
