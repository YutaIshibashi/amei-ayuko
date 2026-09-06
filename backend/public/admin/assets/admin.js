/**
 * Admin behaviours.
 *
 * Deliberately dependency-free and progressive: every screen works with this
 * file missing, apart from the conveniences it adds (auto-save, formatting
 * shortcuts, confirmations). Anything destructive is confirmed here *and*
 * guarded server-side.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------ confirmations */
  document.addEventListener('click', function (event) {
    var trigger = event.target instanceof Element ? event.target.closest('[data-confirm]') : null;
    if (!trigger) return;
    if (!window.confirm(trigger.getAttribute('data-confirm'))) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  /* ------------------------------------------- localStorage state (shared
     with the public bundle: same origin, same keys as src/lib/consent.ts) */
  var INTERNAL_KEY = 'amei.internal.v1';
  var PREVIEW_KEY = 'amei.cookie_preview.v1';
  var CONSENT_KEY = 'amei.consent.v1';

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function consentLabel() {
    var raw = read(CONSENT_KEY);
    if (!raw) return '未選択（計測なし）';
    try {
      var parsed = JSON.parse(raw);
      var age = Date.now() - (parsed.timestamp || 0);
      if (age > 365 * 24 * 60 * 60 * 1000) return '期限切れ（再度バナーを表示）';
      return parsed.status === 'accepted' ? '同意済み' : '拒否';
    } catch (e) {
      return '不明';
    }
  }

  function renderAnalyticsState() {
    var toggle = document.getElementById('analytics-toggle');
    if (!toggle) return;

    var excluded = read(INTERNAL_KEY) === '1';
    var previewOn = read(PREVIEW_KEY) === '1';

    toggle.textContent = excluded ? '除外を解除する' : 'この端末を除外する';
    toggle.className = excluded ? 'btn btn--ghost' : 'btn';
    toggle.setAttribute(
      'data-confirm',
      excluded ? toggle.getAttribute('data-confirm-off') : toggle.getAttribute('data-confirm-on')
    );

    var banner = document.getElementById('analytics-state');
    if (banner) {
      banner.hidden = false;
      banner.className = excluded ? 'banner banner--ok' : 'banner banner--warn';
      banner.textContent = excluded
        ? '現在この端末は除外されています。GA4へのイベント送信は行われません。'
        : '現在この端末は除外されていません。Cookieに同意している場合、アクセスが記録されます。';
    }

    var previewToggle = document.getElementById('banner-preview-toggle');
    if (previewToggle) {
      previewToggle.textContent = previewOn ? '確認モードをOFFにする' : '確認モードをONにする';
      previewToggle.disabled = !excluded;
      previewToggle.title = excluded ? '' : '除外中の端末でのみ使用します。';
    }

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('state-internal', excluded ? '除外中' : '除外していない');
    setText('state-consent', consentLabel());
    setText(
      'state-effective',
      excluded ? '計測されません（除外が最優先）'
        : consentLabel() === '同意済み' ? '計測されます' : '計測されません（Cookie未同意）'
    );
  }

  var analyticsToggle = document.getElementById('analytics-toggle');
  if (analyticsToggle) {
    analyticsToggle.addEventListener('click', function () {
      // The confirm dialog above already ran and did not cancel.
      if (read(INTERNAL_KEY) === '1') {
        remove(INTERNAL_KEY);
        remove(PREVIEW_KEY); // preview mode only makes sense while excluded
      } else {
        write(INTERNAL_KEY, '1');
      }
      renderAnalyticsState();
    });
  }

  var previewToggle = document.getElementById('banner-preview-toggle');
  if (previewToggle) {
    previewToggle.addEventListener('click', function () {
      if (read(PREVIEW_KEY) === '1') remove(PREVIEW_KEY);
      else write(PREVIEW_KEY, '1');
      renderAnalyticsState();
    });
  }

  var consentReset = document.getElementById('consent-reset');
  if (consentReset) {
    consentReset.addEventListener('click', function () {
      remove(CONSENT_KEY);
      renderAnalyticsState();
      window.alert('Cookie同意の記録を消去しました。公開サイトで再度バナーが表示されます。');
    });
  }

  renderAnalyticsState();

  /* -------------------------------------------------- news editor helpers */
  var form = document.getElementById('news-form');
  var bodyField = document.getElementById('body');

  if (bodyField) {
    var wrapSelection = function (before, after) {
      var start = bodyField.selectionStart;
      var end = bodyField.selectionEnd;
      var value = bodyField.value;
      var selected = value.slice(start, end);
      bodyField.value = value.slice(0, start) + before + selected + after + value.slice(end);
      bodyField.focus();
      bodyField.selectionStart = start + before.length;
      bodyField.selectionEnd = start + before.length + selected.length;
      bodyField.dispatchEvent(new Event('input', { bubbles: true }));
    };

    document.querySelectorAll('[data-wrap]').forEach(function (button) {
      button.addEventListener('click', function () {
        var tag = button.getAttribute('data-wrap');
        wrapSelection('<' + tag + '>', '</' + tag + '>');
      });
    });

    document.querySelectorAll('[data-list]').forEach(function (button) {
      button.addEventListener('click', function () {
        var tag = button.getAttribute('data-list');
        var start = bodyField.selectionStart;
        var end = bodyField.selectionEnd;
        var selected = bodyField.value.slice(start, end) || '項目';
        var items = selected.split('\n').filter(function (line) { return line.trim() !== ''; });
        var html = '<' + tag + '>\n'
          + items.map(function (line) { return '  <li>' + line.trim() + '</li>'; }).join('\n')
          + '\n</' + tag + '>';
        bodyField.setRangeText(html, start, end, 'end');
        bodyField.focus();
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    var linkButton = document.querySelector('[data-link]');
    if (linkButton) {
      linkButton.addEventListener('click', function () {
        var url = window.prompt('リンク先URL（https:// から入力してください）', 'https://');
        if (!url || !/^https?:\/\//i.test(url)) return;
        var start = bodyField.selectionStart;
        var end = bodyField.selectionEnd;
        var text = bodyField.value.slice(start, end) || 'リンクテキスト';
        var isExternal = url.indexOf(window.location.origin) !== 0;
        var attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        bodyField.setRangeText('<a href="' + url + '"' + attrs + '>' + text + '</a>', start, end, 'end');
        bodyField.focus();
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }

  /* --------------------------------------------------------- auto-save */
  if (form && bodyField) {
    var newsId = form.getAttribute('data-news-id');
    var stateEl = document.getElementById('autosave-state');
    var csrfInput = form.querySelector('input[name="csrf_token"]');
    var dirty = false;
    var saving = false;

    ['title', 'body', 'category', 'published_at'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { dirty = true; });
      if (el) el.addEventListener('change', function () { dirty = true; });
    });

    var setState = function (text) {
      if (stateEl) stateEl.textContent = text;
    };

    var autosave = function (manual) {
      if (saving || (!dirty && !manual)) return;
      saving = true;
      setState('自動保存中…');

      var payload = {
        id: Number(newsId),
        csrfToken: csrfInput ? csrfInput.value : '',
        title: (document.getElementById('title') || {}).value || '',
        body: bodyField.value,
        category: (document.getElementById('category') || {}).value || 'info',
        publishedAt: (document.getElementById('published_at') || {}).value || ''
      };

      fetch('/admin/news/autosave.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res); })
        .then(function (data) {
          dirty = false;
          // Says plainly that this is a draft copy, not the live article.
          setState('下書きを自動保存しました（' + data.savedAt + '）／公開内容には未反映です');
        })
        .catch(function () {
          setState('自動保存に失敗しました。ネットワークをご確認ください。');
        })
        .finally(function () { saving = false; });
    };

    window.setInterval(function () { autosave(false); }, 30000);

    var draftButton = document.getElementById('save-draft');
    if (draftButton) {
      draftButton.addEventListener('click', function () { autosave(true); });
    }

    // Leaving with unsaved edits should be a conscious choice.
    window.addEventListener('beforeunload', function (event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
    form.addEventListener('submit', function () { dirty = false; });
  }

  /* --------------------------------------------- restore an auto-saved draft */
  var restoreButton = document.getElementById('restore-autosave');
  if (restoreButton) {
    restoreButton.addEventListener('click', function () {
      if (!window.confirm('自動保存された内容をエディタに読み込みます。現在の編集内容は失われます。よろしいですか？')) {
        return;
      }
      var titleEl = document.getElementById('title');
      var template = document.getElementById('autosave-body');
      if (titleEl) titleEl.value = restoreButton.getAttribute('data-title') || '';
      if (bodyField && template) bodyField.value = template.textContent || '';
    });
  }
})();
