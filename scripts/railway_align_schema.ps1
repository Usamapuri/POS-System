# Align Railway Postgres schema + seed with local database/init files.
# DESTRUCTIVE: drops public schema (all data in public is lost).
#
# Usage (PowerShell):
#   $env:PGPASSWORD = '<your-railway-password>'
#   $env:RAILWAY_PG_HOST = 'maglev.proxy.rlwy.net'
#   $env:RAILWAY_PG_PORT = '28227'
#   .\scripts\railway_align_schema.ps1
#
# Or pass password:
#   .\scripts\railway_align_schema.ps1 -Password '...'

param(
  [string] $PgHost = $env:RAILWAY_PG_HOST,
  [string] $Port = $env:RAILWAY_PG_PORT,
  [string] $User = 'postgres',
  [string] $Database = 'railway',
  [string] $Password = $env:PGPASSWORD
)

$ErrorActionPreference = 'Stop'
# Project root = parent of scripts/
$root = Split-Path $PSScriptRoot -Parent

$schemaFile = Join-Path $root "database\init\01_schema.sql"
$seedFile = Join-Path $root "database\init\02_seed_data.sql"

if (-not (Test-Path $schemaFile)) { throw "Missing $schemaFile" }
if (-not $PgHost) { throw "Set RAILWAY_PG_HOST or pass -PgHost" }
if (-not $Port) { throw "Set RAILWAY_PG_PORT or pass -Port" }
if (-not $Password) { throw "Set PGPASSWORD or pass -Password" }

$env:PGPASSWORD = $Password

function Invoke-RailwaySql {
  param([string] $Args)
  docker run --rm -e PGPASSWORD=$env:PGPASSWORD postgres:15-alpine psql -h $PgHost -U $User -p $Port -d $Database @Args
}

Write-Host "Dropping and recreating public schema (destructive)..." -ForegroundColor Yellow
$sql = @"
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
"@
Invoke-RailwaySql -Args @("-v", "ON_ERROR_STOP=1", "-c", $sql)

Write-Host "Applying 01_schema.sql..." -ForegroundColor Cyan
docker run --rm -v "${schemaFile}:/schema.sql" -e PGPASSWORD=$env:PGPASSWORD postgres:15-alpine psql -h $PgHost -U $User -p $Port -d $Database -v ON_ERROR_STOP=1 -f /schema.sql

Write-Host "Applying 02_seed_data.sql..." -ForegroundColor Cyan
docker run --rm -v "${seedFile}:/seed.sql" -e PGPASSWORD=$env:PGPASSWORD postgres:15-alpine psql -h $PgHost -U $User -p $Port -d $Database -v ON_ERROR_STOP=1 -f /seed.sql

Write-Host "Done. Railway DB matches local init (schema + seed)." -ForegroundColor Green
