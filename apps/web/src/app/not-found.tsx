import Link from 'next/link';
export default function NotFound() {
  return <main id="main" className="site-width empty"><h1>Page or report unavailable</h1>
    <p>Check the address or open a report from scan history.</p><Link className="button primary" href="/history">Scan history</Link></main>;
}
