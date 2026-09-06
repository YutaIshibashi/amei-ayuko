'use client';

import { INSTAGRAM_URL, SITE } from '@/lib/site';
import { track } from '@/lib/analytics';
import { useSettings } from '@/lib/hooks';
import { IconArrowRight, IconInstagram } from '../Icons';

/**
 * Intro above the form.
 *
 * States plainly what this form is for (quotes and formal enquiries) and
 * points casual questions at Instagram DMs, so neither channel gets the
 * wrong kind of message.
 */
export default function ContactIntro() {
  const { contactIntro, instagramUrl } = useSettings();

  return (
    <div className="c-contactIntro">
      <p>{contactIntro}</p>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-ink-soft)' }}>
        いただいたお問い合わせには、<strong>{SITE.replyLeadTime}以内</strong>にご返信いたします。
        土日祝はお休みをいただいております。
      </p>

      <div className="c-contactAlt">
        <IconInstagram width={32} height={32} style={{ color: 'var(--c-brand)', flex: 'none' }} />
        <div className="c-contactAlt__text">
          <p className="c-contactAlt__title">ちょっとした質問はDMでもどうぞ</p>
          <p>「この商品まだありますか？」など、気軽なご質問はInstagramのダイレクトメッセージが便利です。</p>
        </div>
        <a
          className="a-btn a-btn--ghost"
          href={instagramUrl || INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('click_instagram', { source: 'contact_intro', destination: 'instagram' })}
        >
          DMを送る
          <IconArrowRight width={16} height={16} />
        </a>
      </div>
    </div>
  );
}
