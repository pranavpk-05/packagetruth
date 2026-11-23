export function Heading({ label, title, description }: { label: string; title: string; description?: string }) {
  return <div className="page-heading">
    <p className="eyebrow">{label}</p><h1>{title}</h1>{description && <p className="intro">{description}</p>}
  </div>;
}
