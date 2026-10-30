# Выкладка на сервер с Windows. Отправляет последний коммит (незакоммиченные правки не уйдут!).
# Файлы .env на сервере не трогаются. Запуск из корня проекта:
#   .\deploy\deploy.ps1 root@1.2.3.4 -Setup   # первый раз: загрузить код и подготовить чистый сервер
#   .\deploy\deploy.ps1 root@1.2.3.4          # дальше: загрузить код, собрать и перезапустить
param(
  [Parameter(Mandatory)][string]$Server,
  [switch]$Setup
)
$ErrorActionPreference = 'Stop'

Set-Location (Split-Path $PSScriptRoot)
$archive = Join-Path $env:TEMP 'nespishut.tar.gz'
git archive --format=tar.gz -o $archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'git archive не удался' }

scp $archive "${Server}:/tmp/nespishut.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'scp не удался' }

$unpack = 'mkdir -p /opt/nespishut && tar -xzf /tmp/nespishut.tar.gz -C /opt/nespishut'
if ($Setup) {
  ssh $Server "$unpack && bash /opt/nespishut/deploy/setup-server.sh"
} else {
  ssh $Server "$unpack && chown -R nespishut:nespishut /opt/nespishut && sudo -iu nespishut bash /opt/nespishut/deploy/update.sh"
}
if ($LASTEXITCODE -ne 0) { throw 'Команда на сервере не удалась' }
