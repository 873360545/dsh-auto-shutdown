window.__ModuleLoader__.load({
  id: '@873360545/dsh-auto-shutdown',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    /** Locale namespace of the Settings row copy. */
    const locale = 'settings.autoShutdown'
    /** Host plugin entry id; doubles as its Settings namespace and row id. */
    const namespace = 'auto-shutdown'

    const en = {
      title: 'Power off after the conversation finishes',
      description:
        'Once enabled, this computer shuts down when the current conversation completes. The default delay is 60 seconds. To prevent an accidental shutdown, a "cancel shutdown" dialog appears at that point so you can cancel it.',
      armed: 'Armed — this computer will shut down when the conversation finishes.',
      saved: 'Preference saved',
      failed: 'Could not save preference',
    }

    const zh = {
      title: '对话完成后自动关机',
      description:
        '开启后，本次对话完成时自动关闭电脑。默认 60 秒后关机。为防止误触，届时会弹出「取消关机」窗口，可取消本次关机；',
      armed: '已开启：本次对话结束后将自动关机。',
      saved: '设置已保存',
      failed: '无法保存设置',
    }

    const css =
      '.das_row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}' +
      '.das_text{min-width:0}' +
      '.das_title{font-size:14px;line-height:20px}' +
      '.das_description{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}' +
      '.das_notice{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}' +
      '.das_notice_error{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-error,#c22)}' +
      '.das_switch{position:relative;display:inline-flex;flex:0 0 auto;cursor:pointer;margin:0}' +
      '.das_input{position:absolute;opacity:0;width:0;height:0;margin:0}' +
      '.das_track{display:inline-block;position:relative;width:40px;height:24px;border-radius:999px;background:var(--dsw-alias-border-l2,#c8ccd4);transition:background .15s ease}' +
      '.das_track[data-on="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe)}' +
      '.das_knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s ease}' +
      '.das_track[data-on="true"] .das_knob{transform:translateX(16px)}' +
      '.das_input:focus-visible+.das_track{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}' +
      '.das_input:disabled+.das_track{opacity:.5}' +
      '.das_input:disabled~.das_switch{cursor:default}'

    const styleTagId = '@873360545/dsh-auto-shutdown/AutoShutdownRow.css'
    if (
      typeof document !== 'undefined' &&
      document.querySelector('style[data-plugin-css=' + JSON.stringify(styleTagId) + ']') === null
    ) {
      const tag = document.createElement('style')
      tag.dataset.plugin = '@873360545/dsh-auto-shutdown'
      tag.dataset.pluginCss = styleTagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    /**
     * One preference row in Settings → General.
     * @param props.useConfig - snapshot hook of the Host configuration form.
     * @param props.setEnabled - persists the enabled switch.
     * @param props.t - localized copy resolver.
     */
    function AutoShutdownRow({ useConfig, setEnabled, t }) {
      const config = useConfig((value) => value)
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const ready = config.status === 'ready'
      const writable = config.writable === true
      const enabled = ready && config.value?.enabled === true
      const toggle = async (event) => {
        event.preventDefault()
        if (busy || !ready || !writable) return
        setBusy(true)
        setNotice(null)
        let accepted = false
        try {
          accepted = await setEnabled(!enabled)
        } catch (_error) {}
        setBusy(false)
        setNotice(accepted ? 'saved' : 'failed')
      }
      return h(
        'div',
        { className: 'das_row' },
        h(
          'div',
          { className: 'das_text' },
          h('div', { className: 'das_title' }, t('title')),
          h('div', { className: 'das_description' }, t(enabled ? 'armed' : 'description')),
          notice === null
            ? null
            : h(
                'div',
                { className: notice === 'saved' ? 'das_notice' : 'das_notice_error' },
                t(notice),
              ),
        ),
        h(
          'label',
          { className: 'das_switch' },
          h('input', {
            type: 'checkbox',
            role: 'switch',
            className: 'das_input',
            checked: enabled,
            disabled: busy || !ready || !writable,
            'aria-checked': enabled,
            'aria-label': t('title'),
            onChange: toggle,
          }),
          h('span', {
            className: 'das_track',
            'data-on': enabled ? 'true' : 'false',
            'aria-hidden': true,
          }, h('span', { className: 'das_knob' })),
        ),
      )
    }

    /** Services used by the browser companion. */
    const inject = ['slots', 'locale', 'configForms']

    /**
     * Register the preference row while the Host serves its namespace.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(locale, { en, zh }))
      const form = ctx.configForms.get(namespace)
      const face = () => ({
        hooks: { config: form },
        setEnabled: (value) => form.set('enabled', value),
      })
      ctx.effect(() =>
        ctx.configForms.whileServed([namespace], () =>
          ctx.slots.inject('settings.general.item', () =>
            ctx.slots.register(
              {
                name: 'settings.general.item',
                id: namespace,
                order: 18,
                locale,
                inject: face,
              },
              AutoShutdownRow,
            ),
          ),
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
