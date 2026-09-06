<?php

declare(strict_types=1);

namespace Amei;

/**
 * Raised when a sync run is rejected by validation rather than by an error.
 *
 * Distinct from a generic RuntimeException so `commit.php` can return the
 * validation summary to GitHub Actions (and the notification mail) instead of
 * a generic 500.
 */
final class SyncValidationException extends \RuntimeException
{
}
