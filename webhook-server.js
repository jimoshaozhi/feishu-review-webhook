const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 飞书配置
const CONFIG = {
  APP_ID: 'cli_a9145de360789bca',
  APP_SECRET: 'JDySW3bPi3LvZJNPpV2WQgKFwFyoh233',
  APP_TOKEN: 'EZpibSDyta520VsvyVScXuYxnMb',
  TABLE_ID: 'tblNJIdc9R10hCxf',
  REVIEW_COLUMN: '正文话题',
  RESULT_COLUMN: '审核结果',
};

// 存储 tenant_access_token
let tokenCache = {
  token: null,
  expireTime: 0,
};

// 获取 tenant_access_token
async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expireTime) {
    return tokenCache.token;
  }

  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: CONFIG.APP_ID,
    app_secret: CONFIG.APP_SECRET,
  });

  if (res.data.code !== 0) {
    throw new Error(`获取 token 失败: ${res.data.msg}`);
  }

  tokenCache.token = res.data.tenant_access_token;
  tokenCache.expireTime = now + (res.data.expire - 300) * 1000;

  return tokenCache.token;
}

// 读取记录
async function getRecord(recordId) {
  const token = await getTenantAccessToken();
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.TABLE_ID}/records/${recordId}`;
  
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.data.code !== 0) {
    throw new Error(`读取记录失败: ${res.data.msg}`);
  }

  return res.data.data.record;
}

// 更新记录
async function updateRecord(recordId, result) {
  const token = await getTenantAccessToken();
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.APP_TOKEN}/tables/${CONFIG.TABLE_ID}/records/${recordId}`;
  
  const res = await axios.put(
    url,
    {
      fields: {
        [CONFIG.RESULT_COLUMN]: result,
      },
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.data.code !== 0) {
    throw new Error(`更新记录失败: ${res.data.msg}`);
  }

  return res.data;
}

// 审核逻辑（简化版，只返回状态）
function reviewContent(text) {
  if (!text || text.trim() === '') {
    return '不通过：正文话题为空';
  }

  const issues = [];

  // 检查违禁词
  const bannedWords = [
    '惠氏', '达能', '美赞臣', '雅培', '美素佳儿', '诺优能', '爱他美',
    '发烧', '发热', '药', '医生', '医院', '治疗', ' EB', 'EPA', 'DHA',
    '有机', 'A2', '去火', '消食', '转奶', '转奶期',
  ];

  for (const word of bannedWords) {
    if (text.includes(word)) {
      issues.push(`包含违禁词: ${word}`);
    }
  }

  // 检查需替换词
  const replaceWords = ['评论区', 'PL区', '主楼', '直播间', '小助手'];
  for (const word of replaceWords) {
    if (text.includes(word)) {
      issues.push(`需替换: ${word} → 对应符号/表情`);
    }
  }

  // 检查标题字数
  const titleMatch = text.match(/^#\s*(.+)$/m);
  if (titleMatch) {
    const title = titleMatch[1];
    if (title.length > 20) {
      issues.push(`标题超过20字符: ${title.length}字符`);
    }
  }

  if (issues.length > 0) {
    return `不通过：${issues.join('；')}`;
  }

  return '通过';
}

// Webhook 端点
app.post('/webhook/review', async (req, res) => {
  console.log('收到 webhook 请求:', JSON.stringify(req.body, null, 2));

  try {
    // 飞书按钮 webhook 的数据格式
    const { record_id, action } = req.body;

    if (!record_id) {
      return res.status(400).json({ error: '缺少 record_id' });
    }

    console.log(`开始审核记录: ${record_id}`);

    // 读取记录内容
    const record = await getRecord(record_id);
    const content = record.fields[CONFIG.REVIEW_COLUMN];

    console.log(`审核内容: ${content}`);

    // 执行审核
    const result = reviewContent(content);

    console.log(`审核结果: ${result}`);

    // 更新记录
    await updateRecord(record_id, result);

    console.log(`记录 ${record_id} 审核完成`);

    res.json({
      success: true,
      message: '审核完成',
      result: result,
    });
  } catch (error) {
    console.error('审核失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook 服务启动成功！`);
  console.log(`   - 监听端口: ${PORT}`);
  console.log(`   - Webhook URL: http://localhost:${PORT}/webhook/review`);
  console.log(`   - 健康检查: http://localhost:${PORT}/health`);
  console.log(``);
  console.log(`📝 下一步：`);
  console.log(`   1. 使用 ngrok 等工具将服务暴露到公网`);
  console.log(`   2. 在飞书表格中添加按钮字段，配置 webhook URL`);
});
