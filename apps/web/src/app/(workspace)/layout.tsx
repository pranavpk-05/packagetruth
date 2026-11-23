import { WorkspaceNav } from '@/components/workspace-nav';
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="workspace site-width"><WorkspaceNav /><main id="main" className="workspace-body">{children}</main></div>;
}
