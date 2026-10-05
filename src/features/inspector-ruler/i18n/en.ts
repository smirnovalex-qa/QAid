// English strings for the «Ruler / spacing inspector» feature (TASK-018).
const en: Record<string, string> = {
  'feature.ruler.title': 'Ruler',
  'feature.ruler.desc':
    'Measure distances and alignment between two elements, and show the box model of a picked node (content/padding/border/margin).',

  'ruler.instructions':
    'Pick a mode: measure the gap between two elements (A↔B), or show the box model of a single element. Selection is a click on a node on the page.',
  'ruler.mode': 'Mode',
  'ruler.mode.ab': 'Between elements',
  'ruler.mode.box': 'Box model',
  'ruler.mode.free': 'Free ruler',
  'ruler.units': 'Units',
  'ruler.units.px': 'px',
  'ruler.units.rem': 'rem',
  'ruler.cancel': 'Cancel',

  // v3 «Inspect the page» — ruler.
  'ruler.seg.pair': 'Two elements',
  'ruler.seg.free': 'Free',
  'ruler.seg.box': 'Box model',
  'ruler.start': 'Start measuring',
  'ruler.stop': 'Stop measuring (Esc)',
  'ruler.remeasure': 'Measure again',
  'ruler.measuringStatus': 'measuring',
  'ruler.width': 'width',
  'ruler.height': 'height',
  'ruler.hint.ab': 'Click element A, then element B on the page.',
  'ruler.hint.free': 'Drag a rectangle anywhere on the page.',
  'ruler.hint.box': 'Click any element to see its spacing.',
  'ruler.row.vgap': 'Vertical gap',
  'ruler.row.hoffset': 'Horizontal offset',
  'ruler.row.ledge': 'Left edges differ by',
  'ruler.row.centers': 'Centers apart',

  'ruler.pickA': 'Pick A',
  'ruler.pickB': 'Pick B',
  'ruler.repickA': 'Replace A',
  'ruler.repickB': 'Replace B',
  'ruler.pickElement': 'Pick element',
  'ruler.repickElement': 'Pick another',
  'ruler.elementA': 'Element A',
  'ruler.elementB': 'Element B',
  'ruler.pickHint': 'Click, then pick an element on the page.',

  'ruler.measurement': 'Measurement',
  'ruler.gap': 'Gap',
  'ruler.overlap': 'Overlap',
  'ruler.edges': 'Edges',
  'ruler.center': 'Centers',
  'ruler.aligned': 'Alignment',
  'ruler.aligned.none': 'no matches',
  'ruler.copy': 'Copy measurement',

  'ruler.box.title': 'Box model',
  'ruler.box.content': 'Content',
  'ruler.box.padding': 'Padding',
  'ruler.box.border': 'Border',
  'ruler.box.margin': 'Margin',
  'ruler.box.size': 'Size',

  'ruler.free.hint':
    'Press “Start”, then drag a measure across the page from point A to B. Esc cancels.',
  'ruler.free.start': 'Start measuring',
  'ruler.free.snap': 'Snap to edges',
  'ruler.free.length': 'Length',
  'ruler.free.delta': 'Delta',
  'ruler.free.size': 'Size',
  'ruler.free.angle': 'Angle',

  'ruler.error.permissionDenied': 'Access to pages was declined. Grant it to measure on the tab.',
  'ruler.error.noTab': 'Could not determine the active tab.',
  'ruler.error.cancelled': 'Selection cancelled.',
  'ruler.error.generic': 'Something went wrong. Please try again.',
};

export default en;
