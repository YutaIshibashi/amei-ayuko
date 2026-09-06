import type { Metadata } from 'next';
import { INSTAGRAM_URL } from '@/lib/site';
import StatusPage from '@/components/StatusPage';

export const metadata: Metadata = {
  title: 'メンテナンス中',
  robots: { index: false, follow: false },
};

/**
 * Maintenance page.
 *
 * Served by `maintenance.php` with HTTP 503 while `maintenance.flag` exists,
 * so search engines treat the outage as temporary rather than de-indexing.
 */
export default function MaintenancePage() {
  return (
    <StatusPage
      title="ただいまメンテナンス中です"
      message={
        <>
          システムのメンテナンスを行っています。
          <br />
          お時間をおいて、再度お試しください。ご不便をおかけいたします。
        </>
      }
      illustration="/brand/illust-maintenance.svg"
      links={[{ href: INSTAGRAM_URL, label: 'Instagramで最新情報を見る', primary: true, external: true }]}
    />
  );
}
