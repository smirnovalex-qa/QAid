/** Фикстуры аннотаций для тестов рендер-плана/истории (TASK-027). */
import type { Annotation } from '@/features/screenshot/types';

export const rectangle: Annotation = {
  kind: 'rectangle',
  id: 'a0',
  color: '#e5484d',
  thickness: 4,
  x: 10,
  y: 20,
  width: 100,
  height: 40,
};

/** Рамка, нарисованная «в обратную сторону» (отрицательные размеры). */
export const rectangleReversed: Annotation = {
  kind: 'rectangle',
  id: 'a1',
  color: '#0091ff',
  thickness: 2,
  x: 110,
  y: 60,
  width: -100,
  height: -40,
};

export const arrow: Annotation = {
  kind: 'arrow',
  id: 'a2',
  color: '#30a46c',
  thickness: 3,
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 0,
};

export const freehand: Annotation = {
  kind: 'freehand',
  id: 'a3',
  color: '#111111',
  thickness: 5,
  points: [
    { x: 0, y: 0 },
    { x: 5, y: 10 },
    { x: 12, y: 8 },
  ],
};

export const text: Annotation = {
  kind: 'text',
  id: 'a4',
  color: '#111111',
  thickness: 4,
  x: 30,
  y: 40,
  text: 'note',
  fontSize: 24,
};

export const blur: Annotation = {
  kind: 'blur',
  id: 'a5',
  color: '#000000',
  thickness: 1,
  x: 5,
  y: 5,
  width: 20,
  height: 20,
};

export const all: Annotation[] = [rectangle, arrow, freehand, text, blur];
