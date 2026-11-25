# 配置同步 · 详情

## 数据流

1. 用户在「设置 → 配置同步」勾选要同步的内容。
2. Host 半扫描 `~/.dsh` 下白名单路径，`settings.yaml` 经过密钥脱敏，打包到 `~/.dsh/config-sync/repo`；同时解析 `AGENTS.md` 中形如 `~/.dsh/xxx` 的引用与 Markdown 本地相对链接，把被引用的文件（如 `drawio-rules.md`）一并打包到 `config/linked/`，导入时按原相对路径还原。
3. 点击「推送到仓库」：在该工作副本执行 `git add/commit/push`（SSH）。
4. 新机器点击「拉取并导入」：`git fetch/reset` → 备份当前 → 按 `plugins.json` 调 `pluginManager.installBundle(name@version)` 自动装插件 → 还原配置与 skills。

## Host 半能力（调用的 DSH 服务）

- `connection.fetch.register`：注册 `/api/worktool/dsh-config-sync/*` 路由
- `pluginManager.installBundle / updateBundle`：导入时安装/升级插件
- `tools.register`：注册 5 个 Agent 工具

## 安全

- 只读/白名单扫描，`.credentials.yaml`、`.env` 等永不读取。
- `settings.yaml` 只对**密钥类键名**（apikey/secret/token/password/bearer/privateKey/accessKey 等）的值清空（`apiKeyEnv` 等环境变量名保留，`maxTokens`/`contextWindow` 等普通参数保留）；导入时若本机已有该密钥则保留本机值，避免被脱敏空值覆盖。
- Git 凭据走系统 SSH/凭据助手，不写入同步包。
- 推送前用**不带任何凭据**的匿名 `git ls-remote` 探测目标仓库是否可被公开访问：`http(s)`/`git://` 直接探测；SSH 地址自动转其 https 等价地址（仅标准 22 端口）；探测前剥离地址中的 `user:token@`，避免带凭据把私有误判公开。判定为公开时，UI 弹窗要求勾选确认，Host 侧对公开地址也强制要求 `allowPublic:true` 才允许推送。同一地址首次成功推送后会记入 `state.json` 的 `trustedRepos`，之后推送不再探测；地址变更则重新探测。**严格模式**开启后，`checked=false`（网络受限/非标准 ssh 端口/无法判定）也会被视为需确认，避免"未知被当成私有"直接外泄。

## 注意

- 导入配置与插件后通常需要 **重启 DSH** 才能全部生效。
- 本地 `link:`/`file:` 插件无法在别的机器自动安装，会在结果里列出并跳过。
- 首次 `git push` 到 **空仓库** 会自动建立分支；请确保该 SSH key 已加入对应仓库（如 Gitee 的部署公钥/账户公钥）。
