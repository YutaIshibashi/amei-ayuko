-- Rollback for 001_initial.sql. Destructive: drops every application table.
-- Only ever useful on a fresh environment that has no real data yet.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `news_autosaves`;
DROP TABLE IF EXISTS `news`;
DROP TABLE IF EXISTS `uncategorized_products`;
DROP TABLE IF EXISTS `sync_sessions`;
DROP TABLE IF EXISTS `product_category_overrides`;
DROP TABLE IF EXISTS `contact_throttle`;
DROP TABLE IF EXISTS `contact_types`;
DROP TABLE IF EXISTS `main_visuals`;
DROP TABLE IF EXISTS `site_settings`;
DROP TABLE IF EXISTS `admin_operation_logs`;
DROP TABLE IF EXISTS `admin_login_attempts`;
DROP TABLE IF EXISTS `admin_users`;
SET FOREIGN_KEY_CHECKS = 1;
DELETE FROM `migration_history` WHERE `migration_name` = '001_initial.sql';
