import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isLoopbackHost } from './local-host';

export async function assertLocalPage(): Promise<void> {
  if (!isLoopbackHost((await headers()).get('host') ?? '')) notFound();
}
