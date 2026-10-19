// Dry-run behaviour check for the Host half: no real shutdown is ever started.
process.env.DSH_AUTO_SHUTDOWN_DRYRUN = '1'

import assert from 'node:assert/strict'
import { apply } from './lib/index.js'

const live = []
const warns = []

function makeConfig(enabled, delaySeconds = 30, popup = true) {
  return {
    enabled: { get: () => enabled },
    delaySeconds: { get: () => delaySeconds },
    popup: { get: () => popup },
  }
}

function makeContext({ roots, running = [], mutate }) {
  const handlers = {}
  return {
    logger: {
      info: (line) => live.push(line),
      warn: (line) => warns.push(line),
      error: (line) => warns.push(line),
    },
    agents: {
      roots: () => roots,
      list: () => [...new Set([...roots, ...running])],
    },
    settings: { mutate },
    on: (event, handler) => {
      handlers[event] = handler
    },
    emit: async (event, payload) => {
      handlers[event](payload)
      await new Promise((resolve) => setTimeout(resolve, 20))
    },
  }
}

const root = { id: 'root', status: 'idle' }
const child = { id: 'child', status: 'idle' }
const other = { id: 'other', status: 'running' }

// 1. Disabled: no write, no schedule.
{
  const writes = []
  const ctx = makeContext({
    roots: [root],
    mutate: async (ns, ops) => writes.push([ns, ops]),
  })
  apply(ctx, makeConfig(false))
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 1 })
  assert.equal(writes.length, 0)
  assert.equal(live.length, 0)
}

// 2. Enabled but the turn belongs to a subagent: ignored.
{
  const writes = []
  const ctx = makeContext({
    roots: [root],
    mutate: async (ns, ops) => writes.push([ns, ops]),
  })
  apply(ctx, makeConfig(true))
  await ctx.emit('agent/turn-stopping', { agent: child, turn: 1 })
  assert.equal(writes.length, 0)
}

// 3. Enabled, root turn, but another agent still runs: deferred.
{
  const writes = []
  const ctx = makeContext({
    roots: [root],
    running: [other],
    mutate: async (ns, ops) => writes.push([ns, ops]),
  })
  apply(ctx, makeConfig(true))
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 1 })
  assert.equal(writes.length, 0)
}

// 4. Enabled, last conversation finished: disarm once, then dry-run both actions.
{
  const writes = []
  const ctx = makeContext({
    roots: [root],
    mutate: async (ns, ops) => writes.push([ns, ops]),
  })
  apply(ctx, makeConfig(true, 30))
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 3 })
  const lines = warns.join('\n')
  assert.deepEqual(writes, [
    ['auto-shutdown', [{ op: 'set', path: ['enabled'], value: false }]],
  ])
  assert.match(lines, /dry run/)
  assert.match(lines, /\/s \/t 30/)
  assert.match(lines, /would show the cancel dialog/)
  assert.match(lines, /-CancelLabel/)
  assert.match(lines, /notify\.ps1/)
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 4 })
  assert.equal(writes.length, 1)
}

// 5. popup: false schedules the shutdown but never opens the dialog.
{
  warns.length = 0
  live.length = 0
  const ctx = makeContext({ roots: [root], mutate: async () => {} })
  apply(ctx, makeConfig(true, 15, false))
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 5 })
  assert.match(warns.join('\n'), /\/s \/t 15/)
  assert.doesNotMatch(warns.join('\n'), /cancel dialog/)
}

// 6. A failing settings write must not stop the shutdown scheduling.
{
  const ctx = makeContext({
    roots: [root],
    mutate: async () => {
      throw new Error('settings offline')
    },
  })
  apply(ctx, makeConfig(true, 5))
  await ctx.emit('agent/turn-stopping', { agent: root, turn: 7 })
  assert.match(warns.join('\n'), /could not reset enabled: settings offline/)
  assert.match(warns.join('\n'), /\/s \/t 5/)
}

console.log('host dry-run checks passed')