# 飞书多维表格 AI 语义审核工具

## 功能

- 自动读取飞书多维表格的"正文话题"列
- 调用 AI（大模型）进行语义审核
- 支持检测：违法违规、虚假信息、广告推广、敏感内容、低俗色情、恶意攻击
- 自动汇总审核结果

## 使用步骤

### 1. 安装依赖

```bash
cd feishu-review
npm install
```

### 2. 修改配置

编辑 `feishu-review.js`，修改以下配置：

```javascript
const CONFIG = {
  // 飞书 API 凭证（已有）
  APP_ID: 'cli_a9145de360789bca',
  APP_SECRET: 'JDySW3bPi3LvZJNPpV2WQgKFwFyoh233',
  
  // 多维表格信息（已有）
  APP_TOKEN: 'Tk1XbW59TaqDTvs1KlWcsGbinic',
  TABLE_ID: 'tblG6MRWkMAhu0Bf',  // 确认表格ID
  
  // 要审核的列名
  REVIEW_COLUMN: '正文话题',
  RESULT_COLUMN: '审核结果',
  
  // ⚠️ 你的 AI API Key（需要替换）
  AI_API_KEY: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
  AI_MODEL: 'gpt-3.5-turbo',
  
  // 测试模式（不实际修改数据）
  DRY_RUN: true,  // 先用 true 测试，确认后再改为 false
};
```

### 3. 测试运行

```bash
npm start
```

### 4. 正式运行

确认结果无误后，修改配置：
```javascript
DRY_RUN: false
```

然后重新运行即可更新数据。

## 输出结果

运行后会生成 `review_results.json`，包含：
- 审核汇总（通过/不通过数量）
- 每条记录的审核结果

## AI 审核标准

1. 不含违法违规内容
2. 不含虚假信息
3. 不含广告推广
4. 不含敏感政治内容
5. 不含低俗色情内容
6. 不含恶意攻击性言论
