'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContactTypes, fetchCsrfToken, submitContact, ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useFocusTrap, useScrollLock, useSettings } from '@/lib/hooks';
import { INSTAGRAM_URL, SITE, TURNSTILE_SITE_KEY } from '@/lib/site';
import type { ContactType } from '@/lib/types';
import { IconAlert, IconArrowRight, IconMail } from '../Icons';
import Turnstile from './Turnstile';

const MAX_NAME = 100;
const MAX_MESSAGE = 5000;

interface FormValues {
  name: string;
  email: string;
  emailConfirm: string;
  contactTypeId: string;
  message: string;
  agree: boolean;
}

type Errors = Partial<Record<keyof FormValues | 'form', string>>;

const EMPTY: FormValues = {
  name: '',
  email: '',
  emailConfirm: '',
  contactTypeId: '',
  message: '',
  agree: false,
};

/**
 * Contact form.
 *
 * Validation runs client-side for immediacy and again on the server, which is
 * the only copy that matters. Nothing entered here is ever persisted to
 * localStorage — the values are personal data and stay in React state until
 * the request succeeds, at which point the state is discarded and the browser
 * moves to /contact/thanks.
 */
export default function ContactForm() {
  const router = useRouter();
  const { instagramUrl } = useSettings();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [types, setTypes] = useState<ContactType[]>([]);
  const [csrfToken, setCsrfToken] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  /** Honeypot: a real person never fills a hidden field. */
  const [website, setWebsite] = useState('');

  const summaryRef = useRef<HTMLDivElement>(null);
  const fieldRefs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    emailConfirm: useRef<HTMLInputElement>(null),
    contactTypeId: useRef<HTMLSelectElement>(null),
    message: useRef<HTMLTextAreaElement>(null),
    agree: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    track('view_contact');
    const ac = new AbortController();
    fetchContactTypes(ac.signal)
      .then((res) => {
        setTypes(res.types);
        setValues((v) => (v.contactTypeId ? v : { ...v, contactTypeId: String(res.types[0]?.id ?? '') }));
      })
      .catch(() => { /* the select simply stays empty; the server still validates */ });
    fetchCsrfToken(ac.signal)
      .then((res) => setCsrfToken(res.token))
      .catch(() => { /* submission will surface the failure with a retry */ });
    return () => ac.abort();
  }, []);

  const set = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const selectedType = types.find((t) => String(t.id) === values.contactTypeId);

  const validate = (): Errors => {
    const e: Errors = {};
    const name = values.name.trim();
    const email = values.email.trim();
    const message = values.message.trim();

    if (!name) e.name = 'お名前をご入力ください。';
    else if (name.length > MAX_NAME) e.name = `お名前は${MAX_NAME}文字以内でご入力ください。`;

    if (!email) e.email = 'メールアドレスをご入力ください。';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'あと少しです♪ メールアドレスの形式をご確認ください。';
    }

    if (!values.emailConfirm.trim()) e.emailConfirm = '確認のため、もう一度ご入力ください。';
    else if (values.emailConfirm.trim() !== email) {
      e.emailConfirm = 'メールアドレスが一致していません。もう一度ご確認ください。';
    }

    if (!values.contactTypeId) e.contactTypeId = 'お問い合わせの種別をお選びください。';

    if (!message) e.message = 'お問い合わせ内容をご入力ください。';
    else if (message.length > MAX_MESSAGE) {
      e.message = `お問い合わせ内容は${MAX_MESSAGE}文字以内でご入力ください。`;
    }

    if (!values.agree) e.agree = 'プライバシーポリシーへの同意が必要です。';

    return e;
  };

  /** Moves focus to the first invalid field — required for keyboard use. */
  const focusFirstError = (e: Errors) => {
    const order: (keyof FormValues)[] = ['name', 'email', 'emailConfirm', 'contactTypeId', 'message', 'agree'];
    const first = order.find((k) => e[k]);
    if (!first) return;
    requestAnimationFrame(() => {
      summaryRef.current?.focus();
      fieldRefs[first].current?.focus({ preventScroll: false });
    });
  };

  const onReview = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      focusFirstError(e);
      return;
    }
    setConfirming(true);
  };

  const send = async () => {
    if (sending) return; // client-side duplicate-submit guard
    setSending(true);
    setErrors((e) => ({ ...e, form: undefined }));
    try {
      await submitContact({
        name: values.name.trim(),
        email: values.email.trim(),
        emailConfirm: values.emailConfirm.trim(),
        contactTypeId: Number(values.contactTypeId),
        message: values.message.trim(),
        agree: values.agree,
        turnstileToken,
        website,
        csrfToken,
      });
      track('submit_contact', { contact_type: selectedType?.label ?? '' });
      // Discard every field before navigating: nothing personal survives.
      setValues(EMPTY);
      setTurnstileToken('');
      setConfirming(false);
      router.push('/contact/thanks/');
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setConfirming(false);
      setSending(false);
      setTurnstileToken('');
      setTurnstileReset((n) => n + 1);
      if (apiError?.fields) setErrors({ ...apiError.fields, form: apiError.message });
      else setErrors({ form: apiError?.message ?? '送信できませんでした。時間をおいてお試しください。' });
      requestAnimationFrame(() => summaryRef.current?.focus());
      // A fresh CSRF token, in case the session rotated or expired.
      fetchCsrfToken().then((r) => setCsrfToken(r.token)).catch(() => undefined);
    }
  };

  const errorList = (Object.keys(errors) as (keyof Errors)[])
    .filter((k) => k !== 'form' && errors[k])
    .map((k) => ({ key: k, message: errors[k]! }));

  return (
    <>
      <form className="c-form" noValidate onSubmit={onReview}>
        {/* Error summary: announced, focusable, and links into the fields. */}
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          style={{ outline: 'none' }}
        >
          {errors.form || errorList.length > 0 ? (
            <div className="c-alert c-alert--error">
              <span className="c-alert__title">
                <IconAlert width={18} height={18} />
                {errors.form ? '送信できませんでした' : '入力内容をご確認ください'}
              </span>
              {errors.form ? <span>{errors.form}</span> : null}
              {errorList.length > 0 ? (
                <ul className="c-alert__list">
                  {errorList.map((e) => (
                    <li key={e.key}>
                      <a href={`#field-${e.key}`}>{e.message}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {errors.form ? (
                <span>
                  お急ぎの場合は{' '}
                  <a href={instagramUrl || INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                    InstagramのDM
                  </a>{' '}
                  からもご連絡いただけます。
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <Field
          id="field-name"
          label="お名前"
          required
          error={errors.name}
          help={`${MAX_NAME}文字以内`}
        >
          <input
            ref={fieldRefs.name}
            id="field-name"
            className="c-input"
            type="text"
            name="name"
            autoComplete="name"
            maxLength={MAX_NAME}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'field-name-error' : undefined}
            required
          />
        </Field>

        <Field id="field-email" label="メールアドレス" required error={errors.email}>
          <input
            ref={fieldRefs.email}
            id="field-email"
            className="c-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'field-email-error' : undefined}
            required
          />
        </Field>

        <Field
          id="field-emailConfirm"
          label="メールアドレス（確認用）"
          required
          error={errors.emailConfirm}
          help="お間違いがあるとご返信できません。もう一度ご入力ください。"
        >
          <input
            ref={fieldRefs.emailConfirm}
            id="field-emailConfirm"
            className="c-input"
            type="email"
            name="email_confirm"
            inputMode="email"
            autoComplete="off"
            maxLength={254}
            value={values.emailConfirm}
            onChange={(e) => set('emailConfirm', e.target.value)}
            onPaste={(e) => e.preventDefault()}
            aria-invalid={Boolean(errors.emailConfirm)}
            aria-describedby={errors.emailConfirm ? 'field-emailConfirm-error' : undefined}
            required
          />
        </Field>

        <Field id="field-contactTypeId" label="お問い合わせの種別" required error={errors.contactTypeId}>
          <select
            ref={fieldRefs.contactTypeId}
            id="field-contactTypeId"
            className="c-select"
            name="contact_type"
            value={values.contactTypeId}
            onChange={(e) => set('contactTypeId', e.target.value)}
            aria-invalid={Boolean(errors.contactTypeId)}
            required
          >
            {types.length === 0 ? <option value="">読み込み中…</option> : null}
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </Field>

        <Field
          id="field-message"
          label="お問い合わせ内容"
          required
          error={errors.message}
          /* The help text is the only thing the selected type changes. */
          help={selectedType?.helpText ?? 'ご相談内容をできるだけ具体的にお書きください。'}
        >
          <textarea
            ref={fieldRefs.message}
            id="field-message"
            className="c-textarea"
            name="message"
            maxLength={MAX_MESSAGE + 200}
            value={values.message}
            onChange={(e) => set('message', e.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'field-message-error' : 'field-message-count'}
            required
          />
          <p
            id="field-message-count"
            className={`c-field__count ${values.message.length > MAX_MESSAGE ? 'is-over' : ''}`}
          >
            {values.message.length} / {MAX_MESSAGE}
          </p>
        </Field>

        {/* Honeypot. Hidden from sight and from assistive tech, not from bots. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="field-website">ウェブサイト（入力しないでください）</label>
          <input
            id="field-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="c-field">
          <label className="c-check" htmlFor="field-agree">
            <input
              ref={fieldRefs.agree}
              id="field-agree"
              type="checkbox"
              checked={values.agree}
              onChange={(e) => set('agree', e.target.checked)}
              aria-invalid={Boolean(errors.agree)}
              aria-describedby={errors.agree ? 'field-agree-error' : undefined}
              required
            />
            <span className="c-check__text">
              <Link href="/privacy-policy/" target="_blank">プライバシーポリシー</Link>
              に同意します
              <span className="c-field__req" style={{ marginLeft: 'var(--s-2)' }}>必須</span>
            </span>
          </label>
          {errors.agree ? (
            <p className="c-error" id="field-agree-error">
              <IconAlert className="c-error__icon" width={16} height={16} />
              {errors.agree}
            </p>
          ) : null}
        </div>

        <div>
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onToken={setTurnstileToken}
            onError={() => setTurnstileToken('')}
            resetSignal={turnstileReset}
          />
        </div>

        <button type="submit" className="a-btn a-btn--lg a-btn--block" disabled={sending}>
          <IconMail width={20} height={20} />
          入力内容を確認する
        </button>
      </form>

      {confirming ? (
        <ConfirmDialog
          values={values}
          typeLabel={selectedType?.label ?? ''}
          sending={sending}
          onBack={() => setConfirming(false)}
          onSend={send}
        />
      ) : null}
    </>
  );
}

function Field({
  id,
  label,
  required,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="c-field">
      <label className="c-field__label" htmlFor={id}>
        {label}
        <span className={required ? 'c-field__req' : 'c-field__opt'}>{required ? '必須' : '任意'}</span>
      </label>
      {help ? <p className="c-field__help">{help}</p> : null}
      {children}
      {error ? (
        <p className="c-error" id={`${id}-error`}>
          <IconAlert className="c-error__icon" width={16} height={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Final review step before anything is sent. */
function ConfirmDialog({
  values,
  typeLabel,
  sending,
  onBack,
  onSend,
}: {
  values: FormValues;
  typeLabel: string;
  sending: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useFocusTrap(panelRef, true, sending ? undefined : onBack);

  return (
    <div className="c-dialog" role="presentation">
      <button type="button" className="c-modal__backdrop" aria-label="閉じる" onClick={sending ? undefined : onBack} />
      <div
        ref={panelRef}
        className="c-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-confirm-title"
        tabIndex={-1}
      >
        <h2 className="c-dialog__title" id="contact-confirm-title">この内容で送信します</h2>
        <div className="c-dialog__rows">
          <Row label="お名前" value={values.name} />
          <Row label="メールアドレス" value={values.email} />
          <Row label="お問い合わせの種別" value={typeLabel} />
          <Row label="お問い合わせ内容" value={values.message} />
        </div>
        <div className="c-dialog__actions">
          <button type="button" className="a-btn a-btn--ghost" onClick={onBack} disabled={sending}>
            修正する
          </button>
          <button type="button" className="a-btn" onClick={onSend} disabled={sending}>
            {sending ? <><span className="a-spinner" aria-hidden="true" /> 送信中…</> : <>送信する <IconArrowRight width={18} height={18} /></>}
          </button>
        </div>
        <p style={{ marginTop: 'var(--s-4)', fontSize: 'var(--fs-xs)', color: 'var(--c-ink-soft)', textAlign: 'center' }}>
          ご返信は{SITE.replyLeadTime}以内を目安にお送りしています。
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="c-dialog__row">
      <span className="c-dialog__rowLabel">{label}</span>
      <span className="c-dialog__rowValue">{value}</span>
    </div>
  );
}
