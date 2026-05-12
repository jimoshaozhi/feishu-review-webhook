const http = require('http');

// ============ 审核规则配置（与 feishu-review-v2.js 同步） ============

const REVIEW_RULES = {
  forbiddenWords: [
    '爱他美', '贝因美', '美素佳儿', '金领冠', 'A2', '德爱', '塞纳牧', '贝拉米',
    '欧洲', '新西兰', '荷兰', '北美', '内蒙古', '呼伦贝尔', '驼奶', '羊奶',
    '在飞鹤当导购', '第x部分', 'partX', '【在飞鹤', '第x', '禁止', '替换', '标签',
    '一段', '二段', '提升', '助力', '推荐', 'APP', '小程序', '肠胃', '消化',
    '附件', '附图', '试用装', '小样',
    '100亿益生菌', '独家HMO黄金盾组合'
  ],

  smartSensitiveWords: {
    '发烧': {
      sickContext: ['宝宝发烧', '孩子发烧', '发烧了', '发热', '反复发烧', '高烧', '低烧', '退烧', '发烧时', '发烧后'],
      safeContext: ['天气热', '太阳晒', '脸红', '活动多', '跑闹', '户外热', '热的', '小脸红']
    },
    '药': {
      sickContext: ['宝宝吃药', '喂药', '喝药', '吃药了', '药片', '药粉', '吃药时', '不吃药'],
      safeContext: ['辅食', '食材', '奶粉', '营养']
    },
    '降温': {
      sickContext: ['退烧降温', '物理降温', '降温措施'],
      safeContext: ['天气降温', '空调降温', '降温了']
    },
    '医院': {
      sickContext: ['去医院', '看医生', '挂号', '就诊', '住院', '看病'],
      safeContext: []
    },
    '医生': {
      sickContext: ['看医生', '医生说', '医生建议', '就医', '挂号'],
      safeContext: []
    }
  },

  replaceRules: {
    '母乳': '母ru', '医生': '白大褂', '顶配': '顶.配', '提高': '🔝',
    '护士': '白大褂', '率先': '率.先', '加拿大': '🇨🇦', '助力': '支持',
    '美国': '🇺🇸', '评论区': '👇🏻/PL区', '小程序': '📱', '第一': 'TOP1/NO.1',
    '手机': '📱', '率先': '率·先', '推荐': '安利/tui荐', '肠胃': '肚肚',
    '医院': '🏥', '消化': '肚肚', '口味清淡': '奶香味十足', '帮助': '支持',
    '雷区': '', '避雷': '', '避坑': '', '袋装': '分装', '挂壁少': '不挂壁',
    '国家': '国·家', '小分子蛋白': '小分子水解乳清蛋白',
    '100亿益生菌': '100倍益生菌', '独家HMO黄金盾组合': '专利HMO组合',
    '比普通奶粉高6.4倍吸收效率': '实证吸收效率比普通奶粉高6.4倍',
    '吸收率是 98%': '吸收率是 93%',
    '比普通乳铁蛋白强4倍': 'OPN 比乳铁蛋白珍稀4倍',
    '100%原料自产': '核心原料自产',
    '从挤奶到灌装小于30天': '核心营养原料30天内自产入料'
  },

  xingmaRules: { forbidden: ['扫罐积分'], note: '8 重 HMO 应为 8 重 HMOs' },
  zhuoruiRules: {
    mustInclude: '飞鹤卓睿', forbidden: ['小分子蛋白', '100亿益生菌', '独家HMO黄金盾组合'],
    replace: { '5大脑磷脂群': '5大脑磷脂' }
  },
  xingfeifanRules: {
    mustInclude: '飞鹤星飞帆', forbidden: ['益生菌'],
    replace: { '5大脑磷脂群': '5大脑磷脂', '吸收率是 98%': '吸收率是 93%' }
  },
  jicuiRules: { forbidden: ['A2奶源', '100%原料自产'], replace: { '从挤奶到灌装小于30天': '核心营养原料30天内自产入料' } },
  qicuiRules: { forbidden: ['5大脑磷脂群', '自护力', '叶黄素 + 胆碱'], replace: { '5大脑磷脂群': '5大脑磷脂' } },
  zhenzhuRules: { forbidden: ['0污染', '0添加', 'DHA', 'RNA', 'ARA'], note: '只写全链有机' },

  titleMaxLength: 20,
  forbiddenSymbols: ['**', '<>', '--', '【第x', '第x】']
};

