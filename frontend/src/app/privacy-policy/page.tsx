import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumbs from '@/components/Breadcrumbs';
import JsonLd from '@/components/JsonLd';
import { INSTAGRAM_URL, SITE } from '@/lib/site';

/**
 * Last updated date for this document.
 * Bump it in the same commit whenever the text below changes.
 */
const LAST_UPDATED = '2026年9月6日';

const title = 'プライバシーポリシー';
const description =
  'amei ayuko 公式サイトにおける個人情報の取り扱い、Cookieおよびアクセス解析（Googleアナリティクス）の利用についてご説明します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacy-policy/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${title} | ${SITE.name}`,
    description,
    url: `${SITE.url}/privacy-policy/`,
    type: 'article',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE.url}/` },
            { '@type': 'ListItem', position: 2, name: title, item: `${SITE.url}/privacy-policy/` },
          ],
        }}
      />

      <Breadcrumbs items={[{ label: 'ホーム', href: '/' }, { label: title }]} />

      <section className="l-section l-section--paper" style={{ paddingTop: 'var(--s-5)' }}>
        <div className="l-page">
          <div className="c-pageHead">
            <span className="c-pageHead__en">Privacy Policy</span>
            <h1 className="c-pageHead__jp">プライバシーポリシー</h1>
          </div>

          <div className="c-legal">
            <p>
              amei ayuko（以下「当方」といいます）は、当ウェブサイト（以下「当サイト」といいます）における個人情報の取り扱いについて、以下のとおり定めます。
            </p>

            <h2>1. 取得する個人情報</h2>
            <p>当サイトでは、お問い合わせフォームのご利用時に、以下の情報を取得します。</p>
            <ul>
              <li>お名前</li>
              <li>メールアドレス</li>
              <li>お問い合わせの種別</li>
              <li>お問い合わせ内容（本文）</li>
            </ul>
            <p>
              上記のほか、当サイトの閲覧にともない、アクセス解析ツールを通じて、閲覧されたページ、参照元、ブラウザの種類、おおよその地域などの情報を取得する場合があります。これらの情報から個人を特定することはありません。
            </p>

            <h2>2. 利用目的</h2>
            <p>取得した個人情報は、以下の目的にのみ利用します。</p>
            <ul>
              <li>お問い合わせへのご回答、ご連絡</li>
              <li>デザイン制作等のご依頼に関するお打ち合わせ、お見積りのご提示</li>
              <li>商品・サービスに関するご案内（お問い合わせに関連する範囲に限ります）</li>
              <li>当サイトの利用状況の把握と改善</li>
            </ul>

            <h2>3. 保管および管理</h2>
            <p>
              お問い合わせ内容は、当方の管理するメールにて受信・保管します。お問い合わせ本文をサイトのデータベースへ保存することはありません。
            </p>
            <p>
              取得した個人情報は、不正アクセス、紛失、改ざん、漏えい等を防止するために必要かつ適切な安全管理措置を講じて取り扱います。利用目的を達成し、保管の必要がなくなった情報は、速やかに削除します。
            </p>

            <h2>4. 第三者への提供</h2>
            <p>
              取得した個人情報は、以下の場合を除き、ご本人の同意なく第三者へ提供することはありません。
            </p>
            <ul>
              <li>法令に基づく場合</li>
              <li>人の生命、身体または財産の保護のために必要があり、ご本人の同意を得ることが困難な場合</li>
              <li>お問い合わせへの対応に必要な範囲で、メール送信等の外部サービスを利用する場合</li>
            </ul>

            <h2>5. Cookie（クッキー）について</h2>
            <p>
              Cookieとは、ウェブサイトの利用時にブラウザへ保存される小さなテキストファイルです。当サイトでは、次の目的でCookieおよびブラウザのローカルストレージを使用します。
            </p>
            <h3>5-1. サイトの表示に必要なもの</h3>
            <p>
              Cookie利用の同意状態の記録など、サイトを正しく表示・動作させるために必要なものです。これらは無効にできません。
            </p>
            <h3>5-2. アクセス解析のためのもの</h3>
            <p>
              後述のGoogleアナリティクスが使用するCookieです。<strong>お客様が同意されるまで、当サイトはアクセス解析用のスクリプトを読み込みません。</strong>
            </p>

            <h2>6. アクセス解析ツール（Googleアナリティクス）</h2>
            <p>
              当サイトでは、サイトの利用状況を把握し改善するために、Google LLC が提供するアクセス解析ツール「Googleアナリティクス4（GA4）」を利用する場合があります。
            </p>
            <p>
              GA4はCookieを使用して、個人を特定しない形で閲覧情報を収集します。収集された情報はGoogle社のプライバシーポリシーに基づいて管理されます。当方はこの情報を、当サイトの改善以外の目的で利用しません。
            </p>
            <ul>
              <li>
                <a href="https://policies.google.com/privacy?hl=ja" target="_blank" rel="noopener noreferrer">
                  Google プライバシーポリシー
                </a>
              </li>
              <li>
                <a href="https://policies.google.com/technologies/partner-sites?hl=ja" target="_blank" rel="noopener noreferrer">
                  Google のサービスを使用するサイトやアプリから収集した情報の Google による使用
                </a>
              </li>
              <li>
                <a href="https://tools.google.com/dlpage/gaoptout?hl=ja" target="_blank" rel="noopener noreferrer">
                  Google アナリティクス オプトアウト アドオン
                </a>
              </li>
            </ul>

            <h2>7. 同意と拒否、設定の変更</h2>
            <p>
              初回アクセス時に画面下部へ表示されるバナーから、アクセス解析用Cookieの利用に「同意する」または「拒否する」をお選びいただけます。
            </p>
            <ul>
              <li>「拒否する」を選んだ場合も、当サイトは通常どおりご利用いただけます。</li>
              <li>お選びいただいた状態はお使いのブラウザに1年間保存されます。1年を経過すると、あらためてバナーが表示されます。</li>
              <li>
                同意状態は、フッターの「Cookie設定」からいつでも変更できます。設定はブラウザごとに保存されるため、別の端末やブラウザでは個別の設定が必要です。
              </li>
              <li>ブラウザの設定からCookieを削除・拒否することもできます。</li>
            </ul>

            <h2>8. 外部サイトへのリンク</h2>
            <p>
              当サイトには、minne、Creema、Instagram などの外部サイトへのリンクが含まれます。リンク先における個人情報の取り扱いについては、各サイトのプライバシーポリシーをご確認ください。
            </p>

            <h2>9. 免責事項</h2>
            <p>
              当サイトに掲載する情報については正確性の確保に努めますが、その内容によって生じたいかなる損害についても、当方は責任を負いかねます。
            </p>

            <h2>10. お問い合わせ窓口</h2>
            <p>
              本ポリシーに関するお問い合わせ、および個人情報の開示・訂正・削除のご請求は、
              <Link href="/contact/">お問い合わせフォーム</Link>
              または
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a>
              のダイレクトメッセージよりご連絡ください。
            </p>

            <h2>11. 本ポリシーの変更</h2>
            <p>
              法令の変更や運用の見直しにともない、本ポリシーの内容を変更する場合があります。変更後の内容は当ページに掲載した時点から適用されます。
            </p>

            <p className="c-legal__updated">最終更新日：{LAST_UPDATED}</p>
          </div>
        </div>
      </section>
    </>
  );
}
