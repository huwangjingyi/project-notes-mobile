/* Local, explainable assessment. No messages or preferences leave the browser. */
const ProjectAnalysis = (() => {
  const defaults = { focus: "social", protectDaytime: true, avoidAI: true, busyMonth: "" };
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = () => iso(new Date());
  const known = (value) => !!value && !/未提及|面议|待确认/.test(value);

  function deadline(text, reference = today()) {
    const base = new Date(`${reference}T12:00:00`);
    if (Number.isNaN(base.getTime())) return "";
    const explicit = text.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
    const md = text.match(/(?:(20\d{2})年)?(\d{1,2})月(?:(\d{1,2})[日号]?|(底|末))/);
    let year, month, day;
    if (explicit) [, year, month, day] = explicit;
    else if (md) {
      year = md[1] || base.getFullYear(); month = md[2];
      day = md[3] || new Date(Number(year), Number(month), 0).getDate();
    } else {
      const relative = text.match(/今天|今晚|明天|明早|后天|(?:本|下)周[一二三四五六日天]/)?.[0];
      if (!relative) return "";
      if (/明天|明早/.test(relative)) base.setDate(base.getDate() + 1);
      else if (relative === "后天") base.setDate(base.getDate() + 2);
      else if (/周/.test(relative)) {
        const weekday = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[relative.at(-1)];
        base.setDate(base.getDate() + weekday - (base.getDay() || 7) + (relative.startsWith("下") ? 7 : 0));
      }
      return iso(base);
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? iso(date) : "";
  }

  function parse(text, reference = today()) {
    const lines = text.split(/[\n。；;]/).map(x => x.trim()).filter(Boolean);
    const normalized = text.replace(/\s+/g, " ").trim();
    const emails = normalized.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
    const handles = [...normalized.matchAll(/(?:微信|vx|v信|wechat|电话)(?:联系)?[：:\s]*([a-z][\w-]{2,19}|1[3-9]\d{9})(?![\w@])/gi)].map(x => x[1]);
    const phones = normalized.match(/(?<!\d)1[3-9]\d{9}(?!\d)/g) || [];
    const contacts = [...new Set([...emails, ...handles, ...phones])];
    const money = /(?:预算范围|费用范围|预算|报价|费用|酬劳|报酬|薪资)[：:\s]*([¥￥]?\s*\d[\d,.]*\s*(?:万|[wk])?(?:\s*[-到至~～]\s*\d[\d,.]*\s*(?:万|[wk])?)?\s*(?:元|人民币|rmb)?(?:\s*[/／]\s*(?:月|天|页|件|项目))?)/i;
    const budget = normalized.match(money)?.[1]?.trim() || normalized.match(/[¥￥]\s*\d[\d,.]*(?:万|k|元)?/i)?.[0] || (/面议/.test(text) ? "面议" : "未提及");
    const workLine = lines.find(x => /(?:工作内容|交付物|需求内容|项目内容)[：:]/.test(x));
    const work = workLine?.replace(/^.*?(?:工作内容|交付物|需求内容|项目内容)[：:]\s*/, "").trim();
    const categories = [
      [/包装/, "包装设计"], [/Instagram|社媒|social|社交媒体/i, "社媒视觉"],
      [/品牌视觉|品牌设计/, "品牌视觉"], [/\bprint\b|排版|字体|画册/i, "印刷 / 排版"],
      [/平面|物料/, "平面物料"], [/\bUI\b|交互|小程序/i, "UI / 交互"],
      [/海报/, "海报"], [/插画/, "插画"], [/视频/, "视频"], [/\blogo\b/i, "Logo"]
    ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
    const deliverables = work || categories.join("、") || "未提及";
    const title = work || (categories.length ? categories.join(" · ") : lines[0]?.split(/[，,]/)[0]?.slice(0, 60)) || "待确认项目";
    return { title, budget, contact: contacts.join(" / ") || "未提及", deliverables, deadline: deadline(text, reference) };
  }

  function assess(text, project, preferences = defaults, now = today()) {
    const profile = { ...defaults, ...preferences };
    const reasons = [], risks = [], questions = [];
    const content = `${text} ${project.deliverables || ""}`;
    const social = /Instagram|社媒|social|社交媒体/i.test(content);
    const overseas = /出海|海外|国际|Instagram/i.test(content);
    const print = /\bprint\b|排版|字体|画册/i.test(content);
    const packaging = /包装/.test(content);
    const design = /设计|视觉|平面|物料|海报|插画|\bUI\b|\bprint\b|social/i.test(content);
    let score = design ? 3 : null;
    let recommendation = design ? "备选" : "信息不足";
    let suggestedStatus = "saved";
    if (profile.focus === "social" && social) {
      score = overseas ? 5 : 4;
      recommendation = "优先联系";
      reasons.push({ evidence: overseas ? "出海 / Instagram 社媒" : "社媒视觉", text: "与当前「社媒 / 品牌视觉」偏好直接匹配，可优先选相关作品投递。" });
    } else if (profile.focus === "packaging" && packaging || profile.focus === "ui" && /\bUI\b|交互|小程序/i.test(content)) {
      score = 4; recommendation = "值得联系";
      reasons.push({ evidence: project.deliverables, text: "交付方向与设置中的主要接单方向一致。" });
    } else if (print && social) {
      score = 4; recommendation = "值得联系";
    }
    if (print) reasons.push({ evidence: "print / 排版 / 字体", text: "需要排版、字体与印刷作品；若还要求中英文沟通，应先核对语言和作品集能力。" });
    if (packaging) {
      reasons.push({ evidence: "包装设计", text: "重点核对刀模、出血、色彩和印前交付经验；视觉设计经验不能直接替代印刷落地能力。" });
      questions.push("是否包含刀模、印前文件、打样跟进？SKU 数量和修改轮次是多少？");
      if (profile.focus !== "packaging") recommendation = "看时间";
    }
    if (!reasons.length) reasons.push({ evidence: known(project.deliverables) ? project.deliverables : "交付物尚不明确", text: design ? "可作为设计备选，但需要用具体作品和工作量判断胜任度。" : "原文不足以识别工作范围，暂不打星，先补充项目需求。" });
    if (/远程|remote/i.test(text)) reasons.push({ evidence: "远程工作", text: "减少通勤成本；远程不等于时间自由，仍需确认响应时段。" });
    if (/按件|按项目|项目制/.test(text)) reasons.push({ evidence: "按件 / 项目制", text: "可先谈单件范围与验收标准，再判断投入产出。" });
    const daytime = text.split(/[，,。；;\n]/).find(x => !/无需|不要求|不用|不需|非全职/.test(x) && /全天|全职|驻场|随时响应|工作日.*在线|白天.*在线|24小时/.test(x));
    if (daytime && profile.protectDaytime) {
      score = 1; recommendation = "不建议接"; suggestedStatus = "paused";
      risks.push(`原文「${daytime.trim()}」与「保护正职时间」偏好冲突。`);
    }
    const ai = /\bAI\b|人工智能/i.test(text);
    if (ai && profile.avoidAI && score !== 1) {
      score = 2; recommendation = "先不碰"; suggestedStatus = "paused";
      risks.push("涉及 AI 产品，命中你设置的回避方向；是否存在竞业或利益冲突仍需自行核实，系统不能作法律判断。");
    }
    const paymentRisk = text.split(/[，,。；;\n]/).find(x => !/不接受|拒绝|无需|不需要/.test(x) && /无偿|免费试稿|试稿不付|试稿无偿|纯佣|先交押金|先付费|置换/.test(x));
    if (paymentRisk) {
      score = score === null ? 1 : Math.min(score, 2); recommendation = "暂不投入"; suggestedStatus = "paused";
      risks.push(`原文「${paymentRisk.trim()}」涉及无保底或前置成本，先核实结算保障。`);
    }
    if (project.deadline) {
      const days = Math.round((new Date(`${project.deadline}T12:00:00`) - new Date(`${now}T12:00:00`)) / 86400000);
      if (days < 0) {
        recommendation = "先确认是否有效"; suggestedStatus = "saved";
        risks.push("识别到的截止日期已过，不应当作仍开放的机会直接投递。");
      } else if (days <= 3) {
        if (score > 2) recommendation = "看时间";
        risks.push("距离截止不超过 3 天，需要先核实工作量与可用排期。");
      }
      if (profile.busyMonth && project.deadline.startsWith(profile.busyMonth)) {
        if (score > 2) recommendation = "看时间";
        risks.push("交付落在你设置的忙碌月份，应先核对排期。");
      }
    } else questions.push("初稿、终稿及日常响应时间分别是什么？");
    if (!known(project.budget)) questions.push("预算、定金比例、验收与付款日期是什么？面议不代表高预算。");
    else questions.push(`已给预算「${project.budget}」；需结合数量、修改轮次与耗时核算时薪，不能据此认定划算。`);
    if (!known(project.contact)) questions.push("谁负责需求与付款？请补充联系方式。");
    questions.push("是否有书面范围、修改上限和付款约定？");
    if (score >= 4 && !risks.length) suggestedStatus = "followup";
    const action = recommendation === "不建议接" ? "只有对方允许异步沟通、按交付验收后，再考虑重评。" :
      suggestedStatus === "paused" ? "先确认冲突或结算问题，再决定是否投入作品与试稿。" :
      recommendation === "先确认是否有效" ? "先问项目是否仍在招募，并更新截止日期。" :
      packaging ? "先问印前范围、预算和排期；有相应包装案例且时间可用，再投递。" :
      score >= 4 ? "整理最相关的 2–3 个案例，先确认范围和预算，再决定报价。" : "先补齐需求和时间要求，再决定是否投入。";
    return { score, recommendation, suggestedStatus, reasons, risks, questions, action, summary: reasons[0].text, version: 2 };
  }
  return { defaults, today, known, parse, deadline, assess };
})();
if (typeof module !== "undefined") module.exports = ProjectAnalysis;
