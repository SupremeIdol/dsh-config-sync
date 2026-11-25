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
      warnHint: { fontSize: "12px", color: "var(--dsw-alias-label-warning, #e0a30c)", lineHeight: "18px", flexBasis: "100%" },
      overlay: {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.55)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: "20px",
      },
      modal: {
        width: "min(520px, 100%)",
        border: "0.5px solid var(--dsw-alias-border-l2, #494949)",
        borderRadius: "16px",
        background: "var(--dsw-alias-bg-layer-1, #1f1f1f)",
        color: "var(--dsw-alias-label-primary, #eee)",
        padding: "20px 22px",
        display: "flex", flexDirection: "column", gap: "14px",
        boxShadow: "0 18px 50px rgba(0,0,0,.45)",
      },
      modalTitle: { margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--dsw-alias-label-warning, #e0a30c)" },
      modalText: { margin: 0, fontSize: "13px", lineHeight: "21px", color: "var(--dsw-alias-label-secondary, #c9c9c9)" },
      btnWarn: {
        height: "34px", padding: "0 16px", borderRadius: "9px",
        border: "0.5px solid #e0a30c", background: "rgba(224,163,12,.16)",
        color: "#e0a30c", fontSize: "13px", fontWeight: 600, cursor: "pointer",
      },
    };

    function ConfigSyncSection() {
      const [st, setSt] = React.useState(null);
      const [repoUrl, setRepoUrl] = React.useState("");
      const [branch, setBranch] = React.useState("main");
      const [inc, setInc] = React.useState({ settings: true, agents: true, presets: true, skills: true, plugins: true, optional: false });
      const [busy, setBusy] = React.useState("");
      const [log, setLog] = React.useState("");
      const [pubConfirm, setPubConfirm] = React.useState(null); // {kind:'push', url, via}
      const [probe, setProbe] = React.useState(null); // {public, checked, reason, via}
      const [ack, setAck] = React.useState(false); // 弹窗内「我已了解风险」勾选
      const [strict, setStrict] = React.useState(false); // 严格模式：无法判定公开性时也要求确认

      const push = (line) => setLog((prev) => (prev ? prev + "\n" : "") + line);

      React.useEffect(() => {
        api("/state")
          .then((s) => {
            setSt(s);
            setRepoUrl(s.repoUrl || "");
            setBranch(s.branch || "main");
            if (s.include) setInc({ ...inc, ...s.include });
            setStrict(!!s.strictPublic);
          })
          .catch((e) => push("加载状态失败: " + e.message));
      }, []);

      // 地址变化时，节流探测仓库是否可匿名公开访问
      React.useEffect(() => {
        if (!String(repoUrl || "").trim()) {
          setProbe(null);
          return;
        }
        let alive = true;
        const t = setTimeout(() => {
          api("/probe", { repoUrl })
            .then((r) => { if (alive) setProbe(r); })
            .catch(() => {});
        }, 500);
        return () => { alive = false; clearTimeout(t); };
      }, [repoUrl]);

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

      const doPush = (allowPublic) => run("推送到仓库", () => api("/push", { repoUrl, branch, include: inc, allowPublic: !!allowPublic }));
      async function requestPush() {
        setBusy("检测仓库可见性");
        let r = probe;
        try {
          r = await api("/probe", { repoUrl });
          setProbe(r);
        } catch { /* 探测失败则沿用上次结果 */ }
        setBusy("");
        const need = r && (typeof r.confirmNeeded === "boolean" ? r.confirmNeeded : !!r.public);
        if (need) {
          setAck(false);
          setPubConfirm({ kind: "push", url: repoUrl, via: r && r.via, public: !!(r && r.public), unknown: !r || (!r.public && r.checked === false), reason: r && r.reason });
        } else {
          doPush(false);
        }
      }

      // 忘记该地址的信任并强制重新探测
      async function reprobe() {
        if (!String(repoUrl || "").trim()) {
          push("请先填写仓库地址");
          return;
        }
        setBusy("重新检测仓库");
        try {
          const r = await api("/probe", { repoUrl, force: true });
          setProbe(r);
          push("重新检测：" + (r.trusted ? "已信任" : r.public ? "公开（需确认）" : r.checked ? "私有/不可匿名访问" : (r.strict ? "无法判定（严格模式：推送前会确认）" : "无法检测")));
        } catch (e) {
          push("重新检测失败: " + e.message);
        } finally {
          setBusy("");
        }
      }

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
            }),
            h("button", { style: { ...styles.btn, height: "32px" }, disabled: !!busy, onClick: reprobe }, "重新检测"),
            probe
              ? probe.trusted
                ? h("span", { style: { ...styles.warnHint, color: "var(--dsw-alias-label-tertiary, #a0a0a0)" } }, "✓ 已信任该地址（上次推送成功，后续不再探测）")
                : probe.public
                  ? h("span", { style: styles.warnHint }, "⚠ 已检测：该仓库可被匿名公开访问（公开）。推送前必须二次确认。")
                  : probe.checked
                    ? h("span", { style: { ...styles.warnHint, color: "var(--dsw-alias-label-tertiary, #a0a0a0)" } }, "✓ 已检测：需凭据访问（私有 / 不可匿名访问）。")
                    : h(
                        "span",
                        { style: strict ? styles.warnHint : { ...styles.warnHint, color: "var(--dsw-alias-label-tertiary, #a0a0a0)" } },
                        strict ? "⚠ 无法匿名判定是否公开（严格模式：推送前会要求确认）。" : "该地址无法匿名检测公开性，按私有处理（如需更稳妥可开严格模式）。"
                      )
              : null
          ),
          h(
            "div",
            { style: styles.row },
            h("span", { style: styles.label }, "分支"),
            h("input", { style: { ...styles.input, flex: "0 1 160px" }, value: branch, onChange: (e) => setBranch(e.target.value) })
          ),
          h(
            "label",
            { style: styles.chk },
            h("input", {
              type: "checkbox",
              checked: !!strict,
              onChange: async (e) => {
                const v = e.target.checked;
                setStrict(v);
                try {
                  await api("/settings", { strictPublic: v });
                  push("严格模式：" + (v ? "已开启" : "已关闭"));
                } catch (err) {
                  push("保存严格模式失败: " + err.message);
                }
              },
            }),
            "严格模式：无法判定公开性时也要求确认（连“网络受限/未知”也先确认，不默认当私有放行）"
          ),
          h(
            "div",
            { style: styles.row },
            chk("settings", "settings.yaml"),
            chk("agents", "AGENTS.md（含引用文件）"),
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
              { style: styles.btnPrimary, disabled: !!busy, onClick: requestPush },
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
        pubConfirm
          ? h(
              "div",
              { style: styles.overlay, onClick: (e) => { if (e.target === e.currentTarget) setPubConfirm(null); } },
              h(
                "div",
                { style: styles.modal },
                h("h3", { style: styles.modalTitle }, pubConfirm.public ? "⚠️ 公开地址确认" : "⚠️ 无法确认仓库是否为公开"),
                h("p", { style: styles.modalText }, pubConfirm.public ? "你填写的备份地址可被匿名公开读取（公开仓库）：" : "无法匿名判定该地址是否公开（严格模式）。可能是网络受限、私有或不可达："),
                h("p", { style: { ...styles.modalText, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" } }, String(pubConfirm.url || "")),
                h("p", { style: styles.modalText }, "推送会把 AGENTS.md、skills、插件清单等配置提交到该仓库；若该仓库是公开的，任何能访问它的人都可能看到这些内容（密钥已在导出时脱敏，但仍可能包含隐私信息）。"),
                h(
                  "label",
                  { style: styles.chk },
                  h("input", { type: "checkbox", checked: ack, onChange: (e) => setAck(e.target.checked) }),
                  pubConfirm.public ? "我已了解风险，确认这是公开仓库" : "我已了解风险，确认仍要推送到该地址"
                ),
                h(
                  "div",
                  { style: styles.row },
                  h("button", { style: styles.btn, onClick: () => setPubConfirm(null) }, "取消"),
                  h(
                    "button",
                    { style: { ...styles.btnWarn, opacity: ack ? 1 : 0.5, cursor: ack ? "pointer" : "not-allowed" }, disabled: !ack, onClick: () => { if (!ack) return; setPubConfirm(null); doPush(true); } },
                    pubConfirm.public ? "确认是公开地址，仍要推送" : "确认仍要推送"
                  )
                )
              )
            )
          : null,
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
