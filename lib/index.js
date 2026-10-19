import { spawn } from 'node:child_process'
import z from '@deepseek-ai/schemastery'
import { schedulePopup } from './popup.js'

/** Cordis plugin name (also the Settings namespace of this entry). */
export const name = 'auto-shutdown'

/** Host services required by the one-shot shutdown trigger. */
export const inject = ['agents', 'settings']

/**
 * Validated configuration. Every field is volatile: the Settings row and the
 * Plugins page can edit them while the Host keeps running, without a reload.
 * `enabled` is reset to false right before a shutdown is scheduled, so the
 * plugin fires exactly once and never re-arms itself after a reboot.
 */
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  delaySeconds: z.number().step(1).min(5).max(86400).default(60).volatile(),
  popup: z.boolean().default(true).volatile(),
})

const COMMENT = 'DeepSeek Harness: conversation finished'

/** Test switch: log the commands instead of scheduling a real shutdown. */
export function isDryRun() {
  const flag = process.env.DSH_AUTO_SHUTDOWN_DRYRUN
  return flag === '1' || flag === 'true'
}

/** Absolute path to shutdown.exe so PATH differences cannot redirect it. */
export function shutdownExecutable() {
  const root = process.env.SystemRoot || process.env.windir
  return root ? `${root}\\System32\\shutdown.exe` : 'shutdown'
}

/** Schedule the Windows shutdown, or only log it in dry-run mode. */
function scheduleShutdown(logger, delaySeconds, dryRun) {
  const args = ['/s', '/t', String(delaySeconds), '/c', COMMENT]
  const command = `"${shutdownExecutable()}" ${args.join(' ')}`
  if (dryRun) {
    logger.warn(`auto-shutdown: dry run, would execute ${command}`)
    return false
  }
  try {
    const child = spawn(shutdownExecutable(), args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', (error) => {
      logger.error(`auto-shutdown: could not start shutdown: ${error.message}`)
    })
    child.unref()
    logger.info(`auto-shutdown: executed ${command}`)
    return true
  } catch (error) {
    logger.error(`auto-shutdown: could not start shutdown: ${error.message}`)
    return false
  }
}

/**
 * Host half: arm on `agent/turn-stopping` for a root agent once enabled, reset
 * the switch, schedule the shutdown after the configured delay, then open the
 * cancel dialog so a single click can abort it with `shutdown /a`.
 * @param ctx - Host plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx, config) {
  const logger = ctx.logger
  let fired = false

  /** Only a user-facing root conversation may arm the shutdown, never a teammate. */
  function isRootAgent(agent) {
    return ctx.agents.roots().some((root) => root.id === agent.id)
  }

  /** Another live agent still running means this is not the last conversation. */
  function anotherAgentRunning(self) {
    return ctx.agents.list().some((agent) => agent.id !== self.id && agent.status === 'running')
  }

  /** Persist enabled=false so a reboot cannot re-arm the one-shot trigger. */
  async function disarm() {
    try {
      await ctx.settings.mutate(name, [{ op: 'set', path: ['enabled'], value: false }])
    } catch (error) {
      logger.warn(`auto-shutdown: could not reset enabled: ${error.message}`)
    }
  }

  // A listener that never objects, so it must not hold the turn boundary open:
  // latch the fact synchronously, then do the write and the spawns off the event.
  ctx.on('agent/turn-stopping', ({ agent }) => {
    if (fired || !config.enabled.get()) return
    if (!isRootAgent(agent)) return
    if (anotherAgentRunning(agent)) return
    fired = true
    const delaySeconds = Math.max(5, Math.round(config.delaySeconds.get()))
    const dryRun = isDryRun()
    const popup = config.popup.get() === true
    void (async () => {
      await disarm()
      scheduleShutdown(logger, delaySeconds, dryRun)
      if (popup) schedulePopup(logger, delaySeconds, dryRun)
    })().catch((error) => {
      logger.error(`auto-shutdown: failed to arm the shutdown: ${error.message}`)
    })
  })
}
