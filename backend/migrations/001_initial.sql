-- =============================================================================
-- 001_initial.sql — base schema
--
-- Charset is utf8mb4 throughout (emoji appear in product titles and news
-- bodies); collation utf8mb4_unicode_ci. Apply manually via phpMyAdmin, then
-- record the file name in migration_history (the final statement does that).
-- =============================================================================
SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- --------------------------------------------------------------------------
-- Applied migrations
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `migration_history` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `migration_name` VARCHAR(191) NOT NULL,
  `applied_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_migration_name` (`migration_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Admin (exactly one account; no roles, no self-service reset)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login throttling. The IP is stored hashed: it is only ever compared, never
-- displayed, so there is no reason to keep it in the clear.
CREATE TABLE IF NOT EXISTS `admin_login_attempts` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`     VARCHAR(64) NOT NULL,
  `ip_hash`      CHAR(64) NOT NULL,
  `success`      TINYINT(1) NOT NULL DEFAULT 0,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_time` (`ip_hash`, `attempted_at`),
  KEY `idx_user_time` (`username`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_operation_logs` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip`          VARCHAR(45) NOT NULL DEFAULT '',
  `action`      VARCHAR(64) NOT NULL,
  `target_id`   VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_occurred` (`occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Editable site settings (key/value; the app owns the key list)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `site_settings` (
  `setting_key`   VARCHAR(64) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Hero main visual — image only, most recent 3 kept
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `main_visuals` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `image_path`  VARCHAR(255) NOT NULL,
  `width`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `height`      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `is_current`  TINYINT(1) NOT NULL DEFAULT 0,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_current` (`is_current`, `uploaded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- News
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `news` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`              VARCHAR(255) NOT NULL DEFAULT '',
  `body`               MEDIUMTEXT NOT NULL,
  `category`           VARCHAR(32) NOT NULL DEFAULT 'info',
  `status`             ENUM('draft','scheduled','published','private') NOT NULL DEFAULT 'draft',
  -- Scheduled publication is expressed purely as a condition on this column
  -- (`published_at <= NOW()`), so no cron job is needed.
  `published_at`       DATETIME DEFAULT NULL,
  -- Set only when a *published* article's content is edited; drives both the
  -- visible "更新" date and dateModified.
  `content_updated_at` DATETIME DEFAULT NULL,
  `image_path`         VARCHAR(255) DEFAULT NULL,
  `image_width`        SMALLINT UNSIGNED DEFAULT NULL,
  `image_height`       SMALLINT UNSIGNED DEFAULT NULL,
  `related_product_id` VARCHAR(32) DEFAULT NULL,
  `deleted_at`         DATETIME DEFAULT NULL,
  `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Covers the public query: not deleted + published + published_at <= now,
  -- ordered by published_at DESC.
  KEY `idx_public` (`deleted_at`, `status`, `published_at`),
  KEY `idx_admin_list` (`deleted_at`, `published_at`),
  KEY `idx_related_product` (`related_product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auto-save is a separate row so an in-progress edit can never leak into the
-- published article. Only the "更新" action copies it across.
CREATE TABLE IF NOT EXISTS `news_autosaves` (
  `news_id`      INT UNSIGNED NOT NULL,
  `title`        VARCHAR(255) NOT NULL DEFAULT '',
  `body`         MEDIUMTEXT NOT NULL,
  `category`     VARCHAR(32) NOT NULL DEFAULT 'info',
  `published_at` DATETIME DEFAULT NULL,
  `saved_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`news_id`),
  CONSTRAINT `fk_autosave_news` FOREIGN KEY (`news_id`) REFERENCES `news` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Contact
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contact_types` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `label`      VARCHAR(100) NOT NULL,
  `help_text`  VARCHAR(255) NOT NULL DEFAULT '',
  `sort_order` SMALLINT NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rate limiting and duplicate-submission detection only.
-- Deliberately holds NO message content and no plain e-mail address: enquiry
-- bodies are delivered by mail and never stored in the database.
CREATE TABLE IF NOT EXISTS `contact_throttle` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_hash`      CHAR(64) NOT NULL,
  `fingerprint`  CHAR(64) NOT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ip_time` (`ip_hash`, `submitted_at`),
  KEY `idx_fingerprint` (`fingerprint`, `submitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Shop sync
-- --------------------------------------------------------------------------
-- Manual category assignments win over the automatic classifier, for good.
CREATE TABLE IF NOT EXISTS `product_category_overrides` (
  `product_id` VARCHAR(32) NOT NULL,
  `category`   VARCHAR(32) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sync_sessions` (
  `sync_id`             CHAR(32) NOT NULL,
  `status`              ENUM('running','committed','failed','aborted') NOT NULL DEFAULT 'running',
  `started_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`         DATETIME DEFAULT NULL,
  `total_products`      INT UNSIGNED NOT NULL DEFAULT 0,
  `album_flake_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  `stamp_count`         INT UNSIGNED NOT NULL DEFAULT 0,
  `uncategorized_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `added_count`         INT UNSIGNED NOT NULL DEFAULT 0,
  `removed_count`       INT UNSIGNED NOT NULL DEFAULT 0,
  `image_success_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `image_failure_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `http_status`         SMALLINT UNSIGNED DEFAULT NULL,
  `error_summary`       VARCHAR(500) DEFAULT NULL,
  `previous_success_at` DATETIME DEFAULT NULL,
  `temp_purged`         TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`sync_id`),
  KEY `idx_started` (`started_at`),
  KEY `idx_status_time` (`status`, `finished_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products the classifier could not place. Hidden from the public site,
-- listed in the admin screen, and mailed to the administrator once.
CREATE TABLE IF NOT EXISTS `uncategorized_products` (
  `product_id`  VARCHAR(32) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `url`         VARCHAR(500) NOT NULL DEFAULT '',
  `detected_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notified`    TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Seed data
-- --------------------------------------------------------------------------
INSERT INTO `contact_types` (`label`, `help_text`, `sort_order`) VALUES
  ('ロゴ制作',     '用途やイメージをご記載ください', 10),
  ('名刺デザイン', 'ご希望の枚数や雰囲気をご記載ください', 20),
  ('チラシデザイン', 'イベント内容や配布時期をご記載ください', 30),
  ('商品について', '商品名や商品URLをご記載ください', 40),
  ('その他',       'ご相談内容をご記載ください', 50)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT INTO `site_settings` (`setting_key`, `setting_value`) VALUES
  ('site_title',                  'amei ayuko'),
  ('meta_description',            '3児のママがつくる、手描きのアルバムフレーク・ラバースタンプ。子どもの成長をかわいく残す紙モノと、ロゴ・名刺・チラシのデザイン制作。'),
  ('ogp_image',                   '/brand/ogp-default.png'),
  ('ga4_measurement_id',          ''),
  ('search_console_verification', ''),
  ('instagram_url',               'https://www.instagram.com/amei_ayuko/'),
  ('minne_url',                   'https://minne.com/@amei-ayuko'),
  ('creema_url',                  'https://www.creema.jp/c/amei-ayuko'),
  ('mercari_url',                 'https://jp.mercari.com/user/profile/417108594'),
  ('inframe_url',                 'https://amei-ayuko.shop-inframe.jp/'),
  ('base_url',                    'https://ameiayuko.base.shop/'),
  ('rakuma_url',                  'https://fril.jp/shop/1e35a79cae65e567618ec8a3143e05f4'),
  ('copyright',                   '© amei ayuko'),
  ('brand_concept',               'ママの“あったらいいな”をカタチに。小さな成長を可愛く残す手描き紙モノ'),
  ('about_intro',                 '3児の子育てのなかで生まれた「こういうの欲しかった！」を、ひとつずつ手描きでカタチにしています。'),
  ('contact_intro',               'ロゴ・名刺・チラシなどのデザイン制作、商品についてのご質問はこちらからどうぞ。'),
  ('footer_copy',                 'ちいさな成長を、かわいく残す。'),
  ('contact_admin_email',         ''),
  ('contact_reply_from_name',     'amei ayuko'),
  ('contact_reply_subject',       '【amei ayuko】お問い合わせありがとうございます'),
  ('contact_reply_body',          "この度はお問い合わせいただき、ありがとうございます。\n以下の内容で承りました。内容を確認のうえ、2〜3営業日以内にご返信いたします。")
ON DUPLICATE KEY UPDATE `setting_value` = `site_settings`.`setting_value`;

INSERT INTO `migration_history` (`migration_name`) VALUES ('001_initial.sql')
ON DUPLICATE KEY UPDATE `applied_at` = `migration_history`.`applied_at`;
