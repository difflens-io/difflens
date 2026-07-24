# Changelog

本文件整理 DiffLens 项目的需求和落地改动。后续迭代按日期继续追加。

## 2026-07-24

### 项目定义

- 确定项目名为 `DiffLens`。
- 项目定位为参考 IntelliJ IDEA `Compare with Clipboard` 体验的在线文本 Diff 工具。
- 核心目标：自动识别文本格式，只标记不同项，并降低结构化文本对比噪声。
- 明确安全文案：`结构化文本对比(仅本地对比，内容不上传)`。

### 格式支持

- 初始支持 JSON、YAML、XML、HTML、CSV、TSV、Properties、Cookie、Plain Text。
- 新增 Cookie / Set-Cookie 对比，支持 cookie 值和属性差异。
- 新增 Markdown 自动识别和文本 diff。
- 新增 TOML 自动识别、格式化和结构化 diff。
- 新增 cURL 格式支持，解析 method、URL/query、headers、cookies、JSON body、form 和选项。
- 新增 JetBrains / IntelliJ `.http` HTTP Request 格式支持。
- 修复 cURL 被误识别为 Cookie 的问题，提高 cURL / HTTP Request 自动识别优先级。

### 对比能力

- 支持结构化格式按路径输出新增、删除、修改项。
- 支持 CSV / TSV 通过主键列对比行。
- 支持数组对象通过主键字段匹配。
- 支持忽略空白、忽略大小写、忽略字段顺序。
- 支持忽略路径，默认忽略 `timestamp`、`updatedAt`、`createdAt`。
- 增强忽略路径匹配，使 HTTP / cURL JSON body 支持 body 相对路径，如 `$.body.profile.role` 和 `$.profile.role`。
- 增加值内高亮，字段值部分不一致时突出具体变化片段。
- 修复只有一个长纯文本值时值内高亮不生效的问题。
- 长值默认不再强制省略，新增“省略长值”开关。

### 输入区体验

- 左右输入区改为 CodeMirror 编辑器。
- 支持在输入区内直接显示差异，并保持可编辑。
- 支持显示行号。
- 支持 JSON 和 HTTP Request 内容折叠。
- 支持“只看差异”时折叠相同内容。
- 输入区显示差异时应用忽略空白、忽略大小写。
- 增强忽略路径对输入区差异显示的影响：JSON 和 HTTP Request JSON body 中被忽略路径不再高亮。
- 差异项侧栏增加抽屉效果，可收起/展开。
- 左右输入区增加拖拽调宽能力。
- 增加同步滚动开关，开启后任意一侧输入区滚动会同步另一侧。

### HTTP Request 增强

- `.http` 文件支持变量、`###` 请求块、请求行、headers、cookies、body、pre-request / response handler 脚本字段解析。
- 请求块支持类似 IDEA HTTP Request 编辑器的折叠体验。
- JSON 请求体支持对象和数组折叠。
- JSON 请求体支持字段级结构化 diff。
- JSON 请求体支持忽略路径过滤。
- `.http` 格式化输入时会 pretty-print 可解析的 JSON 请求体，并保留变量、分隔符、请求行、headers 和非 JSON body。

### 控件显示

- 按当前格式自动显示/隐藏可用选项，减少无关选项干扰。
- Markdown 和 Plain Text 按文本 diff 展示，避免误用结构化对象控件。
- HTTP Request、JSON、Markdown 等支持折叠控件。

### 分析统计

- 接入 GA4，开源准备后改为通过 `VITE_GA_MEASUREMENT_ID` 配置。
- 接入百度统计，开源准备后改为通过 `VITE_BAIDU_SITE_ID` 配置。
- 分析 GA 无数据的排查路径，包括 Network 请求、GA 后台状态、debug mode、过滤器和数据延迟。
- 统计脚本加载失败时不会影响页面主体功能。

### 安全与隐私

- 明确产品文案：对比内容在浏览器本地处理，不上传用户对比文本。
- 保留简短安全提示，避免页面说明过度冗长。
- 说明统计脚本只用于访问统计，不应采集用户对比内容。

### 验证

- 多轮执行 `npm run test`，当前测试为 23 个用例通过。
- 多轮执行 `npm run build`，构建通过，仅保留现有大 chunk 提示。
- 多轮执行 `npm audit --omit=dev`，结果为 0 vulnerabilities。
- 使用浏览器级 CDP 检查验证差异项抽屉、输入区拖拽调宽和同步滚动交互。

### 开源准备

- 新增 `.gitignore`，排除 `node_modules/`、`dist/`、`test-results/`、coverage、日志和本地 env 文件。
- 新增 MIT `LICENSE`。
- 新增 `CODE_OF_CONDUCT.md`。
- 新增 `.env.example`，公开说明可配置的统计和部署环境变量。
- 新增 `CONTRIBUTING.md` 和 `SECURITY.md`。
- 新增 GitHub Actions CI，运行 `npm ci`、`npm run test` 和 `npm run build`。
- 新增 GitHub issue 模板和 pull request 模板。
- 更新 `package.json`，补充 description、license、homepage、repository、bugs、keywords 和 Node.js engine。
- 升级 Vitest 到 `4.1.10`，消除 dev dependency audit 漏洞。
- 将 GA4、百度统计和统计域名改为 Vite 环境变量配置，开源默认不启用统计。
- 将静态部署目标改为 `DIFFLENS_DEPLOY_TARGET`，本地部署可通过被忽略的 `.env.deploy.local` 配置。

### 增长与发现

- 新增 `robots.txt` 和 `sitemap.xml`，方便搜索引擎发现。
- 新增 `llms.txt`，方便 AI 和 Agent 类工具理解项目入口。
- 新增 JSON diff、cURL diff、Cookie diff、HTTP Request diff、TOML diff、Markdown diff 的静态 SEO 入口页。
- 为主页面新增 canonical、Open Graph、Twitter Card 和 WebApplication 结构化元信息。
- 更新 README 链接，把 GitHub 访问者引导到线上站点和格式入口页。
