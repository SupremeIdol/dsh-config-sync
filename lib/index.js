import { readFile, writeFile, mkdir, readdir, rm, cp, copyFile, access, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const name = "config-sync";
export const inject = ["connection", "pluginManager", "tools"];

const TOOL_ID = "@worktool/dsh-config-sync";
const TOOL_VERSION = "0.1.0";
const API_PREFIX = "/api/worktool/dsh-config-sync";
const MARKER_HEADER = "x-dsh-config-sync";
const OFFICIAL_REGISTRY = "https://registry.npmjs.org/";

const HOME = os.homedir();
const DSH_HOME = process.env.DSH_HOME || path.join(HOME, ".dsh");
const PROFILE = process.env.DSH_PROFILE || "desktop";
const PROFILE_DIR = path.join(DSH_HOME, "profiles", PROFILE);
const STATE_DIR = path.join(DSH_HOME, "config-sync");
const REPO_DIR = path.join(STATE_DIR, "repo");
const BACKUP_DIR = path.join(STATE_DIR, "backups");
const STATE_FILE = path.join(STATE_DIR, "state.json");

const SECRET_KEY_RE = /(api[_-]?key|apikey|secret|token|password|passwd|authorization|bearer|private[_-]?key|access[_-]?key)/i;

const DEFAULT_INCLUDE = {
  settings: true,
  agents: true,
  presets: true,
  skills: true,
  plugins: true,
  optional: false,
};

const ALWAYS_EXCLUDED = [
  ".credentials.yaml",
  ".env",
  "mcp_connector_grants/",
  "storages/ (运行时状态)",
  "sessions/",
  "cache/",
  "attachments/",
  "node_modules/",
  "pnpm-lock.yaml",
  "*.log",
];

/* ------------------------------------------------------------------ utils */

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function loadState() {
  const s = await readJson(STATE_FILE, {});
  return {
    repoUrl: s.repoUrl || "",
    branch: s.branch || "main",
    include: { ...DEFAULT_INCLUDE, ...(s.include || {}) },
    lastSync: s.lastSync || null,
    lastBackup: s.lastBackup || null,
  };
}

async function saveState(patch) {
  const cur = await loadState();
  const next = { ...cur, ...patch };
  await writeJson(STATE_FILE, next);
  return next;
}

async function copyDir(src, dst, skip = ["node_modules", ".git"]) {
  if (!(await exists(src))) return 0;
  let count = 0;
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (skip.includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      count += await copyDir(s, d, skip);
    } else if (e.isFile()) {
      await mkdir(path.dirname(d), { recursive: true });
      await copyFile(s, d);
      count += 1;
    }
  }
  return count;
}

async function countFiles(dir) {
  if (!(await exists(dir))) return 0;
  let n = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) n += await countFiles(path.join(dir, e.name));
    else if (e.isFile()) n += 1;
  }
  return n;
}

