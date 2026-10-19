# DSH auto-shutdown desktop dialog.
#
# Shows a Windows message box with a visible countdown. Clicking the cancel
# button runs the cancel command (by default `shutdown /a`), which aborts the
# shutdown already scheduled by the Host plugin. The dialog runs as its own
# process: it never blocks the DSH Host, and it disappears with the session
# shutdown if nobody clicks it.
#
# All user-visible copy is passed in as parameters so this file stays ASCII and
# parseable by Windows PowerShell 5.1 regardless of the file encoding.
#
# Test hooks (never used by the plugin itself):
#   -SelfTest        show the dialog, close it after ~2.2s, log the result
#   -SimulateCancel  click the cancel button after ~1.2s, using
#                    -TestCancelCommand instead of the real cancel command
param(
  [int]$Seconds = 60,
  [string]$TitleText = 'Auto shutdown',
  [string]$HeadlineFormat = '{0} seconds until automatic shutdown',
  [string]$BodyText = 'The conversation finished. Click the cancel button to stop the shutdown.',
  [string]$CancelLabel = 'Cancel shutdown',
  [string]$KeepLabel = 'Keep shutdown',
  [string]$CancelledText = 'Cancel requested. The computer stays on.',
  [string]$CancelFailedFormat = 'Cancel failed (code {0}).',
  [string]$ClosedText = 'Kept. The computer shuts down as planned.',
  [string]$CancelCommand = 'shutdown /a',
  [string]$LogPath = '',
  [switch]$SelfTest,
  [switch]$SimulateCancel,
  [string]$TestCancelCommand = 'cmd /c exit 0'
)

$ErrorActionPreference = 'Stop'

function Write-ProbeLog([string]$Text) {
  if ($LogPath -ne '') {
    try {
      Add-Content -LiteralPath $LogPath -Value (('{0:o} {1}' -f (Get-Date), $Text)) -Encoding UTF8
    } catch {
      # observation only
    }
  }
}

trap {
  Write-ProbeLog ('FATAL: ' + $_.Exception.Message)
  exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

[System.Windows.Forms.Application]::add_ThreadException({
    param($sender, $eventArgs)
    Write-ProbeLog ('THREAD EXCEPTION: ' + $eventArgs.Exception.Message)
  })

$script:remaining = [Math]::Max(1, $Seconds)
$script:cancelHandled = $false

$form = New-Object System.Windows.Forms.Form
$form.Text = $TitleText
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowIcon = $false
$form.ClientSize = New-Object System.Drawing.Size(496, 224)
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.75)
if ($Seconds -le 120) {
  $form.TopMost = $true
}

$headline = New-Object System.Windows.Forms.Label
$headline.Location = New-Object System.Drawing.Point(26, 22)
$headline.Size = New-Object System.Drawing.Size(444, 34)
$headline.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
$headline.Text = ($HeadlineFormat -f $script:remaining)
$form.Controls.Add($headline)

$body = New-Object System.Windows.Forms.Label
$body.Location = New-Object System.Drawing.Point(28, 66)
$body.Size = New-Object System.Drawing.Size(440, 56)
$body.ForeColor = [System.Drawing.Color]::FromArgb(68, 68, 68)
$body.Text = $BodyText
$form.Controls.Add($body)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(28, 124)
$status.Size = New-Object System.Drawing.Size(440, 26)
$status.ForeColor = [System.Drawing.Color]::FromArgb(68, 68, 68)
$status.Text = ''
$form.Controls.Add($status)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = $CancelLabel
$cancelButton.Location = New-Object System.Drawing.Point(236, 170)
$cancelButton.Size = New-Object System.Drawing.Size(132, 34)
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::None
$form.Controls.Add($cancelButton)

$keepButton = New-Object System.Windows.Forms.Button
$keepButton.Text = $KeepLabel
$keepButton.Location = New-Object System.Drawing.Point(376, 170)
$keepButton.Size = New-Object System.Drawing.Size(96, 34)
$keepButton.DialogResult = [System.Windows.Forms.DialogResult]::None
$form.Controls.Add($keepButton)

$form.AcceptButton = $cancelButton
$form.CancelButton = $keepButton

$countdownTimer = New-Object System.Windows.Forms.Timer
$countdownTimer.Interval = 1000
$countdownTimer.add_Tick({
    $script:remaining = [Math]::Max(0, $script:remaining - 1)
    $headline.Text = ($HeadlineFormat -f $script:remaining)
    if ($script:remaining -le 0) {
      $countdownTimer.Stop()
      $form.Close()
    }
  })

$closeTimer = New-Object System.Windows.Forms.Timer
$closeTimer.Interval = 1800
$closeTimer.add_Tick({
    $closeTimer.Stop()
    $form.Close()
  })

$selfTestTimer = New-Object System.Windows.Forms.Timer
$selfTestTimer.Interval = 2200
$selfTestTimer.add_Tick({
    $selfTestTimer.Stop()
    Write-ProbeLog 'selftest closing'
    $countdownTimer.Stop()
    $form.Close()
  })

function Invoke-Cancel {
  if ($script:cancelHandled) { return }
  $script:cancelHandled = $true
  Write-ProbeLog 'cancel clicked'
  $command = $CancelCommand
  if ($SimulateCancel -and $TestCancelCommand -ne '') {
    $command = $TestCancelCommand
  }
  Write-ProbeLog ('running: ' + $command)
  try {
    $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', $command) -WindowStyle Hidden -PassThru -Wait
    Write-ProbeLog ('exit code: ' + $process.ExitCode)
    if ($process.ExitCode -eq 0) {
      $status.Text = $CancelledText
    } else {
      $status.Text = ($CancelFailedFormat -f $process.ExitCode)
    }
  } catch {
    Write-ProbeLog ('cancel failed: ' + $_.Exception.Message)
    $status.Text = ($CancelFailedFormat -f $_.Exception.Message)
  }
  $countdownTimer.Stop()
  $headline.Text = $TitleText
  $closeTimer.Start()
}

$cancelButton.Add_Click({ Invoke-Cancel })

$keepButton.Add_Click({
    Write-ProbeLog 'keep clicked'
    $countdownTimer.Stop()
    $status.Text = $ClosedText
    $closeTimer.Start()
  })

$form.Add_Shown({
    Write-ProbeLog ('form shown; seconds=' + $script:remaining)
    $form.Activate()
    $countdownTimer.Start()
    if ($SelfTest) {
      $selfTestTimer.Start()
    }
    if ($SimulateCancel) {
      $countdownTimer.Stop()
      $headline.Text = ($HeadlineFormat -f $script:remaining)
      $cancelButton.PerformClick()
    }
  })

$form.Add_FormClosing({
    Write-ProbeLog ('form closing; cancelHandled=' + $script:cancelHandled)
  })

$form.Add_FormClosed({
    $countdownTimer.Stop()
    $closeTimer.Stop()
    $selfTestTimer.Stop()
    Write-ProbeLog 'form closed'
  })

[void]$form.ShowDialog()
Write-ProbeLog 'exit'
exit 0
