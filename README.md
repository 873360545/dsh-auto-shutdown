# dsh-auto-shutdown

[中文说明](#中文说明) · Windows only · works with DeepSeek Harness ≥ 0.2.1

A DeepSeek Harness plugin that adds **one switch in Settings → General**: turn it on, and
the computer shuts itself down when the next conversation finishes — with a native
Windows dialog that can cancel the pending shutdown with a single click.

## Install

```powershell
dsh plugin add github:873360545/dsh-auto-shutdown
```

Or install a prebuilt tarball from a GitHub Release:

```powershell
dsh plugin add https://github.com/873360545/dsh-auto-shutdown/releases/latest/download/dsh-auto-shutdown.tgz
```

Then restart the Harness (Host restart is enough) and look for the plugin entry
`auto-shutdown` in the profile.

## Use

1. Open **Settings → General** and find **“Power off after the conversation finishes”**.
2. Turn it on.
3. Finish a conversation: when that turn ends, the plugin
   - resets the switch to off (it is a one-shot trigger, never re-armed by a reboot),
   - schedules `shutdown.exe /s /t <delaySeconds>`,
   - opens a desktop countdown dialog.

The dialog offers:

| Button | Result |
| --- | --- |
| **Cancel shutdown** | runs `shutdown /a`; the machine stays up |
| **Keep shutdown** / close / countdown reaching zero | the planned shutdown happens |

You can also cancel from any terminal with `shutdown /a`.

## Configuration

All three fields are editable live from the Settings page and the Plugins page — no restart.

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | The switch. It is set back to `false` right before a shutdown is scheduled, so the trigger fires exactly once. |
| `delaySeconds` | `60` | Shutdown delay in seconds (5–86400). The dialog countdown mirrors it. |
| `popup` | `true` | Whether to show the cancel dialog at all. |

## Safety notes

- No administrator rights are required; `shutdown /s /t` is available to the logged-in user.
- Only a **root** conversation can trigger it: turns of subagents/teammates are ignored, and
  if another agent is still running the trigger waits for the next turn boundary.
- `DSH_AUTO_SHUTDOWN_DRYRUN=1` in the Host environment logs the two commands instead of
  running them — useful for testing the wiring.
- `DSH_AUTO_SHUTDOWN_POPUP_LOG=<file>` makes the dialog append its user actions to a file.
- The dialog only ever runs `shutdown /a`; it never schedules anything.

## How it works

- **Host half** (`lib/index.js`): listens to the `agent/turn-stopping` event, filters to root
  agents, latches once, writes `enabled = false` through the Settings service, then spawns
  `shutdown.exe`. It is a validated Cordis plugin (`Config` with volatile fields), so the
  switch is a real Settings document write.
- **Cancel dialog** (`lib/popup.js` + `assets/notify.ps1`): a detached Windows PowerShell 5.1
  WinForms window with a countdown (always-on-top when ≤ 120 s). Its copy is passed as argv and
  the script itself stays ASCII-only, so a non-UTF-8 code page cannot mangle Chinese text.
- **Client half** (`lib/client.js`): registers one `settings.general.item` row that renders the
  switch from `ctx.configForms`, i.e. from the Host's own configuration form.

## Development

```powershell
# schemastery is only resolvable through a junction when testing outside the profile
New-Item -ItemType Junction -Path node_modules\@deepseek-ai\schemastery `
  -Target "C:\Users\<you>\AppData\Roaming\DSH\data\versions\<version>\node_modules\@deepseek-ai\schemastery"

$env:DSH_AUTO_SHUTDOWN_DRYRUN = '1'
node test-dry-run.mjs        # host logic: filtering, disarm, argv, one-shot
node tests/popup-test.mjs    # real window: self-close, cancel path, failure path, shutdown /a
Remove-Item -Recurse -Force node_modules
```

`tests/popup-test.mjs` uses `-SimulateCancel -TestCancelCommand 'cmd /c exit 0'` style test
switches, so it never touches a real pending shutdown.

## Layout

| File | Role |
| --- | --- |
| `lib/index.js` | Host plugin: event trigger, disarm, spawn `shutdown.exe` |
| `lib/popup.js` | Cancel-dialog argv builder + launch (shared with the tests) |
| `lib/client.js` | Settings row with the switch |
| `assets/notify.ps1` | Windows PowerShell/WinForms countdown dialog |
| `cordis.patch.yml` | Inserts the Host entry `auto-shutdown` |
| `locale/*.json` | Plugin list title/description |

## License

MIT

---

## 中文说明

Windows 专用。为 DeepSeek Harness 增加一个**设置开关**：打开后，**下一次对话完成时自动关机**，
并在关机前弹出一个原生 Windows 对话框，点一下即可取消本次关机。

### 安装

```powershell
dsh plugin add github:873360545/dsh-auto-shutdown
```

安装后重启 Harness（重启 Host 即可），插件条目为 `auto-shutdown`。

### 使用

1. 设置 → **通用** → 找到「**对话完成后自动关机**」，打开开关。
2. 正常结束一次对话，此时插件会：
   - 把开关自动复位为关闭（只触发一次，重启后不会突然关机）；
   - 执行 `shutdown.exe /s /t <延迟>`；
   - 弹出倒计时对话框。
3. 对话框里点「**取消关机**」→ 执行 `shutdown /a`，电脑保持开机；点「**继续关机**」/ 直接关窗 /
   倒计时归零 → 按计划关机。也可以在终端随时执行 `shutdown /a` 取消。

### 配置项（均可在设置里实时修改，无需重启）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 开关。排定关机前会自动写回 `false`，保证只触发一次。 |
| `delaySeconds` | `60` | 关机延迟秒数（5–86400），也是弹窗倒计时时长。 |
| `popup` | `true` | 是否弹出取消窗口。 |

### 注意事项

- 不需要管理员权限。
- 只有**根会话**能触发：子 Agent / 团队成员回合会被忽略；若还有其它 Agent 在运行，会推迟到下一次回合边界。
- 设 `DSH_AUTO_SHUTDOWN_DRYRUN=1` 可只打日志、不真的关机；设 `DSH_AUTO_SHUTDOWN_POPUP_LOG=<文件>`
  可记录弹窗里的用户操作，便于排障。
- 弹窗只会执行 `shutdown /a`，不会自己排定任何关机。

### 许可

MIT
