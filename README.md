# @worktool/dsh-config-sync

DeepSeek Harness（DSH）配置同步插件：把你的 **全局配置、全局 Skills、已安装插件清单** 导出为一个可版本化的同步包，并支持通过 **Git（SSH）** 同步到自建仓库（如 Gitee），换机或重装后一键还原。

## 功能

- 导出（自动脱敏）：
  - `settings.yaml`（含 apiKey/token/secret 等字段会被清空并记录到 `redactions.json`）
  - `AGENTS.md`（全局记忆）
  - `.agent-presets/`
  - `profiles/<profile>/cordis.patch.yml`、`cordis.yml`
  - 全局 `skills/`
  - 已安装插件清单（`name@version`）
- 导入：
  - 先自动备份当前状态到 `~/.dsh/config-sync/backups/<时间戳>/`
  - 按 `name@version` 自动下载安装插件（优先官方 registry，失败回退镜像）
  - 还原配置与 skills；本地/link 插件会跳过并提示
- 云同步：`git push / pull`（SSH），仓库地址由你自行配置
- 界面：设置 →「配置同步」；同时提供 Agent 工具：
  `config_sync_status` / `config_sync_export` / `config_sync_import` / `config_sync_push` / `config_sync_pull`

## 永不导出

`.credentials.yaml`、`.env`、`mcp_connector_grants/`、`storages/`（运行时）、`sessions/`、`cache/`、`attachments/`、`node_modules/`、日志。

## 同步包结构

```
manifest.json     # schema/时间/DSH 版本/工具版本/counts
plugins.json      # [{name,version,builtin,local}] + local[]
config/settings.yaml
config/AGENTS.md
config/agent-presets/**
config/profile/{cordis.patch.yml,cordis.yml}
skills/<name>/**
redactions.json   # 被脱敏字段
excluded.json     # 被排除项
```

## 安装

```bash
# 在本机 DSH 中安装（插件市场/命令行择一）
dsh plugin add @worktool/dsh-config-sync
```

安装后到「设置 → 配置同步」填写 Git（SSH）仓库地址即可。

## English

Export/import DSH global config, skills, and installed plugins (name@version); Git(SSH) cloud sync to your own repo. Secrets are never exported; settings containing secret keys are redacted. Configure the repo under Settings → Config Sync.

## License

MIT
