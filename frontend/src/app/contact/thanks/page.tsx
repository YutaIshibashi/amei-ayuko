import type { Metadata } from 'next';
import Link from 'next/link';
import { Flower, Sparkle } from '@/components/Deco';
import { IconInstagram, IconShop } from '@/components/Icons';
import { INSTAGRAM_URL, SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'お問い合わせありがとうございます',
  description: 'お問い合わせを受け付けました。内容を確認のうえ、2〜3営業日以内にご返信いたします。',
  // A thank-you page has no standalone search value and would only dilute the
  // contact page, so it is excluded from the index but still crawlable.
  robots: { index: false, follow: true },
  alternates: { canonical: '/contact/thanks/' },
};

export default function ContactThanksPage() {
  return (
    <section className="l-section l-section--cream" style={{ paddingBlock: 'var(--s-9)' }}>
      <Flower className="c-deco c-deco--float" style={{ top: '12%', right: '10%', color: 'var(--c-brand-soft)' }} width={80} />
      <Sparkle className="c-deco c-deco--float" style={{ bottom: '16%', left: '9%', color: 'var(--c-sun)' }} width={30} />

      <div className="l-page">
        <div className="c-thanks">
          <img
            className="c-thanks__illust"
            src="/brand/illust-maintenance.svg"
            alt=""
            width={400}
            height={320}
            aria-hidden="true"
          />
          <span className="a-enTitle" style={{ fontSize: 'var(--fs-3xl)' }}>Thank you!</span>
          <h1 className="a-jpTitle">お問い合わせありがとうございます</h1>
          <p className="a-lead">
            送信が完了しました。ご入力いただいたメールアドレス宛に、受付内容の自動返信をお送りしています。
          </p>
          <p className="a-lead">
            内容を確認のうえ、<strong>{SITE.replyLeadTime}以内</strong>にご返信いたします。
            <br />
            自動返信が届かない場合は、迷惑メールフォルダをご確認ください。
          </p>

          <div className="c-status__links">
            <Link href="/" className="a-btn">ホームへ</Link>
            <Link href="/shop/" className="a-btn a-btn--ghost">
              <IconShop width={18} height={18} />
              オンラインショップ
            </Link>
            <a className="a-btn a-btn--ghost" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              <IconInstagram width={18} height={18} />
              Instagram
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
