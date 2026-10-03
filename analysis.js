/* Local, explainable assessment implementing the FreeLab review standard.
   No messages or preferences leave the browser. */
const ProjectAnalysis = (() => {
  const defaults = { focus: "ops", protectDaytime: true, busyMonth: "", activeProjects: 0 };
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = () => iso(new Date());
  const known = (value) => !!value && !/未提及|面议|待确认/.test(value);
  const round2 = (value) => Math.round(value * 100) / 100;

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

  const PERSONAL_DOMAINS = /@(?:qq|163|126|sina|foxmail|gmail|outlook|hotmail|yahoo|icloud)\b/i;

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
      [/直播礼物|礼物设计/, "直播礼物"], [/直播|运营活动|活动\s*H5|H5活动|榜单|开屏|弹窗|礼包/, "运营活动视觉"],
      [/IP延展|表情包/, "IP 延展"], [/周边|swag/i, "swag 周边"],
      [/落地页|可交互.*(?:页面|原型)|AI\s*coding/i, "可交互 H5 / 落地页"],
      [/包装/, "包装设计"], [/Instagram|社媒|social|社交媒体/i, "社媒视觉"],
      [/品牌视觉|品牌设计/, "品牌视觉"], [/\bprint\b|排版|字体|画册/i, "印刷 / 排版"],
      [/平面|物料/, "平面物料"], [/\bUI\b|交互|小程序/i, "UI / 交互"],
      [/海报/, "海报"], [/插画/, "插画"], [/视频|剪辑/, "视频剪辑"], [/3D|三维/, "3D"], [/\blogo\b/i, "Logo"]
    ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
    const deliverables = work || [...new Set(categories)].join("、") || "未提及";
    const title = work || (categories.length ? [...new Set(categories)].join(" · ") : lines[0]?.split(/[，,]/)[0]?.slice(0, 60)) || "待确认项目";
    const company = text.match(/([一-龥A-Za-z0-9·（）()]{2,24}(?:有限公司|股份有限公司|股份公司|集团|工作室))/)?.[1]
      || text.match(/Studio\s+[A-Za-z-]+/)?.[0]
      || text.match(/[A-Z][A-Za-z-]+\s+Studio/)?.[0] || "";
    const mode = [...new Set(normalized.match(/项目制|按项目|按件|包月|长期/g) || [])].join("、");
    return {
      title, budget, contact: contacts.join(" / ") || "未提及", deliverables, deadline: deadline(text, reference),
      company, mode, figma: /figma/i.test(text),
      enterpriseEmail: emails.some(address => !PERSONAL_DOMAINS.test(address))
    };
  }

  const NEGATION = /无需|不接受|拒绝|不要|不用|不需|没有/;
  const findClause = (text, pattern) => text.split(/[，,。；;\n]/).find(x => !NEGATION.test(x) && pattern.test(x));

  function assess(text, project = {}, preferences = defaults, now = today()) {
    const profile = { ...defaults, ...preferences };
    const content = `${text} ${project.deliverables || ""}`;
    const firstLine = text.split(/[\n。；;]/).map(x => x.trim()).find(Boolean) || "";

    /* ---------- 一票否决 ---------- */
    const vetoHits = [];
    if (profile.protectDaytime && findClause(text, /全天在线|即时响应|随时响应|坐班|包月驻场|工作日白天|白天沟通/)) vetoHits.push("V1");
    // V2: rough capacity check at <=8h per week, ~1.2h per item.
    const qtyMatch = text.match(/(\d+)\s*(?:张|页|个|套|款)(?!.*(?:轮))/);
    if (qtyMatch && project.deadline) {
      const days = Math.round((new Date(`${project.deadline}T12:00:00`) - new Date(`${now}T12:00:00`)) / 86400000);
      const weeks = Math.max(days / 7, 0.5);
      if ((Number(qtyMatch[1]) * 1.2) / weeks > 8) vetoHits.push("V2");
    }
    if (findClause(text, /押金|会员费|培训费|材料费|身份证|银行卡信息/)) vetoHits.push("V3");
    if (findClause(text, /免费试稿|无偿试稿|试稿[^，,。；;\n]{0,8}(?:免费|无偿|无酬)|试稿[^，,。；;\n]{0,8}商用/)) vetoHits.push("V4");
    if (findClause(text, /公司电脑|公司素材|公司资源|公司设备/)) vetoHits.push("V5");
    if (findClause(text, /仿冒|高仿|盗版|盗用|侵权/)) vetoHits.push("V6");

    const risks = [], reasons = [];
    if (vetoHits.length) {
      const vetoText = {
        V1: "要求全天在线 / 即时响应 / 坐班或白天沟通，与正职时间冲突",
        V2: "按每周 8 小时估算，交付期内做不完",
        V3: "要求先交钱或提供身份证、银行卡信息",
        V4: "免费试稿超出 1 张小图或可直接商用",
        V5: "需要动用主业设备、素材或未公开作品",
        V6: "涉及仿冒、盗版、盗用或违规内容"
      };
      vetoHits.forEach(code => risks.push(`命中${code}：${vetoText[code]}。`));
      return {
        score: 1, total: null, decision: "不接", recommendation: "不接", suggestedStatus: "paused",
        vetoHits, scores: null, reasons: [], risks, questions: [],
        action: "不投递；如对方愿意改为异步、按件结算且取消前置要求，可重新评估。",
        summary: risks[0], capped: false, version: 4
      };
    }

    /* ---------- 五维评分 ---------- */
    const opsSignals = /直播|运营活动|活动\s*H5|榜单|开屏|弹窗|礼包|直播礼物|礼物设计|IP延展|表情包|周边|swag|落地页|可交互|AI\s*coding/i.test(content);
    const overseasEvidence = content.split(/[，,。；;\n]/).find(clause =>
      /出海|海外|\boverseas\b|Instagram/i.test(clause) &&
      !/(?:不涉及|不做|不面向|非|不是|没有|无需).{0,6}(?:出海|海外|overseas|Instagram)/i.test(clause));
    const brand = /品牌视觉|品牌设计/.test(content);
    const genericSocial = /社媒|social|社交媒体/i.test(content);
    const printArt = /\bprint\b|画册|排版|字体/.test(content);
    const weakDirection = /3D|三维|视频剪辑|剪辑/.test(content);
    const designish = /设计|视觉|平面|海报|插画|物料|\bUI\b|小程序|交互|包装|\bH5\b|社媒/.test(content);

    let match;
    if (profile.focus === "general") match = designish ? 4 : 3;
    else if (weakDirection && !designish) match = 1;
    else if (opsSignals || brand) match = 5;
    else if (genericSocial) match = 4;
    else match = designish ? 3 : 3;
    if (printArt && !opsSignals) match = Math.min(match, 4);
    if (project.figma ?? /figma/i.test(content)) match = Math.min(5, match + 1);
    const overseasBonus = overseasEvidence ? Math.min(1, 5 - match) : 0;
    match += overseasBonus;

    const hasMode = /项目制|按项目|按件/.test(content);
    const longTerm = /长期|包月/.test(content);
    const fastFeedback = /反馈及时|及时反馈|快速反馈|响应快/.test(content);
    const days = project.deadline
      ? Math.round((new Date(`${project.deadline}T12:00:00`) - new Date(`${now}T12:00:00`)) / 86400000)
      : null;
    let time;
    if (hasMode && longTerm) time = 4;
    else if (hasMode && !fastFeedback && (days === null || days >= 7)) time = 5;
    else if (longTerm) time = 3;
    else if (fastFeedback) time = 3;
    else if (days !== null && days < 0) time = 1;
    else if (/包装/.test(content) && days !== null && days <= 30) time = 2;
    else if (days !== null && days <= 3) time = 1;
    else if (days !== null && days <= 7) time = 2;
    else time = 3;

    let pay = 3;
    if (/可自报价|自己报价|自行报价|自报价/.test(content)) pay = 4;
    else if (known(project.budget)) pay = 4;
    const lowPay = normalizedAmount(project.budget);
    if (lowPay !== null && lowPay < 200) pay = 1;
    if (/面议/.test(content)) pay = Math.min(pay, 3);

    let portfolio = 3;
    if (/不能署名|不可展示|不能展示|不允许展示|需保密/.test(content)) portfolio = 1;
    if (/(Studio|工作室)/.test(content) && /文化|中英文|排版|字体|画册/.test(content)) portfolio = 5;
    else if (/Studio|工作室/.test(content)) portfolio = Math.max(portfolio, 4);
    if (/家居|生活方式|地毯|文化/.test(content)) portfolio = Math.max(portfolio, 4);
    if (/可署名|允许署名|可放作品集|可展示|署名权/.test(content)) portfolio = 5;

    const cityBrand = /^(?:上海|北京|深圳|广州|杭州|天津|成都|重庆|南京|武汉)[一-龥A-Za-z]{2,}[：:]/.test(firstLine);
    const namedEntity = !!project.company || cityBrand || /^[A-Za-z][\w.\- ]{1,30}/.test(firstLine);
    let risk;
    if (project.company && (project.enterpriseEmail || /官网/.test(content))) risk = 5;
    else if (project.company || cityBrand) risk = 4;
    else if (namedEntity) risk = 3;
    else risk = 1;
    if (/愿付定金|可付定金|支持定金|定金/.test(content)) risk = Math.min(5, risk + 1);

    const scores = { match, time, pay, portfolio, risk };
    const total = round2(match * 0.3 + time * 0.25 + pay * 0.2 + portfolio * 0.15 + risk * 0.1);

    /* ---------- 决策 ---------- */
    let decision = total >= 4 ? "接" : total >= 3.3 ? "备选" : total >= 2.5 ? "看时间" : "不接";
    const caps = [];
    if (profile.activeProjects >= 1 && decision === "接") {
      decision = "备选";
      caps.push("手上已有进行中的项目，按并行上限，新单最高为备选。");
    }
    if (profile.busyMonth && project.deadline && project.deadline.startsWith(profile.busyMonth)) {
      if (decision === "接") decision = "备选";
      else if (decision === "备选") decision = "看时间";
      caps.push("交付落在你设置的忙碌月份，应先核对排期。");
    }
    caps.forEach(x => risks.push(x));

    /* ---------- 理由（引用事实） ---------- */
    if (overseasEvidence) reasons.push({
      evidence: overseasEvidence.trim(),
      text: overseasBonus
        ? "原文明确涉及出海 / 海外业务，方向匹配加 1 分（总分加 0.30）。"
        : "出海 / 海外业务是加分项；方向匹配已达 5 分上限，不再重复加分。"
    });
    if (match >= 5) reasons.push({ evidence: project.mode || "核心方向", text: opsSignals ? "属于直播 / 运营活动 / 礼物 / IP / swag / AI coding 等核心擅长方向。" : "海外社媒或品牌视觉与当前方向直接对口。" });
    else if (match >= 4) reasons.push({ evidence: "方向相关", text: "方向相关但不是最强项，可用对应案例投递。" });
    else reasons.push({ evidence: known(project.deliverables) ? project.deliverables : "交付物待确认", text: designish ? "属于一般平面 / 包装 / 产品 UI 类，作为备选看待。" : "方向与擅长项关联弱。" });
    if (project.figma) reasons.push({ evidence: "Figma", text: "原文写明用 Figma，匹配主力工作流，match 已加 1 分。" });
    if (hasMode && time >= 4) reasons.push({ evidence: project.mode, text: "项目制 / 按件且可异步沟通，时间可行性高。" });
    if (risk >= 4) reasons.push({ evidence: project.company || "主体信息", text: "能看到公司或工作室主体，可进一步核实。" });
    if (/包月/.test(content)) risks.push("「包月」要先写清每月工作量、响应时段和修改上限，否则容易变成无限在线改稿。");
    if (/长期/.test(content) && !hasMode) risks.push("「长期」未说明每月工作量与合作形式，先问清楚再投入。");
    if (risk <= 1) risks.push("只有个人联系方式且描述模糊，无法核实主体，存在被白嫖或压价的风险。");

    /* ---------- 待问：6 项固定谈判点 + 针对性补充 ---------- */
    const questions = [
      "报价和结算方式（按件或按项目），是否含税？",
      "修改轮数（默认 2 轮，超出另计）？",
      "交付时间和沟通时段（工作日 20:00 后、周六下午）？",
      "定金 30–50%，尾款交付后 7 天内结清，可以吗？",
      "是否允许署名并放进作品集？",
      "是否交源文件，是否另计？"
    ];
    if (/包装/.test(content)) questions.push("是否包含刀模、印前文件、打样跟进？SKU 数量是多少？");
    if (!project.deadline) questions.push("初稿、终稿的具体时间分别是什么？");
    if (!known(project.budget)) questions.push("预算范围是多少？面议不代表高预算。");
    if (!known(project.contact)) questions.push("谁负责需求与付款？请补充投递方式。");

    const suggestedStatus = decision === "接" ? "followup" : decision === "不接" ? "paused" : "saved";
    const action = decision === "接" ? "整理 2–3 个最相关案例，按 6 项要点谈清范围、报价与定金后优先投递。" :
      decision === "备选" ? "先投递首选单；若没有回复再投此单，投递前先问清待确认项。" :
      decision === "看时间" ? "只有手上没有在做的单时才考虑；先问清工作量与排期，不先投作品。" :
      "不投递。";

    return {
      score: Math.round(total), total, decision, recommendation: decision, suggestedStatus,
      vetoHits, scores, reasons: reasons.slice(0, 3), risks, questions, action,
      summary: reasons[0]?.text || "信息不足", capped: caps.length > 0, version: 4
    };
  }

  function normalizedAmount(budget) {
    const match = String(budget || "").match(/(\d[\d,.]*)\s*(万)?/);
    if (!match) return null;
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isNaN(amount)) return null;
    return match[2] ? amount * 10000 : amount;
  }

  return { defaults, today, known, parse, deadline, assess };
})();
if (typeof module !== "undefined") module.exports = ProjectAnalysis;
