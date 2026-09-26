'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { InvoiceBuilder } from '@/components/invoices/invoice-builder';

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <InvoiceBuilder invoiceId={params.id} />
    </Suspense>
  );
}
