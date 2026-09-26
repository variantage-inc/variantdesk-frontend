'use client';

import { Suspense } from 'react';
import { InvoiceBuilder } from '@/components/invoices/invoice-builder';

export default function NewInvoicePage() {
  return (
    <Suspense fallback={null}>
      <InvoiceBuilder />
    </Suspense>
  );
}
