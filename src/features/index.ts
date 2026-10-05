/**
 * Барель саморегистрации фич.
 *
 * Единственная общая правка при добавлении фичи — добавить сюда импорт её
 * `index.ts` (side-effect: регистрация в реестре фич и в реестре схем сообщений).
 * Порядок явный и детерминированный. Ничто другое в ядре при добавлении фичи не
 * редактируется (инвариант расширяемости, ARCHITECTURE §1, §13).
 */
import './random-numbers';
import './random-strings';
import './decoders';
import './timestamp-hash';
import './inspector-probe';
import './inspector-contrast';
import './inspector-palette';
import './inspector-fonts';
import './inspector-ruler';
import './storage-editor';
import './session-profiles';
import './forms';
import './environment';
import './defect-detector';
import './mock-network';
import './dom-override';
import './bug-report';
import './snapshot-diff';
import './screenshot';
import './screen-recording';
import './settings-sync';
