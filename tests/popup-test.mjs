// Exercises the cancel dialog exactly the way the Host plugin launches it:
// production argv from lib/popup.js handed to a PowerShell child process.
//
// The dialog test modes exist only for automation:
//   -SelfTest        show the window, close it after ~2.2s
//   -SimulateCancel  programmatically click the cancel button after ~1.2s and
//                    run -TestCancelCommand instead of the real cancel command
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPopupArgs, popupExecutable } from '../lib/popup.js'

async function runDialog(name, delaySeconds, extra, expected) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-auto-shutdown-popup-'))
  const logPath = join(dir, 'dialog.log')
  const args = buildPopupArgs(delaySeconds, logPath).concat(extra)
  const child = spawn(popupExecutable(), args, { windowsHide: true, stdio: 'ignore' })
  const timeout = setTimeout(() => child.kill(), 30_000)
  const code = await new Promise((resolve) => {
    child.on('error', () => resolve(-1))
    child.on('exit', (value) => resolve(value ?? -1))
  })
  clearTimeout(timeout)
  let log = ''
  try {
    log = await readFile(logPath, 'utf8')
  } catch {
    log = ''
  }
  await rm(dir, { recursive: true, force: true })
  const missing = expected.filter((line) => !log.includes(line))
  const ok = code === 0 && missing.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (exit ${code})`)
  if (!ok) {
    console.log(`  missing: ${missing.join(' | ') || '(none)'}`)
    console.log(`  log:\n${log.replace(/^/gm, '    ')}`)
  }
  return ok
}

const results = []
results.push(await runDialog('self-test closes itself', 6, ['-SelfTest'], [
  'form shown; seconds=6',
  'selftest closing',
  'form closed',
  'exit',
]))
results.push(
  await runDialog('cancel button runs the cancel command', 10, ['-SimulateCancel', '-TestCancelCommand', 'cmd /c exit 0'], [
    'form shown; seconds=10',
    'cancel clicked',
    'running: cmd /c exit 0',
    'exit code: 0',
    'exit',
  ]),
)
results.push(
  await runDialog('cancel failure is reported', 10, ['-SimulateCancel', '-TestCancelCommand', 'cmd /c exit 3'], [
    'cancel clicked',
    'running: cmd /c exit 3',
    'exit code: 3',
  ]),
)
results.push(
  await runDialog('real cancel command is accepted (nothing pending -> 1116)', 10, ['-SimulateCancel', '-TestCancelCommand', 'shutdown /a'], [
    'cancel clicked',
    'running: shutdown /a',
    'exit code: 1116',
  ]),
)

if (results.every(Boolean)) {
  console.log('popup wiring checks passed')
} else {
  console.log('popup wiring checks FAILED')
  process.exitCode = 1
}
