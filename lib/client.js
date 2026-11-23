window.__ModuleLoader__.load({
  id: "@worktool/dsh-config-sync",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const API = "/api/worktool/dsh-config-sync";
    const HDRS = { "content-type": "application/json", "x-dsh-config-sync": "1" };

    async function api(pathname, body) {
      const res = await fetch(API + pathname, {
        method: body ? "POST" : "GET",
        headers: HDRS,
        body: body ? JSON.stringify(body) : undefined,
      });
      let json;
      try {
        json = await res.json();
      } catch {
        throw new Error("HTTP " + res.status);
      }
      if (!json.ok) throw new Error(json.error || "HTTP " + res.status);
      return json.data;
    }

    const styles = {
      wrap: {
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "4px 2px 40px",
        color: "var(--dsw-alias-label-primary, #eee)",
        fontFamily: "inherit",
        maxWidth: "820px",
      },
      card: {
        border: "0.5px solid var(--dsw-alias-border-l2, #494949)",
        borderRadius: "16px",
        background: "var(--dsw-alias-bg-layer-1, transparent)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      },
      title: { margin: 0, fontSize: "22px", lineHeight: "30px", fontWeight: 600 },
      desc: { margin: 0, color: "var(--dsw-alias-label-tertiary, #a0a0a0)", fontSize: "13px", lineHeight: "20px" },
      row: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
      label: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #b9b9b9)", minWidth: "84px" },
      input: {
        flex: "1 1 320px",
        height: "34px",
        padding: "0 12px",
        borderRadius: "10px",
        border: "0.5px solid var(--dsw-alias-border-l3, #555)",
        background: "var(--dsw-alias-bg-layer-2, transparent)",
        color: "var(--dsw-alias-label-primary, #eee)",
        fontSize: "13px",
        boxSizing: "border-box",
      },
      btn: {
        height: "32px",
        padding: "0 14px",
        borderRadius: "9px",
        border: "0.5px solid var(--dsw-alias-border-l3, #555)",
        background: "var(--dsw-alias-bg-layer-2, transparent)",
        color: "var(--dsw-alias-label-primary, #eee)",
        fontSize: "13px",
        cursor: "pointer",
      },
      btnPrimary: {
        height: "32px",
        padding: "0 16px",
        borderRadius: "9px",
        border: "0.5px solid var(--dsw-alias-brand-primary, #4a86e8)",
        background: "var(--dsw-alias-brand-primary, #4a86e8)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
      },
      chk: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--dsw-alias-label-secondary, #b9b9b9)" },
      log: {
        margin: 0,
        padding: "10px 12px",
        borderRadius: "10px",
        background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08))",
        color: "var(--dsw-alias-label-secondary, #b9b9b9)",
        fontSize: "12px",
        lineHeight: "18px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "240px",
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      },
      hint: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #a0a0a0)", lineHeight: "17px" },
    };

    function ConfigSyncSection() {
      const [st, setSt] = React.useState(null);
      const [repoUrl, setRepoUrl] = React.useState("");
      const [branch, setBranch] = React.useState("main");
      const [inc, setInc] = React.useState({ settings: true, agents: true, presets: true, skills: true, plugins: true, optional: false });
      const [busy, setBusy] = React.useState("");
      const [log, setLog] = React.useState("");

      const push = (line) => setLog((prev) => (prev ? prev + "\n" : "") + line);

      React.useEffect(() => {
        api("/state")
          .then((s) => {
            setSt(s);
            setRepoUrl(s.repoUrl || "");
            setBranch(s.branch || "main");
            if (s.include) setInc({ ...inc, ...s.include });
          })
          .catch((e) => push("加载状态失败: " + e.message));
      }, []);

      async function run(label, fn) {
        setBusy(label);
        push("▶ " + label + " …");
        try {
          const data = await fn();
          push("✓ " + label + " 完成: " + JSON.stringify(data.counts || data, null, 0).slice(0, 800));
          const s = await api("/state").catch(() => null);
          if (s) setSt(s);
        } catch (e) {
          push("✗ " + label + " 失败: " + e.message);
        } finally {
          setBusy("");
        }
      }

      const toggle = (k) => (ev) => setInc({ ...inc, [k]: ev.target.checked });

      const chk = (k, labelText) =>
        h("label", { style: styles.chk }, h("input", { type: "checkbox", checked: !!inc[k], onChange: toggle(k) }), labelText);

      return h(
        "section",
        { style: styles.wrap },
        h(
          "div",
          { style: styles.card },
          h("h2", { style: styles.title }, "配置同步"),
          h(
            "p",
            { style: styles.desc },
            "把 DSH 的全局配置（settings、AGENTS.md、agent-presets）、全局 Skills、已安装插件（name@version）导出为一个可同步的仓库；导入时自动下载安装插件。密钥与运行时会话数据永不导出。"
          ),
          h(
            "div",
            { style: styles.row },
            h("span", { style: styles.label }, "仓库地址"),
            h("input", {
              style: styles.input,
              placeholder: "git@gitee.com:you/dsh-config.git（SSH）",
              value: repoUrl,
              onChange: (e) => setRepoUrl(e.target.value),
            })
          ),
          h(
            "div",
            { style: styles.row },
            h("span", { style: styles.label }, "分支"),
            h("input", { style: { ...styles.input, flex: "0 1 160px" }, value: branch, onChange: (e) => setBranch(e.target.value) })
          ),
          h(
            "div",
            { style: styles.row },
            chk("settings", "settings.yaml"),
            chk("agents", "AGENTS.md"),
            chk("presets", "agent-presets"),
            chk("skills", "Skills"),
            chk("plugins", "插件"),
            chk("optional", "主题/环境(可选)")
          ),
          h(
            "div",
            { style: styles.row },
            h("button", { style: styles.btn, disabled: !!busy, onClick: () => run("导出到本地同步仓", () => api("/export", { include: inc })) }, "导出"),
            h("button", { style: styles.btn, disabled: !!busy, onClick: () => run("从本地同步仓导入", () => api("/import", { include: inc })) }, "本地导入"),
            h(
              "button",
              { style: styles.btnPrimary, disabled: !!busy, onClick: () => run("推送到仓库", () => api("/push", { repoUrl, branch, include: inc })) },
              "推送到仓库"
            ),
            h(
              "button",
              { style: styles.btn, disabled: !!busy, onClick: () => run("从仓库拉取并导入", () => api("/pull", { repoUrl, branch })) },
              "拉取并导入"
            )
          ),
          h(
            "p",
            { style: styles.hint },
            st
              ? `同步仓：${st.repoDir} ｜ 插件 ${st.pluginCount} ｜ skills 文件 ${st.skillsCount} ｜ 上次同步：${st.lastSync || "无"} ｜ 上次备份：${st.lastBackup || "无"}`
              : "加载中…"
          ),
          h(
            "p",
            { style: styles.hint },
            "永不导出：.credentials.yaml、.env、mcp_connector_grants/、storages/、sessions/、cache/、node_modules/ 等。settings 中含密钥的字段会被自动脱敏。"
          )
        ),
        log ? h("pre", { style: styles.log }, log) : null,
        busy ? h("p", { style: styles.hint }, "处理中：" + busy + " …（安装插件可能较慢）") : null
      );
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("settings.section", () => {
          try {
            return ctx.slots.register(
              {
                name: "settings.section",
                id: "dsh-config-sync",
                order: 60,
                label: () => "配置同步",
                icon: "settings",
              },
              ConfigSyncSection
            );
          } catch (e) {
            console.warn("config-sync: register settings.section failed:", e);
            return () => {};
          }
        });
      },
    };
  },
});
