// English strings for the «Screen recording with audio» feature (TASK-037).
const en: Record<string, string> = {
  'feature.screenRecording.title': 'Screen recording',
  'feature.screenRecording.desc':
    'Record a screen, window, or tab with microphone and system audio. Pick what to share each time in the browser dialog; the finished clip is available to preview and download — all local, nothing is uploaded.',

  // Audio options.
  'screenRecording.audio': 'Audio',
  'screenRecording.audio.none': 'no sound',
  'screenRecording.mic': 'Microphone',
  'screenRecording.mic.help': 'Talk through what you see',
  'screenRecording.systemAudio': 'Page sound',
  'screenRecording.systemAudio.help': 'Turn on “Share audio” in the next window',
  'screenRecording.max': 'max',

  // Duration limit.
  'screenRecording.duration': 'Maximum duration',
  'screenRecording.stopsAfter': 'Stop automatically after',
  'screenRecording.duration.min': '{count} min',

  // Control buttons.
  'screenRecording.start': 'Choose what to record',
  'screenRecording.stop': 'Stop',
  'screenRecording.pause': 'Pause',
  'screenRecording.resume': 'Resume',
  'screenRecording.stopsIn': 'Stops in',
  'screenRecording.rec': 'REC',
  'screenRecording.pausedShort': 'paused',

  // Live indicators.
  'screenRecording.timer': 'Recording duration',
  'screenRecording.size': 'Size',
  'screenRecording.sizeWarning':
    'The file is nearing the soft size limit — stop recording so the clip is not lost.',

  // State statuses.
  'screenRecording.status.requesting': 'Requesting the source…',
  'screenRecording.status.recording': 'Recording',
  'screenRecording.status.paused': 'Paused',
  'screenRecording.status.finalizing': 'Assembling the file…',

  // Result / export.
  'screenRecording.preview': 'Recording preview',
  'screenRecording.play': 'Play',
  'screenRecording.format': 'Download format',
  'screenRecording.fmt.webm': 'Video (WebM)',
  'screenRecording.fmt.gif': 'GIF',
  'screenRecording.gifNote': 'GIF has no sound. Best for short demos up to 30 s.',
  'screenRecording.download': 'Download video',
  'screenRecording.confirmDownload': 'Download the recorded clip as a WebM file to your device?',
  'screenRecording.downloaded': 'Video saved to Downloads',
  'screenRecording.downloadGif': 'Download GIF',
  'screenRecording.confirmDownloadGif':
    'Convert this recording to an animated GIF and download it? GIF has no audio and uses a reduced frame rate and size — best for short clips.',
  'screenRecording.gifExporting': 'Making GIF…',
  'screenRecording.gifDownloaded': 'GIF saved to Downloads',
  'screenRecording.again': 'Record again',
  'screenRecording.discard': 'Delete',
  'screenRecording.confirm': 'Confirm',
  'screenRecording.cancel': 'Cancel',

  // Privacy.
  'screenRecording.privacy':
    'The browser will ask what to share: a tab, a window or the whole screen. Nothing is uploaded.',

  // Errors.
  'screenRecording.error.startFailed': 'Could not start recording. Please try again.',
  'screenRecording.error.cancelled': 'Recording cancelled.',
  'screenRecording.error.permissionDenied': 'Access was declined. Allow capture to record.',
  'screenRecording.error.micDenied':
    'Microphone access was declined. Allow the microphone or turn it off, then start again.',
  'screenRecording.error.unsupported': 'Video recording is not supported by this browser.',
  'screenRecording.error.captureFailed': 'Could not build the capture stream.',
  'screenRecording.error.recorderFailed': 'The recorder failed during capture.',
  'screenRecording.error.noData': 'The recording finished empty — no data.',
  'screenRecording.error.download': 'Could not prepare the file for download.',
  'screenRecording.error.gifExport':
    'Could not build the GIF. Try a shorter clip, or download the WebM instead.',
};

export default en;
