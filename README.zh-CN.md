# DiffLens

DiffLens 是一个在线文本 Diff 工具，面向 JSON、JSONL、HTTP Request、cURL、Cookie、表格和普通文本等内容做本地对比。页面副标题为：`结构化文本对比(仅本地对比，内容不上传)`。

[在线使用 DiffLens](https://www.difflens.io/) · [JSON Diff](https://www.difflens.io/json-diff/) · [JSONL Diff](https://www.difflens.io/jsonl-diff/) · [cURL Diff](https://www.difflens.io/curl-diff/) · [Cookie Diff](https://www.difflens.io/cookie-diff/) · [HTTP Request Diff](https://www.difflens.io/http-request-diff/)

## 在线地址

- 主站：<https://www.difflens.io/>

## 核心功能

- 自动识别输入格式，并按对应格式展示差异。
- 支持手动指定格式，避免自动识别不符合预期。
- 结构化格式按字段路径对比，只展示真正不同的项。
- 文本格式按行对比，支持值内差异高亮。
- 支持从剪贴板读取内容、导入文件、交换左右内容、格式化输入、复制摘要和导出结果。
- 对比在浏览器本地完成，不上传用户输入的对比内容。

## 支持格式

- JSON
- JSONL / NDJSON
- YAML
- TOML
- XML / HTML
- Markdown
- cURL
- JetBrains / IntelliJ `.http` HTTP Request
- CSV / TSV
- Cookie / Set-Cookie
- Java Properties
- Plain Text

## 格式入口页

- [JSON Diff Online](https://www.difflens.io/json-diff/)
- [JSONL Diff Online](https://www.difflens.io/jsonl-diff/)
- [cURL Diff Online](https://www.difflens.io/curl-diff/)
- [Cookie Diff Online](https://www.difflens.io/cookie-diff/)
- [HTTP Request Diff Online](https://www.difflens.io/http-request-diff/)
- [TOML Diff Online](https://www.difflens.io/toml-diff/)
- [Markdown Diff Online](https://www.difflens.io/markdown-diff/)

## 主要特性

- 字段级结构化对比：JSON、JSONL、YAML、TOML、XML、HTML、Cookie、Properties、cURL、HTTP Request 使用结构化 diff。
- 表格对比：CSV / TSV 支持按行和主键列对比。
- 数组主键：JSON、JSONL、YAML、TOML、HTTP Request 支持按对象主键匹配数组元素。
- 忽略规则：支持忽略大小写、忽略空白、忽略字段顺序、忽略指定路径。
- 长值显示：默认完整显示长值，可手动开启省略长值。
- 值内高亮：字段值或文本行部分不一致时，只突出变化片段。
- 输入区显示差异：左右输入窗口内可直接显示差异，并保持可编辑。
- 行号和折叠：输入区支持行号、内容折叠、只看差异。
- HTTP Request 增强：支持请求块折叠、JSON 请求体折叠、JSON body 字段级对比、忽略路径和格式化。
- cURL 增强：解析 method、URL/query、headers、cookies、JSON body、form 和常用选项。
- 布局调节：差异项区域可收起/展开，左右输入区可拖拽调宽。
- 同步滚动：可开启左右输入区同步滚动。
- 安全提示：顶部和结果区明确提示本地处理、不上传内容。

## 安全与隐私

DiffLens 的对比计算在浏览器本地完成，用户粘贴、输入或导入的对比内容不会被上传到服务端。

线上站点可选接入 GA4 和百度统计，用于页面访问统计。统计代码不应采集用户对比内容，并且加载失败不会阻断工具本身使用。开源版本默认不启用统计，需要通过环境变量显式配置。

## 优点

- 对常见结构化文本有更高信噪比，避免纯文本 diff 中大量无关噪声。
- 支持多种接口调试常见输入，如 cURL、Cookie、HTTP Request。
- 输入区既能编辑，也能显示差异，适合边改边看。
- 对比内容本地处理，降低敏感文本泄露风险。
- 静态站点部署简单，运行成本低。

## 缺点与限制

- 输入区的忽略路径源码定位目前重点覆盖 JSON、JSONL 和 HTTP Request 的 JSON 请求体；其他格式的结果区会应用忽略路径，但输入区视觉过滤可能回退到行级 diff。
- Markdown 和 Plain Text 按文档文本做行级 diff，不做语义级结构化解析。
- XML / HTML 的格式化能力较弱，当前主要用于结构化解析和路径对比。
- cURL 和 `.http` 的解析覆盖常见写法，极端 shell 语法、脚本片段或模板变量可能回退为原始字符串比较。
- 站点本身可在线访问，但“本地对比”指用户对比内容不上传，不表示页面资源和统计脚本完全离线。

## 技术栈

- React 19
- TypeScript
- Vite
- CodeMirror
- Vitest
- diff
- fast-xml-parser
- yaml
- smol-toml
- Papa Parse
- lucide-react

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

默认开发服务使用 Vite，并监听 `0.0.0.0`。

## 环境变量

所有环境变量都是可选项。

```text
VITE_GA_MEASUREMENT_ID=
VITE_BAIDU_SITE_ID=
VITE_ANALYTICS_HOSTS=
DIFFLENS_DEPLOY_TARGET=
```

- `VITE_GA_MEASUREMENT_ID`：GA4 Measurement ID。
- `VITE_BAIDU_SITE_ID`：百度统计 hm.js ID。
- `VITE_ANALYTICS_HOSTS`：允许启用统计的域名，多个域名用英文逗号分隔。
- `DIFFLENS_DEPLOY_TARGET`：静态部署目标目录。

## 测试

```bash
npm run test
```

当前测试覆盖格式检测、结构化 diff、文本值内 diff、HTTP Request 折叠、忽略路径对输入区差异显示的影响等核心逻辑。

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`，Vite base 为 `/project/difflens/`。

## 部署

```bash
./scripts/deploy-static.sh
```

部署脚本会把 `dist/` 同步到：

```text
${DIFFLENS_DEPLOY_TARGET}
```

也可以使用：

```bash
npm run deploy:static
```

该命令会先构建再部署。

本地部署可把 `DIFFLENS_DEPLOY_TARGET` 放在 `.env.deploy.local` 中，该文件会被 Git 忽略。
