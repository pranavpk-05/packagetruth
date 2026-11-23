'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ClipboardList, GitCompareArrows, History, ScanSearch, SlidersHorizontal } from 'lucide-react';

const pages = [
  { href: '/scan', label: 'Package scan', icon: ScanSearch },
  { href: '/compare', label: 'Version comparison', icon: GitCompareArrows },
  { href: '/evidence', label: 'Evidence explorer', icon: ClipboardList },
  { href: '/history', label: 'Scan history', icon: History },
  { href: '/policies', label: 'Security policies', icon: SlidersHorizontal },
  { href: '/about', label: 'Methodology', icon: BookOpen },
];

export function WorkspaceNav() {
  const path = usePathname();
  return <aside className="sidebar">
    <span className="eyebrow sidebar-title">WORKSPACE</span>
    <nav aria-label="Workspace navigation">
      {pages.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`) || (href === '/scan' && path.startsWith('/reports/'));
        return <Link href={href} key={href} aria-current={active ? 'page' : undefined}><Icon size={17} aria-hidden="true" />{label}</Link>;
      })}
    </nav>
  </aside>;
}