function sanitizeYaml(text) {
  let redactions = 0;
  const out = text.split(/\r?\n/).map((line) => {
    const m = line.match(/^(\s*)([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
    if (!m) return line;
    const key = m[2];
    if (/env$/i.test(key)) return line; // e.g. apiKeyEnv — 只是环境变量名
    if (!SECRET_KEY_RE.test(key)) return line;
    const val = m[3].trim();
    if (!val) return line;
    redactions += 1;
    return `${m[1]}${m[2]}: ""`;
  }).join("\n");
  return { text: out, redactions };
}

async function installedVersion(pkgName) {
  const p = path.join(PROFILE_DIR, "node_modules", pkgName, "package.json");
  const j = await readJson(p, null);
  return j && typeof j.version === "string" ? j.version : null;
}

async function profilePlugins() {
  const pkg = await readJson(path.join(PROFILE_DIR, "package.json"), {});
  const bundles = (pkg && pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const deps = pkg.dependencies || {};
  const list = [];
  for (const name of bundles) {
    const spec = typeof deps[name] === "string" ? deps[name] : null;
    const local = !!(spec && (spec.startsWith("link:") || spec.startsWith("file:")));
    const version = (await installedVersion(name)) || (spec && !local ? spec.replace(/^[^\d]*/, "") : null) || "unknown";
    list.push({
      name,
      version,
      spec,
      local,
      builtin: name.startsWith("@deepseek-ai/") || name.startsWith("dsh-"),
    });
  }
  return { pkg, deps, list };
}

async function dshVersion() {
  const candidates = [
    process.env.DSH_VERSION,
    path.join(DSH_HOME, "..", "package.json"),
  ].filter(Boolean);
  for (const c of candidates) {
    const j = await readJson(c, null);
    if (j && typeof j.version === "string" && j.name && j.name.includes("dsh")) return j.version;
  }
  return "unknown";
}

/* --------------------------------------------------------------- export */

async function buildExport(includeIn) {
  const include = { ...DEFAULT_INCLUDE, ...(includeIn || {}) };
  await mkdir(REPO_DIR, { recursive: true });
  // 清掉上一次的包内容（保留 .git）
  for (const p of ["manifest.json", "plugins.json", "redactions.json", "excluded.json", "config", "skills"]) {
    await rm(path.join(REPO_DIR, p), { recursive: true, force: true });
  }

  const counts = { files: 0, skills: 0, plugins: 0, redactions: 0 };
  const redactionsList = [];

  // settings.yaml（脱敏）
  if (include.settings) {
    const f = path.join(DSH_HOME, "settings.yaml");
    if (await exists(f)) {
      const raw = await readFile(f, "utf8");
      const { text, redactions } = sanitizeYaml(raw);
      await mkdir(path.join(REPO_DIR, "config"), { recursive: true });
      await writeFile(path.join(REPO_DIR, "config", "settings.yaml"), text, "utf8");
      counts.files += 1;
      counts.redactions += redactions;
      if (redactions) redactionsList.push({ file: "settings.yaml", fields: redactions });
    }
  }

  // 全局 AGENTS.md
  if (include.agents) {
    const f = path.join(DSH_HOME, "AGENTS.md");
    if (await exists(f)) {
      await copyFile(f, path.join(REPO_DIR, "config", "AGENTS.md"));
      counts.files += 1;
    }
  }

  // agent-presets
  if (include.presets) {
    const n = await copyDir(path.join(DSH_HOME, ".agent-presets"), path.join(REPO_DIR, "config", "agent-presets"));
    counts.files += n;
  }

  // profile cordis 配置
  for (const rel of ["cordis.patch.yml", "cordis.yml"]) {
    const f = path.join(PROFILE_DIR, rel);
    if (await exists(f)) {
      const dst = path.join(REPO_DIR, "config", "profile", rel);
      await mkdir(path.dirname(dst), { recursive: true });
      await copyFile(f, dst);
      counts.files += 1;
    }
  }

  // skills
  if (include.skills) {
    const n = await copyDir(path.join(DSH_HOME, "skills"), path.join(REPO_DIR, "skills"));
    counts.skills = n;
    counts.files += n;
  }

  // 插件清单
  if (include.plugins) {
    const info = await profilePlugins();
    const payload = {
      generatedAt: new Date().toISOString(),
      profile: PROFILE,
      bundles: info.list,
      local: info.list.filter((p) => p.local).map((p) => p.name),
    };
    await writeJson(path.join(REPO_DIR, "plugins.json"), payload);
    counts.plugins = info.list.length;
    counts.files += 1;
  }

  // 可选：环境/主题类
  if (include.optional) {
    const f = path.join(DSH_HOME, "dream-skin.json");
    if (await exists(f)) {
      await copyFile(f, path.join(REPO_DIR, "config", "dream-skin.json"));
      counts.files += 1;
    }
  }

  // 脱敏与被排除清单
  await writeJson(path.join(REPO_DIR, "redactions.json"), { generatedAt: new Date().toISOString(), entries: redactionsList });
  await writeJson(path.join(REPO_DIR, "excluded.json"), { note: "以下内容永不进入同步包", patterns: ALWAYS_EXCLUDED });
  counts.files += 2;

  // manifest
  const manifest = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    dshVersion: await dshVersion(),
    tool: TOOL_ID,
    toolVersion: TOOL_VERSION,
    profile: PROFILE,
    include,
    counts,
  };
  await writeJson(path.join(REPO_DIR, "manifest.json"), manifest);
  counts.files += 1;

  return { dir: REPO_DIR, manifest, counts };
}

/* --------------------------------------------------------------- import */

async function backupCurrent() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(BACKUP_DIR, stamp);
  await mkdir(dir, { recursive: true });
  const files = ["settings.yaml", "AGENTS.md"];
  for (const f of files) {
    const src = path.join(DSH_HOME, f);
    if (await exists(src)) await copyFile(src, path.join(dir, f));
  }
  await copyDir(path.join(DSH_HOME, ".agent-presets"), path.join(dir, ".agent-presets"));
  await copyDir(path.join(DSH_HOME, "skills"), path.join(dir, "skills"));
  for (const rel of ["cordis.patch.yml", "cordis.yml", "package.json"]) {
    const src = path.join(PROFILE_DIR, rel);
    if (await exists(src)) await copyFile(src, path.join(dir, "profile-" + rel));
  }
  return dir;
}

async function importPackage(dirIn, opts, ctx) {
  const srcDir = dirIn || REPO_DIR;
  const manifest = await readJson(path.join(srcDir, "manifest.json"), null);
  if (!manifest || manifest.schema !== 1) {
    throw Object.assign(new Error("非法或缺失的 manifest.json（需要 schema:1）"), { statusCode: 400, code: "error.badManifest" });
  }
  const backup = await backupCurrent();
  await saveState({ lastBackup: backup });

  const report = {
    backup,
    plugins: { installed: [], updated: [], skipped: [], failed: [] },
    config: [],
    skills: [],
    needsRestart: false,
    conflicts: [],
  };

  // 1) 插件
  if (manifest.include ? manifest.include.plugins !== false : true) {
    const pj = await readJson(path.join(srcDir, "plugins.json"), { bundles: [] });
    for (const p of pj.bundles || []) {
      if (p.builtin) {
        report.plugins.skipped.push({ name: p.name, reason: "builtin" });
        continue;
      }
      if (p.local) {
        report.plugins.skipped.push({ name: p.name, reason: "local/link 插件需手动安装" });
        continue;
      }
      const want = p.version && p.version !== "unknown" ? p.version : null;
      const have = await installedVersion(p.name);
      if (want && have === want) {
        report.plugins.skipped.push({ name: p.name, reason: "already " + want });
        continue;
      }
      const spec = want ? `${p.name}@${want}` : p.name;
      try {
        if (have && want && ctx.pluginManager) {
          await ctx.pluginManager.updateBundle(p.name, want, { registry: OFFICIAL_REGISTRY });
          report.plugins.updated.push({ name: p.name, from: have, to: want });
        } else if (ctx.pluginManager) {
          await ctx.pluginManager.installBundle(spec, { registry: OFFICIAL_REGISTRY });
          report.plugins.installed.push({ name: p.name, version: want || "latest" });
        } else {
          report.plugins.failed.push({ name: p.name, error: "pluginManager 服务不可用" });
        }
        report.needsRestart = true;
      } catch (e1) {
        try {
          await ctx.pluginManager.installBundle(spec);
          report.plugins.installed.push({ name: p.name, version: want || "latest", note: "fallback registry" });
          report.needsRestart = true;
        } catch (e2) {
          report.plugins.failed.push({ name: p.name, error: String((e2 && e2.message) || e1) });
        }
      }
    }
  }

  // 2) 配置
  const cfgDir = path.join(srcDir, "config");
  if (await exists(path.join(cfgDir, "settings.yaml"))) {
    await copyFile(path.join(cfgDir, "settings.yaml"), path.join(DSH_HOME, "settings.yaml"));
    report.config.push("settings.yaml");
    report.needsRestart = true;
  }
  if (await exists(path.join(cfgDir, "AGENTS.md"))) {
    await copyFile(path.join(cfgDir, "AGENTS.md"), path.join(DSH_HOME, "AGENTS.md"));
    report.config.push("AGENTS.md");
  }
  if (await exists(path.join(cfgDir, "agent-presets"))) {
    const n = await copyDir(path.join(cfgDir, "agent-presets"), path.join(DSH_HOME, ".agent-presets"));
    report.config.push(`agent-presets (${n} files)`);
  }
  const profSrc = path.join(cfgDir, "profile");
  for (const rel of ["cordis.patch.yml", "cordis.yml"]) {
    const s = path.join(profSrc, rel);
    if (await exists(s)) {
      await copyFile(s, path.join(PROFILE_DIR, rel));
      report.config.push("profile/" + rel);
      report.needsRestart = true;
    }
  }
  if (await exists(path.join(cfgDir, "dream-skin.json"))) {
    await copyFile(path.join(cfgDir, "dream-skin.json"), path.join(DSH_HOME, "dream-skin.json"));
    report.config.push("dream-skin.json");
  }

  // 3) skills
  const skillsSrc = path.join(srcDir, "skills");
  if (await exists(skillsSrc)) {
    const entries = await readdir(skillsSrc, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dst = path.join(DSH_HOME, "skills", e.name);
      if (await exists(dst)) report.conflicts.push({ skill: e.name, action: "overwritten" });
      await copyDir(path.join(skillsSrc, e.name), dst);
      report.skills.push(e.name);
    }
  }

  report.needsRestart = report.needsRestart || report.config.length > 0 || report.skills.length > 0;
  return report;
}

/* ------------------------------------------------------------------ git */

function gitEnv() {
  return {
    ...process.env,
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || "ssh -o StrictHostKeyChecking=no -o BatchMode=yes",
  };
}

async function runGit(args) {
  return execFileP("git", args, { cwd: REPO_DIR, env: gitEnv(), maxBuffer: 1024 * 1024 * 32 });
}

async function ensureRepo(repoUrl, branch) {
  await mkdir(REPO_DIR, { recursive: true });
  if (!(await exists(path.join(REPO_DIR, ".git")))) {
    try {
      await runGit(["init", "-b", branch || "main"]);
    } catch {
      await runGit(["init"]);
    }
  }
  // 确保有提交身份（仅在本仓库缺省时补，不覆盖全局配置）
  try {
    await runGit(["config", "user.email"]);
  } catch {
    await runGit(["config", "user.email", "dsh-config-sync@localhost"]).catch(() => {});
    await runGit(["config", "user.name", "dsh-config-sync"]).catch(() => {});
  }
  if (repoUrl) {
    try {
      await runGit(["remote", "remove", "origin"]);
    } catch {
      /* no remote */
    }
    try {
      await runGit(["remote", "add", "origin", repoUrl]);
    } catch (e) {
      throw Object.assign(new Error("设置远端仓库失败: " + String((e && e.stderr) || e)), { statusCode: 400 });
    }
  }
}

async function pushRepo(repoUrl, branch, includeIn) {
  const br = branch || "main";
  await ensureRepo(repoUrl, br);
  const exp = await buildExport(includeIn);
  await runGit(["add", "-A"]);
  let committed = true;
  try {
    await runGit(["commit", "-m", `config-sync: ${new Date().toISOString()}`]);
  } catch (e) {
    committed = false; // nothing to commit
  }
  try {
    await runGit(["branch", "-M", br]);
  } catch {
    /* ignore */
  }
  try {
    const out = await runGit(["push", "-u", "origin", br]);
    const now = new Date().toISOString();
    await saveState({ repoUrl: repoUrl || (await loadState()).repoUrl, branch: br, lastSync: now });
    return { ok: true, counts: exp.counts, committed, push: (out.stderr || out.stdout || "").trim(), at: now };
  } catch (e) {
    throw Object.assign(new Error("git push 失败: " + String((e && e.stderr) || e)), { statusCode: 502, stage: "push" });
  }
}

async function pullRepo(repoUrl, branch, ctx) {
  const br = branch || "main";
  await ensureRepo(repoUrl, br);
  try {
    await runGit(["fetch", "origin", br]);
    await runGit(["reset", "--hard", `origin/${br}`]);
  } catch (e) {
    throw Object.assign(new Error("git 拉取失败: " + String((e && e.stderr) || e)), { statusCode: 502, stage: "pull" });
  }
  const imp = await importPackage(REPO_DIR, {}, ctx);
  await saveState({ repoUrl: repoUrl || (await loadState()).repoUrl, branch: br, lastSync: new Date().toISOString() });
  return { ok: true, import: imp };
}

/* --------------------------------------------------------------- status */

async function getStatus() {
  const st = await loadState();
  const info = await profilePlugins().catch(() => ({ list: [] }));
  return {
    dshHome: DSH_HOME,
    profile: PROFILE,
    profileDir: PROFILE_DIR,
    repoDir: REPO_DIR,
    repoUrl: st.repoUrl,
    branch: st.branch,
    include: st.include,
    lastSync: st.lastSync,
    lastBackup: st.lastBackup,
    pluginCount: info.list.length,
    skillsCount: await countFiles(path.join(DSH_HOME, "skills")),
    excluded: ALWAYS_EXCLUDED,
  };
}

/* -------------------------------------------------------------- http api */

function jsonResponse(code, payload) {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body)),
    },
  });
}

