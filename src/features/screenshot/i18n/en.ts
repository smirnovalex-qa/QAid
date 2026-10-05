// English strings for the «Screenshot with annotations» feature (TASK-027).
const en: Record<string, string> = {
  'feature.screenshot.title': 'Screenshot',
  'feature.screenshot.desc':
    'Capture the visible area, a picked element or the full page, then annotate (box, arrow, line, text, redaction). Export to PNG — copy or download, all local.',

  'screenshot.capture': 'Capture',
  'screenshot.cancel': 'Cancel',
  'screenshot.options': 'More options',
  'screenshot.retake': 'New screenshot',
  'screenshot.idleNote': 'Screenshots stay on your computer.',

  // In-page («frozen screen») editor (TASK-035).
  'screenshot.inPage': 'Edit on page',
  'screenshot.inPage.hint':
    'Freeze the current tab’s viewport and select/annotate right on the page (visible area only).',
  'screenshot.inPage.fullFallback':
    'Full-page can’t be frozen instantly — opening the side-panel editor instead.',
  'screenshot.inPage.blockedFallback':
    'This page can’t host the in-page editor (privileged/blocked page) — opened in the side panel.',
  'screenshot.inPage.close': 'Close',
  'screenshot.inPage.thicker': 'Thicker',
  'screenshot.inPage.thinner': 'Thinner',
  'screenshot.inPage.toolbar': 'Screenshot tools',
  'screenshot.inPage.hintSelect': 'Drag to select an area · Esc to cancel',

  'screenshot.mode': 'Capture mode',
  'screenshot.mode.visible': 'Visible area',
  'screenshot.mode.element': 'One element',
  'screenshot.mode.full': 'Full page',
  'screenshot.mode.visible.help': 'What is on screen right now',
  'screenshot.mode.element.help': 'Click an element on the page',
  'screenshot.mode.full.help': 'Scrolls and stitches everything',

  'screenshot.hint.visible': 'Capture the tab’s current visible area.',
  'screenshot.hint.element':
    'Pick an element on the page — its area is captured (must be within the viewport).',
  'screenshot.hint.full':
    'Scroll-stitch is best-effort: sticky/fixed elements and lazy content may duplicate or shift. Not pixel-perfect.',

  'screenshot.tools': 'Annotation tools',
  'screenshot.tool.rectangle': 'Box',
  'screenshot.tool.arrow': 'Arrow',
  'screenshot.tool.freehand': 'Pen',
  'screenshot.tool.text': 'Text',
  'screenshot.tool.blur': 'Blur',

  'screenshot.color': 'Colour',
  'screenshot.colorCustom': 'Pick a custom colour',
  'screenshot.color.red': 'Red',
  'screenshot.color.yellow': 'Yellow',
  'screenshot.color.blue': 'Blue',
  'screenshot.color.black': 'Black',
  'screenshot.thickness': 'Thickness',
  'screenshot.width.thin': 'Thin',
  'screenshot.width.medium': 'Medium',
  'screenshot.width.thick': 'Thick',
  'screenshot.blurHint': 'Blur is burned into the image — it can’t be removed later.',
  'screenshot.drawHint': 'Click on the image to add a mark.',

  'screenshot.textLabel': 'Caption',
  'screenshot.textPlaceholder': 'Caption text…',
  'screenshot.textHint':
    'Click the screenshot where the caption goes, then type (Enter to place, Esc to cancel).',

  'screenshot.canvasLabel': 'Screenshot canvas — draw annotations with the mouse',
  'screenshot.undo': 'Undo',
  'screenshot.redo': 'Redo',
  'screenshot.clear': 'Clear',

  'screenshot.copy': 'Copy',
  'screenshot.download': 'Download PNG',
  'screenshot.copied': 'PNG copied to clipboard',
  'screenshot.downloaded': 'File downloaded',

  'screenshot.error.capture': 'Could not capture. Please try again.',
  'screenshot.error.permissionDenied': 'Page access was declined. Grant it to capture.',
  'screenshot.error.noTab': 'Could not resolve the active tab (privileged page?).',
  'screenshot.error.cancelled': 'Selection cancelled.',
  'screenshot.error.export': 'Could not prepare the image for export.',
  'screenshot.error.copy': 'Could not copy the image to the clipboard.',
};

export default en;
