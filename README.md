# @worktool/dsh-config-sync

DeepSeek Harness（DSH）配置同步插件：把你的 **全局配置、全局 Skills、已安装插件清单** 导出为一个可版本化的同步包，并支持通过 **Git（SSH）** 同步到自建仓库（如 Gitee），换机或重装后一键还原。

## 功能

- 导出（自动脱敏）：
  - `settings.yaml`：仅清空**密钥类字段**（apiKey / secret / token / password / bearer / privateKey / accessKey 等），并记录到 `redactions.json`；`maxTokens`、`contextWindow` 等普通参数会被保留
  - `AGENTS.md`（全局记忆）
  - `.agent-presets/`
  - `profiles/<profile>/cordis.patch.yml`、`cordis.yml`
  - 全局 `skills/`
  - 已安装插件清单（`name@version`）
- 导入：
  - 先自动备份当前状态到 `~/.dsh/config-sync/backups/<时间戳>/`
  - 按 `name@version` 自动下载安装插件（优先官方 registry，失败回退镜像）
  - 还原配置与 skills；本地/link 插件会跳过并提示
  - 导入 `settings.yaml` 时，**本机已存在的密钥会被保留**（不会被导出包里的空值覆盖）；换到全新机器首次导入后，仍需手动补填密钥
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

- 在 DSH 的「插件市场」搜索并安装 `@worktool/dsh-config-sync`（或让插件管理器安装 npm 包 `@worktool/dsh-config-sync`）。
- 也可从本仓库源码本地安装：把插件管理器指向本目录即可（`dsh.bundle.patch` 会生效）。

安装后到「设置 → 配置同步」填写 Git（SSH）仓库地址即可。

## English

Export/import DSH global config, skills, and installed plugins (name@version); Git(SSH) cloud sync to your own repo. Secrets are never exported; settings containing secret keys are redacted. Configure the repo under Settings → Config Sync.

## License

MIT
