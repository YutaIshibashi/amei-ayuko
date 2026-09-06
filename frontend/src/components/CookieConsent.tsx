'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyticsAllowed,
  consentStatus,
  isBannerPreview,
  isInternalUser,
  onConsentChange,
  shouldShowBanner,
  writeConsent,
} from '@/lib/consent';
import { track } from '@/lib/analytics';
import { useFocusTrap } from '@/lib/hooks';
import { IconCheck, IconClose } from './Icons';

/**
 * Bottom cookie banner.
 *
 * Rendered only after mount (the decision lives in localStorage, which does
 * not exist during the static export) and never for an internal user unless
 * the admin's banner-preview mode is on.
 */
export function CookieBanner({ onDecision }: { onDecision: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(shouldShowBanner());
    sync();
    return onConsentChange(sync);
  }, []);

  const decide = useCallback(
    (status: 'accepted' | 'rejected') => {
      writeConsent(status);
      setVisible(false);
      // Fires only if the choice was "accept" and the visitor is not internal.
      track('cookie_consent', { consent: status, source: 'banner' });
      onDecision();
    },
    [onDecision],
  );

  if (!visible) return null;

  return (
    <div className="c-cookie" role="region" aria-label="Cookieの利用について">
      <div className="c-cookie__inner">
        <p className="c-cookie__text">
          当サイトでは、サイトの利用状況を把握するためにCookie（Googleアナリティクス）を使用します。
          「拒否する」を選んでも、サイトはそのままご利用いただけます。詳しくは
          <Link href="/privacy-policy/">プライバシーポリシー</Link>
          をご覧ください。
        </p>
        <div className="c-cookie__actions">
          <button type="button" className="a-btn a-btn--ghost" onClick={() => decide('rejected')}>
            拒否する
          </button>
          <button type="button" className="a-btn" onClick={() => decide('accepted')}>
            同意する
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Cookie設定" dialog, reachable from the footer on every page so the
 * visitor can change their mind at any time.
 */
export function CookieSettingsModal({
  open,
  onClose,
  onDecision,
}: {
  open: boolean;
  onClose: () => void;
  onDecision: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [internal, setInternal] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusTrap(panelRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    setEnabled(consentStatus() === 'accepted');
    setInternal(isInternalUser());
    setSaved(false);
  }, [open]);

  if (!open) return null;

  const save = () => {
    const status = enabled ? 'accepted' : 'rejected';
    writeConsent(status);
    track('cookie_consent', { consent: status, source: 'settings' });
    setSaved(true);
    onDecision();
    window.setTimeout(onClose, 700);
  };

  return (
    <div className="c-dialog" role="presentation">
      <button
        type="button"
        className="c-modal__backdrop"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="c-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-settings-title"
        tabIndex={-1}
      >
        <button type="button" className="c-modal__close" onClick={onClose}>
          <span className="a-visuallyHidden">閉じる</span>
          <IconClose />
        </button>

        <h2 className="c-dialog__title" id="cookie-settings-title">Cookie設定</h2>

        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-ink-soft)', marginBottom: 'var(--s-5)' }}>
          現在の状態：
          <strong style={{ color: 'var(--c-ink)' }}>
            {analyticsAllowed() ? '同意済み（計測あり）' : consentStatus() === 'rejected' ? '拒否（計測なし）' : '未選択（計測なし）'}
          </strong>
        </p>

        {internal ? (
          <div className="c-alert c-alert--info" style={{ marginBottom: 'var(--s-5)' }}>
            <span className="c-alert__title">この端末はアクセス解析から除外されています</span>
            <span>
              管理画面の設定により、この端末では同意状態にかかわらずGA4へのデータ送信は行われません。
              {isBannerPreview() ? '（Cookieバナー確認モード中）' : ''}
            </span>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 'var(--s-4)', marginBottom: 'var(--s-5)' }}>
          <label className="c-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="c-check__text">
              <strong>アクセス解析（Googleアナリティクス）</strong>
              <br />
              どのページがよく見られているかを把握し、サイト改善に役立てます。個人を特定する情報は取得しません。
            </span>
          </label>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-ink-soft)' }}>
            サイトの表示に必要なCookieは、この設定にかかわらず使用されます。
            詳しくは<Link href="/privacy-policy/">プライバシーポリシー</Link>をご覧ください。
          </p>
        </div>

        <div className="c-dialog__actions">
          <button type="button" className="a-btn a-btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="a-btn" onClick={save}>
            {saved ? <><IconCheck /> 保存しました</> : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
