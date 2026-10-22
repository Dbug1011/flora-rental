import type { Metadata } from 'next';
import Submitted from '@/components/Submitted';

export const metadata: Metadata = { title: 'Request received · Flora Dress Rental', robots: { index: false } };

export default function SubmittedPage() {
  return (
    <div className="wrap">
      <Submitted />
    </div>
  );
}
