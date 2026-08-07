#Requires -Version 5.1
<#
.SYNOPSIS
  一键部署到 Vercel（需先准备好 DATABASE_URL / REDIS_* / BLOB_* 等环境变量）。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/deploy-vercel.ps1 -Prod
#>
param(
    [switch]$Prod
)

$ErrorActionPreference = 'Stop'

npx --yes vercel --version
if ($LASTEXITCODE -ne 0) { throw 'vercel CLI 安装失败' }

npx vercel whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '未登录 Vercel，开始登录（按提示完成浏览器授权）...'
    npx vercel login
    if ($LASTEXITCODE -ne 0) { throw 'vercel login 失败' }
}

npx vercel link --yes
npx vercel env pull .env.local --yes

if ($Prod) {
    npx vercel deploy --prod --yes
} else {
    npx vercel deploy --yes
}

Write-Host '部署完成。请在 Vercel 项目设置中补齐生产环境变量（DATABASE_URL、REDIS_HOST/PORT/PASSWORD、BLOB_READ_WRITE_TOKEN、IMPORT_API_KEY、CRON_SECRET）。'
