import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Desktop dialog copy; kept here so the PowerShell script stays ASCII-only. */
export const POPUP_COPY = {
  TitleText: 'DSH 自动关机',
  HeadlineFormat: '电脑将在 {0} 秒后自动关机',
  BodyText: '对话已完成。点击「取消关机」可中止本次关机，点击「继续关机」保持计划。',
  CancelLabel: '取消关机',
  KeepLabel: '继续关机',
  CancelledText: '已发送取消指令，电脑将保持开机。',
  CancelFailedFormat: '取消失败（代码 {0}）。',
  ClosedText: '保持计划，将按计划关机。',
}

/** Absolute path of the dialog script shipped next to this module. */
export const POPUP_SCRIPT = fileURLToPath(new URL('../assets/notify.ps1', import.meta.url))

/** Windows PowerShell 5.1 is the only host guaranteed to ship WinForms. */
export function popupExecutable() {
  const root = process.env.SystemRoot || process.env.windir
  return root
    ? `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell.exe'
}

/** Optional file the dialog appends its user actions to, for troubleshooting. */
export function popupLogPath() {
  const path = process.env.DSH_AUTO_SHUTDOWN_POPUP_LOG
  return path ? path.trim() : ''
}

/**
 * Build the exact argv of the cancel dialog process: the production copy plus
 * the countdown. Keeping this pure makes the wiring testable.
 * @param delaySeconds - shutdown delay shown by the countdown.
 * @param logPath - optional action log file written by the dialog.
 */
export function buildPopupArgs(delaySeconds, logPath = '') {
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    POPUP_SCRIPT,
    '-Seconds',
    String(delaySeconds),
  ]
  for (const [key, value] of Object.entries(POPUP_COPY)) {
    args.push(`-${key}`, value)
  }
  if (logPath) {
    args.push('-LogPath', logPath)
  }
  return args
}

/**
 * Open the desktop dialog that lets the user abort the scheduled shutdown.
 * The dialog only runs `shutdown /a`; it never schedules anything itself.
 * @param logger - plugin logger.
 * @param delaySeconds - countdown shown by the dialog.
 * @param dryRun - log the command without opening a window.
 */
export function schedulePopup(logger, delaySeconds, dryRun) {
  const args = buildPopupArgs(delaySeconds, popupLogPath())
  const command = `"${popupExecutable()}" ${args.join(' ')}`
  if (dryRun) {
    logger.warn(`auto-shutdown: dry run, would show the cancel dialog (${command})`)
    return
  }
  try {
    const child = spawn(popupExecutable(), args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', (error) => {
      logger.error(`auto-shutdown: could not show the cancel dialog: ${error.message}`)
    })
    child.unref()
    logger.info('auto-shutdown: cancel dialog shown; clicking it runs shutdown /a')
  } catch (error) {
    logger.error(`auto-shutdown: could not show the cancel dialog: ${error.message}`)
  }
}
