// Русские строки фичи «Время, хеш и UUID» (дизайн v3).
const ru: Record<string, string> = {
  'feature.tsh.title': 'Время, хеш и UUID',
  'tsh.tabs': 'Тип инструмента',
  'tsh.tab.time': 'Время',
  'tsh.tab.hash': 'Хеш',
  'tsh.tab.uuid': 'UUID',

  'tsh.clickCopy': 'нажмите, чтобы скопировать',
  'tsh.copy': 'Копировать',
  'tsh.copyAll': 'Копировать всё',
  'tsh.copiedN': 'Скопировано: {n}',

  // Время
  'tsh.time.input': 'Unix-время или дата',
  'tsh.now': 'Сейчас',
  'tsh.detect.s': 'Распознано: Unix-секунды',
  'tsh.detect.ms': 'Распознано: Unix-миллисекунды',
  'tsh.detect.iso': 'Распознано: дата',
  'tsh.detect.err': 'Не удалось распознать значение',
  'tsh.row.unixS': 'Unix, секунды',
  'tsh.row.unixMs': 'Unix, мс',
  'tsh.row.iso': 'ISO 8601 UTC',
  'tsh.row.relative': 'Относительно',
  'tsh.zone.label': 'Часовой пояс',
  'tsh.diff.title': 'Разница между датами',
  'tsh.diff.from': 'От',
  'tsh.diff.to': 'До',
  'tsh.diff.empty': 'Введите две даты',
  'tsh.unit.d': 'д',
  'tsh.unit.h': 'ч',
  'tsh.unit.m': 'м',
  'tsh.unit.s': 'с',
  'tsh.unit.ms': 'мс',

  // Хеш
  'tsh.hash.input': 'Текст',
  'tsh.hash.algo': 'Алгоритм',
  'tsh.md5.warn': 'MD5 устарел и небезопасен. Используйте только для сверки со старыми системами.',

  // UUID
  'tsh.uuid.count': 'Сколько',
  'tsh.uuid.generate': 'Сгенерировать UUID v4',
  'tsh.uuid.meta': '{n} UUID v4',
};

export default ru;
