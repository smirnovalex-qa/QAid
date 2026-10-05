// Русские строки фичи «Случайные числа».
const ru: Record<string, string> = {
  'feature.rn.title': 'Случайные числа',
  'rn.mode': 'Тип',
  'rn.integer': 'Целые',
  'rn.float': 'Дробные',
  'rn.min': 'Минимум',
  'rn.max': 'Максимум',
  'rn.precision': 'Знаков после запятой',
  'rn.count': 'Сколько',
  'rn.separator': 'Разделитель',
  'rn.sep.comma': 'Запятая',
  'rn.sep.newline': 'Новая строка',
  'rn.sep.space': 'Пробел',
  'rn.generate': 'Сгенерировать',
  'rn.copy': 'Копировать',
  'rn.output': 'Результат',
  'rn.meta': '{n} чисел · от {a} до {b}',
  'rn.err.non_finite': 'Введите числа в поля «Минимум» и «Максимум».',
  'rn.err.int_bounds': 'Для целых чисел границы должны быть целыми.',
  'rn.err.min_gt_max': 'Минимум больше максимума.',
  'rn.err.count_range': 'Количество — от 1 до 100 000.',
  'rn.err.precision_range': 'Знаков после запятой — от 0 до 100.',
  'rn.warn.count_clamped': 'Количество ограничено 100 000',
};

export default ru;
