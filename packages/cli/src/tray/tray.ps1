param(
    [string]$IconPath = "",
    [string]$Tooltip = "AxonRouter"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$icon = New-Object System.Windows.Forms.NotifyIcon
if ($IconPath -and (Test-Path $IconPath)) {
    $icon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($IconPath)
} else {
    $icon.Icon = [System.Drawing.SystemIcons]::Application
}
$icon.Text = $Tooltip.Substring(0, [Math]::Min($Tooltip.Length, 63))
$icon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$menuItems = @{}

function Write-Event($eventType, $data) {
    $event = @{ type = $eventType } + $data
    $json = $event | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

# Signal that we're ready
Write-Event "started" @{}

# Timer to poll stdin for commands
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 100
$timer.Add_Tick({
    while ([Console]::In.KeyAvailable) {
        try {
            $line = [Console]::In.ReadLine()
            if (-not $line) { continue }
            $cmd = $line | ConvertFrom-Json
            switch ($cmd.type) {
                "add-item" {
                    $item = New-Object System.Windows.Forms.ToolStripMenuItem
                    $item.Text = $cmd.title
                    $item.Enabled = if ($cmd.enabled -eq $false) { $false } else { $true }
                    $item.ToolTipText = $cmd.tooltip
                    $item.Add_Click({
                        Write-Event "clicked" @{ id = $cmd.id }
                    })
                    $menuItems[$cmd.id.ToString()] = $item
                    $contextMenu.Items.Add($item) | Out-Null
                }
                "update-item" {
                    if ($menuItems.ContainsKey($cmd.id.ToString())) {
                        $item = $menuItems[$cmd.id.ToString()]
                        if ($cmd.title) { $item.Text = $cmd.title }
                        if ($cmd.enabled -ne $null) { $item.Enabled = $cmd.enabled }
                        if ($cmd.tooltip) { $item.ToolTipText = $cmd.tooltip }
                    }
                }
                "set-tooltip" {
                    $icon.Text = $cmd.tooltip.Substring(0, [Math]::Min($cmd.tooltip.Length, 63))
                }
                "ready" {
                    Write-Event "ready" @{}
                }
                "kill" {
                    $icon.Visible = $false
                    $icon.Dispose()
                    [System.Windows.Forms.Application]::Exit()
                    exit
                }
            }
        } catch {
            # Ignore parse errors
        }
    }
})
$timer.Start()

$icon.ContextMenuStrip = $contextMenu

[System.Windows.Forms.Application]::Run()