// ============ 飞书配置（新表） ============

const CONFIG = {
  APP_ID: 'cli_a9145de360789bca',
  APP_SECRET: 'JDySW3bPi3LvZJNPpV2WQgKFwFyoh233',
  APP_TOKEN: 'EZpibSDyta520VsvyVScXuYxnMb',
  TABLE_ID: 'tbly9tWeJUzwYaTX',   // 新表
  REVIEW_COLUMN: '正文话题',
  TITLE_COLUMN: '标题',
  RESULT_COLUMN: '审核结果',
};

// ============ HTTP 工具 ============

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? require('https') : require('http');
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ statusCode: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ============ 飞书 API ============

let tokenCache = { token: null, expireTime: 0 };

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expireTime) return tokenCache.token;
  const postData = JSON.stringify({ app_id: CONFIG.APP_ID, app_secret: CONFIG.APP_SECRET });
  const res = await httpRequest({
    protocol: 'https:', hostname: 'open.feishu.cn', port: 443,
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }, postData);
  if (res.data.code !== 0) throw new Error(`获取 token 失败: ${res.data.msg}`);
  tokenCache.token = res.data.tenant_access_token;
  tokenCache.expireTime = now + (res.data.expire - 300) * 1000;
  return tokenCache.token;
}

async function getRecord(recordId) {
  const token = await getTenantAccessToken();
  const res = await httpRequest({
    protocol: 'https:', hostname: 'open.feishu.cn', port: 443,
    path: `/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.TABLE_ID}/records/${recordId}`,
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.data.code !== 0) throw new Error(`读取记录失败: ${res.data.msg}`);
  return res.data.data.record;
}

async function getAllRecords() {
  const token = await getTenantAccessToken();
  let allRecords = [], pageToken = '';
  do {
    const res = await httpRequest({
      protocol: 'https:', hostname: 'open.feishu.cn', port: 443,
      path: `/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.TABLE_ID}/records`,
      method: 'GET', headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.data.code !== 0) throw new Error(`读取记录失败: ${res.data.msg}`);
    allRecords = allRecords.concat(res.data.data.items);
    pageToken = res.data.data.page_token;
  } while (pageToken);
  return allRecords;
}

async function updateRecord(recordId, result) {
  const token = await getTenantAccessToken();
  const postData = JSON.stringify({ fields: { [CONFIG.RESULT_COLUMN]: result } });
  const res = await httpRequest({
    protocol: 'https:', hostname: 'open.feishu.cn', port: 443,
    path: `/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.TABLE_ID}/records/${recordId}`,
    method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }, postData);
  if (res.data.code !== 0) throw new Error(`更新记录失败: ${res.data.msg}`);
  return res.data;
}

// ============ 审核核心逻辑 ============

function checkSmartSensitiveWords(text) {
  const issues = [], warnings = [];
  for (const [word, config] of Object.entries(REVIEW_RULES.smartSensitiveWords)) {
    if (!text.includes(word)) continue;
    let hasSickContext = config.sickContext.some(c => text.includes(c));
    let hasSafeContext = config.safeContext.some(c => text.includes(c));
    if (hasSickContext) {
      const match = config.sickContext.find(c => text.includes(c));
      issues.push(`敏感词（生病语境）: "${word}"（"${match}"）`);
    } else if (!hasSafeContext) {
      warnings.push(`⚠️ 注意: 包含"${word}"，但未明确提到生病场景`);
    }
  }
  return { issues, warnings };
}

function reviewText(text, title = '') {
  const issues = [], warnings = [];

  if (!text || text.trim() === '') {
    return { result: '通过', reason: '内容为空' };
  }

  // 违禁词
  for (const word of REVIEW_RULES.forbiddenWords) {
    if (text.includes(word)) issues.push(`违禁词: "${word}"`);
  }

  // 智能敏感词
  const smart = checkSmartSensitiveWords(text);
  issues.push(...smart.issues);
  warnings.push(...smart.warnings);

  // 特殊符号
  for (const symbol of REVIEW_RULES.forbiddenSymbols) {
    if (text.includes(symbol)) issues.push(`特殊符号: "${symbol}"`);
  }

  // 标题字数
  if (title) {
    const titleLen = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length;
    if (titleLen > REVIEW_RULES.titleMaxLength) {
      issues.push(`标题过长: ${titleLen}字符（限制${REVIEW_RULES.titleMaxLength}字符）`);
    }
  }

  // 替换规则提示
  for (const [key, value] of Object.entries(REVIEW_RULES.replaceRules)) {
    if (text.includes(key)) warnings.push(`需要替换: "${key}" -> "${value}"`);
  }

  // 星妈会
  for (const word of REVIEW_RULES.xingmaRules.forbidden) {
    if (text.includes(word)) issues.push(`星妈会违规: "${word}"`);
  }
  if (text.includes('8 重 HMO') && !text.includes('HMOs')) {
    warnings.push('8 重 HMO 应改为 8 重 HMOs');
  }

  // 卓睿
  if (text.includes('卓睿') && !text.includes('飞鹤卓睿')) issues.push('卓睿需完整呈现为"飞鹤卓睿"');
  for (const word of REVIEW_RULES.zhuoruiRules.forbidden) {
    if (text.includes(word)) issues.push(`卓睿违规: "${word}"`);
  }

  // 星飞帆
  if (text.includes('星飞帆') && !text.includes('飞鹤星飞帆')) issues.push('星飞帆需完整呈现为"飞鹤星飞帆"');

  // 迹萃
  for (const word of REVIEW_RULES.jicuiRules.forbidden) {
    if (text.includes(word)) issues.push(`迹萃违规: "${word}"`);
  }

  // 启萃
  for (const word of REVIEW_RULES.qicuiRules.forbidden) {
    if (text.includes(word)) issues.push(`启萃违规: "${word}"`);
  }

  // 臻稚卓蓓
  for (const word of REVIEW_RULES.zhenzhuRules.forbidden) {
    if (text.includes(word)) issues.push(`臻稚卓蓓违规: "${word}"`);
  }

  // 过长段落
  const longParagraphs = text.split('\n').filter(p => p.length > 100);
  if (longParagraphs.length > 0) warnings.push('存在过长段落（>100字）');

  if (issues.length > 0) {
    return { result: '不通过', reason: issues.join('；'), warnings: warnings.length > 0 ? warnings : undefined };
  } else if (warnings.length > 0) {
    return { result: '需修改', reason: warnings.join('；') };
  }
  return { result: '通过', reason: '无违规内容' };
}

// ============ Vercel Serverless Handler ============

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { record_id, batch } = req.body || {};

    // 批量审核（全表）
    if (batch === true) {
      const records = await getAllRecords();
      const results = { 通过: 0, 不通过: 0, 需修改: 0, 错误: 0 };
      const errors = [];

      for (const record of records) {
        const fields = record.fields;
        const text = fields[CONFIG.REVIEW_COLUMN] || '';
        const title = fields[CONFIG.TITLE_COLUMN] || '';
        const review = reviewText(text, title);
        const resultStr = review.result + (review.warnings ? `（含警告）` : '') + ': ' + review.reason;

        try {
          await updateRecord(record.record_id, resultStr);
          results[review.result]++;
        } catch (e) {
          results['错误']++;
          errors.push({ id: record.record_id, error: e.message });
        }
      }

      return res.status(200).json({
        success: true,
        type: 'batch',
        total: records.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // 单条审核（按钮触发）
    if (!record_id) return res.status(400).json({ error: '缺少 record_id 参数' });

    const record = await getRecord(record_id);
    const fields = record.fields;
    const text = fields[CONFIG.REVIEW_COLUMN] || '';
    const title = fields[CONFIG.TITLE_COLUMN] || '';
    const review = reviewText(text, title);
    const resultStr = review.result + (review.warnings ? `（含警告）` : '') + ': ' + review.reason;

    await updateRecord(record_id, resultStr);

    return res.status(200).json({
      success: true,
      type: 'single',
      record_id,
      review,
      result: resultStr,
    });
  } catch (error) {
    console.error('审核失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
