# 配置同步 · 详情

## 数据流

1. 用户在「设置 → 配置同步」勾选要同步的内容。
2. Host 半扫描 `~/.dsh` 下白名单路径，`settings.yaml` 经过密钥脱敏，打包到 `~/.dsh/config-sync/repo`。
3. 点击「推送到仓库」：在该工作副本执行 `git add/commit/push`（SSH）。
4. 新机器点击「拉取并导入」：`git fetch/reset` → 备份当前 → 按 `plugins.json` 调 `pluginManager.installBundle(name@version)` 自动装插件 → 还原配置与 skills。

## Host 半能力（调用的 DSH 服务）

- `connection.fetch.register`：注册 `/api/worktool/dsh-config-sync/*` 路由
- `pluginManager.installBundle / updateBundle`：导入时安装/升级插件
- `tools.register`：注册 5 个 Agent 工具

## 安全

- 只读/白名单扫描，`.credentials.yaml`、`.env` 等永不读取。
- `settings.yaml` 逐行键名匹配 `apikey|secret|token|password|bearer|private_key` 的值清空（`apiKeyEnv` 等环境变量名保留）。
- Git 凭据走系统 SSH/凭据助手，不写入同步包。

## 注意

- 导入配置与插件后通常需要 **重启 DSH** 才能全部生效。
- 本地 `link:`/`file:` 插件无法在别的机器自动安装，会在结果里列出并跳过。
- 首次 `git push` 到 **空仓库** 会自动建立分支；请确保该 SSH key 已加入对应仓库（如 Gitee 的部署公钥/账户公钥）。
