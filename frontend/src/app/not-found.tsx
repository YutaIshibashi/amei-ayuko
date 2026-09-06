import type { Metadata } from 'next';
import StatusPage from '@/components/StatusPage';

export const metadata: Metadata = {
  title: 'ページが見つかりません',
  robots: { index: false, follow: false },
};

/**
 * 404. Exported as /404.html and wired up through .htaccess ErrorDocument, so
 * a mistyped URL still lands on a branded page with a real 404 status.
 */
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="ページが見つかりませんでした"
      message={
        <>
          お探しのページは移動または削除された可能性があります。
          <br />
          下のリンクから、お目当てのものが見つかるかもしれません。
        </>
      }
      links={[
        { href: '/', label: 'ホームへ', primary: true },
        { href: '/shop/', label: 'オンラインショップ' },
        { href: '/shop/?category=album-flake', label: 'アルバムフレーク' },
        { href: '/shop/?category=stamp', label: 'スタンプ' },
      ]}
    />
  );
}
