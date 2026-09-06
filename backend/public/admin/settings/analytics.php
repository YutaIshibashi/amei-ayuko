<?php

declare(strict_types=1);

/**
 * Analytics exclusion for this device.
 *
 * Exclusion is per *browser*, not per IP: the owner works from several
 * networks, and an IP filter would be both leaky and unreliable. The flag is a
 * localStorage entry on the site origin, which the admin area shares — so this
 * page can set it directly, and the public bundle reads it before deciding
 * whether to load GA4 at all.
 *
 * Priority is absolute: an excluded browser sends nothing, whatever the cookie
 * consent says, and including while the banner-preview mode is on.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\Auth;
use Amei\Sanitizer;
use Amei\Settings;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);
$ga4 = Settings::get('ga4_measurement_id', '');

adminHead('アクセス解析');
?>

<section class="panel">
  <h2 class="panel__title">この端末をアクセス解析から除外</h2>
  <p class="panel__note">
    制作・運用中のアクセスがGoogleアナリティクスに記録されないようにします。
    設定は<strong>このブラウザにのみ</strong>保存されます（IPアドレスでは判定していません）。
    別の端末やブラウザ、シークレットウィンドウでは、それぞれ設定が必要です。
  </p>

  <p class="banner banner--warn" id="analytics-state" hidden></p>

  <div class="actions" style="margin-top:0">
    <button class="btn" type="button" id="analytics-toggle"
            data-confirm-on="この端末をアクセス解析から除外します。よろしいですか？"
            data-confirm-off="除外を解除します。この端末のアクセスがGA4に記録されるようになります。よろしいですか？">
      読み込み中…
    </button>
  </div>

  <p class="panel__note" style="margin-top:16px">
    除外中は、公開サイトの右下に小さく「Analytics OFF」バッジが表示されます
    （一般の閲覧者には表示されません）。バッジをクリックすると、この画面に戻ってきます。
  </p>
</section>

<section class="panel">
  <h2 class="panel__title">Cookieバナー確認モード</h2>
  <p class="panel__note">
    除外中の端末では、通常Cookieバナーは表示されません。
    表示の確認をしたいときだけ、このモードをONにしてください。
    <strong>このモード中もGA4へのデータ送信は行われません。</strong>
    バナーで「同意する」「拒否する」のいずれかを1回操作すると、確認モードは自動的にOFFになります。
  </p>

  <div class="actions" style="margin-top:0">
    <button class="btn btn--ghost" type="button" id="banner-preview-toggle">読み込み中…</button>
    <button class="btn btn--ghost" type="button" id="consent-reset">保存済みのCookie同意状態をリセット</button>
  </div>
</section>

<section class="panel">
  <h2 class="panel__title">計測の状態</h2>
  <table class="table">
    <tbody>
      <tr>
        <th scope="row">GA4 測定ID</th>
        <td class="mono"><?= $ga4 === '' ? '<span class="muted">未設定（GA4は読み込まれません）</span>' : $e($ga4) ?></td>
      </tr>
      <tr>
        <th scope="row">この端末の除外設定</th>
        <td id="state-internal" class="mono">—</td>
      </tr>
      <tr>
        <th scope="row">この端末のCookie同意</th>
        <td id="state-consent" class="mono">—</td>
      </tr>
      <tr>
        <th scope="row">実際に計測されるか</th>
        <td id="state-effective" class="mono">—</td>
      </tr>
    </tbody>
  </table>
  <p class="panel__note" style="margin:12px 0 0">
    GA4の測定IDは<a href="/admin/settings/site.php">サイト設定</a>から変更できます。
  </p>
</section>

<?php
adminFoot();
