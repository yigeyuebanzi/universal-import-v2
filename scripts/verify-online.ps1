#Requires -Version 5.1
<#
.SYNOPSIS
  线上端到端验收：上传 10,000 行压测文件 -> 轮询任务 -> 输出结果。
  依赖 curl.exe 与本地代理（默认 http://127.0.0.1:7897，可通过 -Proxy 覆盖）。
.EXAMPLE
  $env:PROD_BASE='https://universal-import-v4-brown.vercel.app'
  $env:IMPORT_API_KEY='...'
  $env:CRON_SECRET='...'
  powershell -File scripts/verify-online.ps1
#>
param(
    [string]$Proxy = 'http://127.0.0.1:7897'
)

$ErrorActionPreference = 'Stop'
$base = $env:PROD_BASE
$key = $env:IMPORT_API_KEY
$secret = $env:CRON_SECRET
if (-not $base -or -not $key) { throw '需要设置 PROD_BASE 与 IMPORT_API_KEY 环境变量' }

$rules = curl.exe --proxy $Proxy -sS "$base/api/rules" -H "x-api-key: $key" | ConvertFrom-Json
$rule = $rules.data | Where-Object { $_.name -eq '压测-10000行运单' } | Select-Object -First 1
if (-not $rule) { throw '线上未找到压测规则' }

$file = Join-Path $PSScriptRoot '..\test-data\10000-orders.xlsx'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$body = curl.exe --proxy $Proxy -sS -X POST "$base/api/import-tasks" -H "x-api-key: $key" -F "file=@$file;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -F "ruleId=$($rule.id)" | ConvertFrom-Json
$sw.Stop()
Write-Host "上传状态=$($body.status) task=$($body.task_id) 服务端耗时=$($body.elapsed_ms)ms 客户端耗时=$($sw.ElapsedMilliseconds)ms"

if (-not $body.task_id) { exit 1 }
$taskId = $body.task_id
$kicked = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    $t = curl.exe --proxy $Proxy -sS "$base/api/import-tasks/$taskId" -H "x-api-key: $key" | ConvertFrom-Json
    if ($i -eq 3 -and -not $kicked -and $secret) {
        $kicked = $true
        curl.exe --proxy $Proxy -sS "$base/api/cron/process" -H "Authorization: Bearer $secret" | Out-Null
    }
    Write-Host "轮询$i status=$($t.status) processed=$($t.processed_rows) success=$($t.success_rows) failed=$($t.failed_rows) batches=$($t.completed_batches)/$($t.total_batches)"
    if (@('completed','partial_success','failed') -contains $t.status) { break }
}
