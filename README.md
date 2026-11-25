# @worktool/dsh-config-sync

[![npm version](https://img.shields.io/npm/v/@worktool/dsh-config-sync?color=blue)](https://www.npmjs.com/package/@worktool/dsh-config-sync)
[![npm downloads](https://img.shields.io/npm/dm/@worktool/dsh-config-sync)](https://www.npmjs.com/package/@worktool/dsh-config-sync)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![DSH bundle](https://img.shields.io/badge/DSH-bundle-6f42c1.svg)](https://github.com/SupremeIdol/dsh-config-sync)

DeepSeek Harness（DSH）配置同步插件：把你的 **全局配置、全局 Skills、已安装插件清单** 导出为一个可版本化的同步包，并支持通过 **Git（SSH）** 同步到自建仓库（如 Gitee），换机或重装后一键还原。

## 功能

- 导出（自动脱敏）：
  - `settings.yaml`：仅清空**密钥类字段**（apiKey / secret / token / password / bearer / privateKey / accessKey 等），并记录到 `redactions.json`；`maxTokens`、`contextWindow` 等普通参数会被保留
  - `AGENTS.md`（全局记忆）
  - **`AGENTS.md` 里引用的本地文件**（如 `~/.dsh/drawio-rules.md`，以及 Markdown 相对链接指向的本地文件）→ 存入 `config/linked/`，导入时按原相对路径还原；`skills/`、`.agent-presets/` 在各自开关开启时按专门逻辑导出，引用解析会自动去重；关闭这些开关时则改由 `config/linked/` 兜底带上
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
- 安全提示：推送前会用**不带任何凭据**的匿名 `git ls-remote` **探测仓库是否可被公开访问**——`http(s)`/`git://` 直接探测，SSH 地址自动转 https（仅标准 22 端口；探测前会剥离地址里的 `user:token@`，避免带凭据误判为公开）；判定为公开时弹窗要求勾选确认；Host 侧对公开地址也会强制要求确认（`allowPublic`）后才允许推送。**同一地址首次成功推送后会被记住，之后不再重复探测；地址一改则重新探测**。设置页提供「重新检测」按钮，可忘记该地址的信任并强制立即重测。另有**严格模式**开关：开启后「无法判定是否公开」（如网络受限、非标准 ssh 端口、内网不可达）也会先要求确认，不再默认按私有放行
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
config/linked/**              # AGENTS.md 引用的本地文件（如 drawio-rules.md）
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

### 通过自定义插件市场索引安装

本仓库根目录提供 `market-index.json`。在 DSH「插件市场 / Discover」里添加索引地址：

```
https://raw.githubusercontent.com/SupremeIdol/dsh-config-sync/main/market-index.json
```

即可在市场里直接看到并安装 `@worktool/dsh-config-sync`（索引同时收录了 `@worktool/dsh-diagram`）。

## 常见问题

### 安装时报 `ERR_PNPM_NO_MATCHING_VERSION ... npmmirror.com`

原因：国内环境默认使用 `registry.npmmirror.com` 镜像，新发布的版本通常要过几分钟到几小时才同步，这段时间 pnpm 会找不到对应版本。

解决（任选其一）：

- 等镜像同步后重试；
- 安装时显式指定官方源（插件管理器里把 registry 设为 `https://registry.npmjs.org/`）：
  ```
  plugin_manager install_bundle
    target   = @worktool/dsh-config-sync@1.0.0
    registry = https://registry.npmjs.org/
  ```
- 一次性配置（推荐）：在 DSH profile 目录的 `.npmrc` 里加一行
  ```
  @worktool:registry=https://registry.npmjs.org/
  ```
  之后 `@worktool/*` 都走官方源，其它包仍走镜像，不影响速度。

## English

Export/import DSH global config, skills, and installed plugins (name@version); Git(SSH) cloud sync to your own repo. Secrets are never exported; settings containing secret keys are redacted. Configure the repo under Settings → Config Sync.

## License

MIT