async function readBody(req) {
  const t = await req.text();
  if (!t.trim()) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function mutationGuard(req) {
  if (req.headers.get(MARKER_HEADER) !== "1") {
    return { statusCode: 403, error: "缺少 " + MARKER_HEADER + " 头" };
  }
  return null;
}

function registerRoutes(ctx) {
  if (!ctx.connection || !ctx.connection.fetch || typeof ctx.connection.fetch.register !== "function") {
    ctx.logger?.warn?.("config-sync: 需要 connection.fetch 才能注册路由");
    return;
  }
  const routes = [
    {
      path: `${API_PREFIX}/state`,
      methods: ["GET"],
      fetch: async () => {
        try {
          return jsonResponse(200, { ok: true, data: await getStatus() });
        } catch (e) {
          return jsonResponse(500, { ok: false, error: String(e && e.message) });
        }
      },
    },
    {
      path: `${API_PREFIX}/export`,
      methods: ["POST"],
      fetch: async (req) => {
        const g = mutationGuard(req);
        if (g) return jsonResponse(g.statusCode, { ok: false, error: g.error });
        try {
          const body = await readBody(req);
          const r = await buildExport(body.include);
          return jsonResponse(200, { ok: true, data: r });
        } catch (e) {
          return jsonResponse(500, { ok: false, error: String(e && e.message) });
        }
      },
    },
    {
      path: `${API_PREFIX}/import`,
      methods: ["POST"],
      fetch: async (req) => {
        const g = mutationGuard(req);
        if (g) return jsonResponse(g.statusCode, { ok: false, error: g.error });
        try {
          const body = await readBody(req);
          const r = await importPackage(body.dir, body, ctx);
          return jsonResponse(200, { ok: true, data: r });
        } catch (e) {
          return jsonResponse(e && e.statusCode ? e.statusCode : 500, { ok: false, error: String(e && e.message) });
        }
      },
    },
    {
      path: `${API_PREFIX}/push`,
      methods: ["POST"],
      fetch: async (req) => {
        const g = mutationGuard(req);
        if (g) return jsonResponse(g.statusCode, { ok: false, error: g.error });
        try {
          const body = await readBody(req);
          const r = await pushRepo(body.repoUrl, body.branch, body.include);
          return jsonResponse(200, { ok: true, data: r });
        } catch (e) {
          return jsonResponse(e && e.statusCode ? e.statusCode : 500, { ok: false, error: String(e && e.message) });
        }
      },
    },
    {
      path: `${API_PREFIX}/pull`,
      methods: ["POST"],
      fetch: async (req) => {
        const g = mutationGuard(req);
        if (g) return jsonResponse(g.statusCode, { ok: false, error: g.error });
        try {
          const body = await readBody(req);
          const r = await pullRepo(body.repoUrl, body.branch, ctx);
          return jsonResponse(200, { ok: true, data: r });
        } catch (e) {
          return jsonResponse(e && e.statusCode ? e.statusCode : 500, { ok: false, error: String(e && e.message) });
        }
      },
    },
  ];

  ctx.effect(() => {
    const disposers = routes.map((r) =>
      ctx.connection.fetch.register({
        path: r.path,
        methods: r.methods,
        requestBody: "buffered",
        fetch: r.fetch,
      })
    );
    return () => {
      for (const d of disposers) {
        try {
          d();
        } catch {
          /* ignore */
        }
      }
    };
  }, "config-sync: API routes");
}

/* ---------------------------------------------------------------- tools */

function registerTools(ctx) {
  if (!ctx.tools || typeof ctx.tools.register !== "function") return;
  const reg = (def) => ctx.effect(() => ctx.tools.register(def), `config-sync: tool ${def.name}`);

  reg({
    name: "config_sync_status",
    description: "查看 DSH 配置同步的当前状态（同步仓路径、仓库地址、脚本计数、上次同步时间）。",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    output: { schema: { type: "object" }, render: (_a, v) => [{ type: "text", text: `配置同步：插件 ${v.pluginCount}，skills 文件 ${v.skillsCount}，仓库 ${v.repoUrl || "(未配置)"}，上次同步 ${v.lastSync || "无"}` }] },
    async execute() {
      return getStatus();
    },
  });

  reg({
    name: "config_sync_export",
    description: "把 DSH 全局配置（脱敏）、全局 skills、已安装插件清单导出到本地同步仓（~/.dsh/config-sync/repo）。",
    parameters: {
      type: "object",
      properties: {
        settings: { type: "boolean", description: "导出 settings.yaml（脱敏）" },
        agents: { type: "boolean", description: "导出 AGENTS.md" },
        presets: { type: "boolean", description: "导出 agent-presets" },
        skills: { type: "boolean", description: "导出全局 skills" },
        plugins: { type: "boolean", description: "导出插件清单" },
        optional: { type: "boolean", description: "导出主题/环境类(可选)" },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object" }, render: (_a, v) => [{ type: "text", text: `已导出到 ${v.dir}：${JSON.stringify(v.counts)}` }] },
    async execute(args) {
      return buildExport(args);
    },
  });

  reg({
    name: "config_sync_import",
    description: "从本地同步仓（或指定目录）导入配置、skills 与插件（自动安装 name@version，优先官方 registry）。导入前会自动备份当前配置。",
    parameters: { type: "object", properties: { dir: { type: "string", description: "包目录，默认 ~/.dsh/config-sync/repo" } }, additionalProperties: false },
    output: { schema: { type: "object" }, render: (_a, v) => [{ type: "text", text: `导入完成：插件装 ${v.plugins.installed.length}、更新 ${v.plugins.updated.length}、失败 ${v.plugins.failed.length}；skills ${v.skills.length}；备份 ${v.backup}${v.needsRestart ? "（需重启生效）" : ""}` }] },
    async execute(args) {
      return importPackage(args && args.dir, {}, ctx);
    },
  });

  reg({
    name: "config_sync_push",
    description: "导出并把配置推送到已配置的 Git 仓库（SSH）。可传 repoUrl 覆盖。",
    parameters: {
      type: "object",
      properties: {
        repoUrl: { type: "string", description: "Git 仓库地址（SSH，例如 git@gitee.com:you/dsh-config.git）" },
        branch: { type: "string", description: "分支，默认 main" },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object" }, render: (_a, v) => [{ type: "text", text: `推送完成：${v.committed ? "已提交" : "无变更"}${v.push ? "；" + v.push : ""}` }] },
    async execute(args) {
      const st = await loadState();
      return pushRepo((args && args.repoUrl) || st.repoUrl, (args && args.branch) || st.branch, (args && args.include) || st.include);
    },
  });

  reg({
    name: "config_sync_pull",
    description: "从 Git 仓库拉取最新配置并导入（自动装插件）。",
    parameters: {
      type: "object",
      properties: {
        repoUrl: { type: "string", description: "Git 仓库地址（SSH）" },
        branch: { type: "string", description: "分支，默认 main" },
      },
      additionalProperties: false,
    },
    output: { schema: { type: "object" }, render: (_a, v) => [{ type: "text", text: `拉取导入完成：插件装 ${v.import.plugins.installed.length}、失败 ${v.import.plugins.failed.length}；skills ${v.import.skills.length}${v.import.needsRestart ? "（需重启生效）" : ""}` }] },
    async execute(args) {
      const st = await loadState();
      return pullRepo((args && args.repoUrl) || st.repoUrl, (args && args.branch) || st.branch, ctx);
    },
  });
}

/* ---------------------------------------------------------------- apply */

export function apply(ctx) {
  registerRoutes(ctx);
  registerTools(ctx);
}
