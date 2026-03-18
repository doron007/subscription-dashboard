'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ShadowItRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/import-center');
    }, [router]);
    return null;
}
