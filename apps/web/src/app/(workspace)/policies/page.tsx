import { Heading } from '@/components/heading';
import { PolicyForm } from '@/components/policy-form';
import { getPolicy } from '@/lib/db';

import { assertLocalPage } from '@/lib/local-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security policies' };
export default async function PolicyPage() {
  await assertLocalPage();
  return <><Heading label="SECURITY POLICIES" title="Configure review policy"
    description="Highlight reports that contain a finding at or above your local severity threshold." />
    <PolicyForm initial={getPolicy()} />
    <section className="subsection"><h2>CLI and GitHub Actions</h2>
      <p>Set the CLI threshold with <code>--fail-on</code>. The dependency review workflow reads <code>PACKAGETRUTH_FAIL_ON</code> from GitHub repository variables and defaults to <code>critical</code>.</p>
    </section>
  </>;
}
