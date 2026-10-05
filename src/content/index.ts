/**
 * Точка входа content-скрипта (ISOLATED world).
 *
 * Инъекция — по требованию из фич (в манифесте не объявляется). По умолчанию
 * поднимает релей MAIN↔background — единственный путь для MAIN-world скрипта
 * достучаться до расширения.
 */
import { installRelay } from './relay';

installRelay();
