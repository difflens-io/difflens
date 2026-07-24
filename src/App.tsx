import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Braces,
  Clipboard,
  Cookie as CookieIcon,
  Copy,
  Download,
  Eraser,
  FileText,
  GripVertical,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  Table2,
  Terminal,
  Upload,
  Wand2
} from 'lucide-react';
import {
  CodeDiffEditor,
  type CodeDiffEditorHandle,
  type EditorScrollMetrics
} from './components/CodeDiffEditor';
import { trackEvent } from './core/analytics';
import { compareInputs, DEFAULT_OPTIONS, preview } from './core/diff';
import {
  COOKIE_LEFT,
  COOKIE_RIGHT,
  CURL_LEFT,
  CURL_RIGHT,
  CSV_LEFT,
  CSV_RIGHT,
  HTTP_REQUEST_LEFT,
  HTTP_REQUEST_RIGHT,
  JSON_LEFT,
  JSON_RIGHT,
  MARKDOWN_LEFT,
  MARKDOWN_RIGHT,
  TOML_LEFT,
  TOML_RIGHT
} from './core/examples';
import { buildInlineDiff, type InlineDiffPart } from './core/inlineDiff';
import type { CompareResult, DiffItem, DiffOptions, DiffType, FormatMode, TextDiffRow } from './core/types';

const FORMAT_OPTIONS: Array<{ value: FormatMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'curl', label: 'cURL' },
  { value: 'http', label: 'HTTP Request' },
  { value: 'csv', label: 'CSV' },
  { value: 'tsv', label: 'TSV' },
  { value: 'cookie', label: 'Cookie' },
  { value: 'properties', label: 'Properties' },
  { value: 'text', label: 'Plain Text' }
];

const TYPE_LABEL: Record<DiffType, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改'
};

type VisibleControls = Record<
  | 'ignoreWhitespace'
  | 'ignoreCase'
  | 'ignoreKeyOrder'
  | 'highlightInlineChanges'
  | 'abbreviateLongValues'
  | 'showDiffInEditors'
  | 'showEditorLineNumbers'
  | 'enableEditorFolding'
  | 'onlyChanges'
  | 'arrayKey'
  | 'csvKey'
  | 'ignoredPaths',
  boolean
>;

const ARRAY_KEY_FORMATS = new Set<CompareResult['kind']>(['json', 'yaml', 'toml', 'http']);

export default function App() {
  const [left, setLeft] = useState(JSON_LEFT);
  const [right, setRight] = useState(JSON_RIGHT);
  const [formatMode, setFormatMode] = useState<FormatMode>('auto');
  const [options, setOptions] = useState<DiffOptions>(DEFAULT_OPTIONS);
  const [selectedId, setSelectedId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [editorSplit, setEditorSplit] = useState(50);
  const [syncScroll, setSyncScroll] = useState(false);
  const leftInputRef = useRef<HTMLInputElement | null>(null);
  const rightInputRef = useRef<HTMLInputElement | null>(null);
  const leftEditorRef = useRef<CodeDiffEditorHandle | null>(null);
  const rightEditorRef = useRef<CodeDiffEditorHandle | null>(null);
  const editorsRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);

  const result = useMemo(
    () => compareInputs(left, right, formatMode, options),
    [left, right, formatMode, options]
  );
  const visibleControls = controlsForResult(result, options);
  const workspaceStyle = {
    '--navigator-width': navigatorOpen ? '300px' : '44px'
  } as CSSProperties;
  const editorsStyle = {
    '--left-editor-size': `${editorSplit}fr`,
    '--right-editor-size': `${100 - editorSplit}fr`
  } as CSSProperties;

  const selectedIndex = result.items.findIndex((item) => item.id === selectedId);

  function updateOption<K extends keyof DiffOptions>(key: K, value: DiffOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
    if (typeof value === 'boolean') {
      trackEvent('option_changed', {
        option: String(key),
        enabled: value
      });
    }
  }

  async function compareWithClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setMessage('剪贴板为空');
        return;
      }
      if (!left.trim()) setLeft(text);
      else setRight(text);
      setMessage('已读取剪贴板');
      trackEvent('clipboard_compare', { target: left.trim() ? 'right' : 'left' });
    } catch {
      setMessage('浏览器未授权读取剪贴板');
    }
  }

  async function copyDiffSummary() {
    const lines = result.items.map(
      (item) => `${TYPE_LABEL[item.type]} ${item.path}: ${item.summary}`
    );
    await navigator.clipboard.writeText(lines.join('\n'));
    setMessage('差异摘要已复制');
    trackEvent('copy_diff_summary', {
      format: result.label,
      diff_count: result.stats.total
    });
  }

  function downloadSummary() {
    const payload = {
      format: result.label,
      stats: result.stats,
      items: result.items
    };
    downloadFile('difflens-result.json', JSON.stringify(payload, null, 2), 'application/json');
    trackEvent('download_summary', {
      format: result.label,
      diff_count: result.stats.total
    });
  }

  function selectRelative(offset: number) {
    if (result.items.length === 0) return;
    const current = selectedIndex >= 0 ? selectedIndex : 0;
    const next = (current + offset + result.items.length) % result.items.length;
    setSelectedId(result.items[next].id);
  }

  const handleEditorScroll = useCallback((side: 'left' | 'right', metrics: EditorScrollMetrics) => {
    if (!syncScroll || syncingScrollRef.current) return;

    const target = side === 'left' ? rightEditorRef.current : leftEditorRef.current;
    if (!target) return;

    syncingScrollRef.current = true;
    target.scrollToRatio(metrics.topRatio, metrics.leftRatio);
    window.setTimeout(() => {
      syncingScrollRef.current = false;
    }, 80);
  }, [syncScroll]);

  function updateEditorSplitFromPointer(clientX: number) {
    const rect = editorsRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const next = ((clientX - rect.left) / rect.width) * 100;
    setEditorSplit(clamp(next, 28, 72));
  }

  function startEditorResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateEditorSplitFromPointer(event.clientX);
  }

  function moveEditorResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if ((event.buttons & 1) !== 1) return;
    updateEditorSplitFromPointer(event.clientX);
  }

  function formatInputs() {
    setLeft(result.leftDetection.formatted);
    setRight(result.rightDetection.formatted);
    setMessage('已按识别格式整理输入');
    trackEvent('format_inputs', { format: result.label });
  }

  function loadFiles(side: 'left' | 'right', files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    file.text().then((content) => {
      if (side === 'left') setLeft(content);
      else setRight(content);
      setMessage(`已导入 ${file.name}`);
      trackEvent('file_import', {
        side,
        extension: getFileExtension(file.name),
        size_bucket: bucketFileSize(file.size)
      });
    });
  }

  function loadJsonSample() {
    setLeft(JSON_LEFT);
    setRight(JSON_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'json' });
  }

  function loadCsvSample() {
    setLeft(CSV_LEFT);
    setRight(CSV_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', 'id');
    trackEvent('sample_loaded', { sample: 'csv' });
  }

  function loadCookieSample() {
    setLeft(COOKIE_LEFT);
    setRight(COOKIE_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'cookie' });
  }

  function loadMarkdownSample() {
    setLeft(MARKDOWN_LEFT);
    setRight(MARKDOWN_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'markdown' });
  }

  function loadTomlSample() {
    setLeft(TOML_LEFT);
    setRight(TOML_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'toml' });
  }

  function loadCurlSample() {
    setLeft(CURL_LEFT);
    setRight(CURL_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'curl' });
  }

  function loadHttpRequestSample() {
    setLeft(HTTP_REQUEST_LEFT);
    setRight(HTTP_REQUEST_RIGHT);
    setFormatMode('auto');
    updateOption('csvKey', '');
    trackEvent('sample_loaded', { sample: 'http' });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Braces size={21} />
          </div>
          <div>
            <h1>DiffLens</h1>
            <p>结构化文本对比(仅本地对比，内容不上传)</p>
          </div>
        </div>

        <div className="toolbar">
          <label className="select-field">
            <span>格式</span>
            <select
              value={formatMode}
              onChange={(event) => {
                const nextMode = event.target.value as FormatMode;
                setFormatMode(nextMode);
                trackEvent('format_mode_changed', { mode: nextMode });
              }}
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="icon-button primary" onClick={compareWithClipboard}>
            <Clipboard size={17} />
            <span>剪贴板对比</span>
          </button>

          <button type="button" className="icon-button" onClick={() => selectRelative(-1)}>
            <ArrowUp size={17} />
            <span>上一个</span>
          </button>
          <button type="button" className="icon-button" onClick={() => selectRelative(1)}>
            <ArrowDown size={17} />
            <span>下一个</span>
          </button>
        </div>
      </header>

      <section className="control-band" aria-label="controls">
        {visibleControls.ignoreWhitespace ? (
          <Toggle
            checked={options.ignoreWhitespace}
            label="忽略空白"
            onChange={(checked) => updateOption('ignoreWhitespace', checked)}
          />
        ) : null}
        {visibleControls.ignoreCase ? (
          <Toggle
            checked={options.ignoreCase}
            label="忽略大小写"
            onChange={(checked) => updateOption('ignoreCase', checked)}
          />
        ) : null}
        {visibleControls.ignoreKeyOrder ? (
          <Toggle
            checked={options.ignoreKeyOrder}
            label="忽略字段顺序"
            onChange={(checked) => updateOption('ignoreKeyOrder', checked)}
          />
        ) : null}
        {visibleControls.highlightInlineChanges ? (
          <Toggle
            checked={options.highlightInlineChanges}
            label="值内高亮"
            onChange={(checked) => updateOption('highlightInlineChanges', checked)}
          />
        ) : null}
        {visibleControls.abbreviateLongValues ? (
          <Toggle
            checked={options.abbreviateLongValues}
            label="省略长值"
            onChange={(checked) => updateOption('abbreviateLongValues', checked)}
          />
        ) : null}
        {visibleControls.showDiffInEditors ? (
          <Toggle
            checked={options.showDiffInEditors}
            label="输入区显示差异"
            onChange={(checked) => updateOption('showDiffInEditors', checked)}
          />
        ) : null}
        {visibleControls.showEditorLineNumbers ? (
          <Toggle
            checked={options.showEditorLineNumbers}
            label="显示行号"
            onChange={(checked) => updateOption('showEditorLineNumbers', checked)}
          />
        ) : null}
        {visibleControls.enableEditorFolding ? (
          <Toggle
            checked={options.enableEditorFolding}
            label="内容折叠"
            onChange={(checked) => updateOption('enableEditorFolding', checked)}
          />
        ) : null}
        {visibleControls.onlyChanges ? (
          <Toggle
            checked={options.onlyChanges}
            label="只看差异"
            onChange={(checked) => updateOption('onlyChanges', checked)}
          />
        ) : null}

        {visibleControls.arrayKey ? (
          <label className="text-field compact">
            <span>数组主键</span>
            <input
              value={options.arrayKey}
              onChange={(event) => updateOption('arrayKey', event.target.value)}
              placeholder="id"
            />
          </label>
        ) : null}
        {visibleControls.csvKey ? (
          <label className="text-field compact">
            <span>表格主键</span>
            <input
              value={options.csvKey}
              onChange={(event) => updateOption('csvKey', event.target.value)}
              placeholder="id"
            />
          </label>
        ) : null}
        {visibleControls.ignoredPaths ? (
          <label className="text-field wide">
            <span>忽略路径</span>
            <input
              value={options.ignoredPaths.join(', ')}
              onChange={(event) =>
                updateOption(
                  'ignoredPaths',
                  event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
              placeholder="timestamp, $.meta.*"
            />
          </label>
        ) : null}
      </section>

      <section className="stats-band" aria-label="stats">
        <Metric label="格式" value={result.label} icon={iconForMode(result.mode)} />
        <Metric label="差异" value={String(result.stats.total)} />
        <Metric label="新增" value={String(result.stats.added)} tone="added" />
        <Metric label="删除" value={String(result.stats.removed)} tone="removed" />
        <Metric label="修改" value={String(result.stats.modified)} tone="modified" />
        {message ? <div className="message">{message}</div> : null}
      </section>

      <section
        className={`workspace ${navigatorOpen ? 'navigator-open' : 'navigator-collapsed'}`}
        style={workspaceStyle}
      >
        <div className="editors" ref={editorsRef} style={editorsStyle}>
          <EditorPane
            title="左侧"
            side="left"
            value={left}
            otherValue={right}
            result={result}
            options={options}
            detection={`${result.leftDetection.label}${result.leftDetection.error ? ' 解析失败' : ''}`}
            error={result.leftDetection.error}
            inputRef={leftInputRef}
            editorRef={leftEditorRef}
            onChange={setLeft}
            onFile={(files) => loadFiles('left', files)}
            onEditorScroll={handleEditorScroll}
          />
          <div className="between-tools">
            <label
              className={`sync-scroll-toggle ${syncScroll ? 'active' : ''}`}
              title="同时滚动"
            >
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setSyncScroll(enabled);
                  trackEvent('sync_scroll_changed', { enabled });
                }}
              />
              <span>
                <Link2 size={16} />
              </span>
            </label>
            <button
              type="button"
              className="square-button"
              title="交换左右内容"
              onClick={() => {
                setLeft(right);
                setRight(left);
                trackEvent('inputs_swapped');
              }}
            >
              <ArrowLeftRight size={18} />
            </button>
            <button
              type="button"
              className="editor-resize-handle"
              title="拖拽调整左右输入区宽度，双击恢复均分"
              aria-label="调整左右输入区宽度"
              aria-valuemin={28}
              aria-valuemax={72}
              aria-valuenow={Math.round(editorSplit)}
              role="separator"
              onPointerDown={startEditorResize}
              onPointerMove={moveEditorResize}
              onDoubleClick={() => setEditorSplit(50)}
            >
              <GripVertical size={18} />
            </button>
            <button type="button" className="square-button" title="格式化输入" onClick={formatInputs}>
              <Wand2 size={18} />
            </button>
            <button
              type="button"
              className="square-button"
              title="清空"
              onClick={() => {
                setLeft('');
                setRight('');
                trackEvent('input_cleared');
              }}
            >
              <Eraser size={18} />
            </button>
          </div>
          <EditorPane
            title="右侧"
            side="right"
            value={right}
            otherValue={left}
            result={result}
            options={options}
            detection={`${result.rightDetection.label}${result.rightDetection.error ? ' 解析失败' : ''}`}
            error={result.rightDetection.error}
            inputRef={rightInputRef}
            editorRef={rightEditorRef}
            onChange={setRight}
            onFile={(files) => loadFiles('right', files)}
            onEditorScroll={handleEditorScroll}
          />
        </div>

        <aside className={`navigator ${navigatorOpen ? '' : 'collapsed'}`} aria-expanded={navigatorOpen}>
          <div className="panel-title">
            <button
              type="button"
              className="square-button navigator-toggle"
              title={navigatorOpen ? '收起差异项' : '展开差异项'}
              onClick={() => {
                setNavigatorOpen((current) => !current);
                trackEvent('navigator_drawer_toggled', { open: !navigatorOpen });
              }}
            >
              {navigatorOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
            {navigatorOpen ? <h2>差异项</h2> : null}
          </div>
          {navigatorOpen ? (
            <DiffNavigator
              items={result.items}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : null}
        </aside>
      </section>

      <section className="result-panel">
        <div className="result-header">
          <div>
            <h2>对比结果</h2>
            {result.notice ? <p>{result.notice}</p> : <p>内容本地处理，不上传</p>}
          </div>
          <div className="result-actions">
            <button type="button" className="icon-button" onClick={loadJsonSample}>
              <Braces size={17} />
              <span>JSON 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadCsvSample}>
              <Table2 size={17} />
              <span>CSV 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadCookieSample}>
              <CookieIcon size={17} />
              <span>Cookie 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadMarkdownSample}>
              <FileText size={17} />
              <span>Markdown 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadTomlSample}>
              <Braces size={17} />
              <span>TOML 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadCurlSample}>
              <Terminal size={17} />
              <span>cURL 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={loadHttpRequestSample}>
              <FileText size={17} />
              <span>HTTP 示例</span>
            </button>
            <button type="button" className="icon-button" onClick={copyDiffSummary}>
              <Copy size={17} />
              <span>复制摘要</span>
            </button>
            <button type="button" className="icon-button" onClick={downloadSummary}>
              <Download size={17} />
              <span>导出</span>
            </button>
          </div>
        </div>

        {result.stats.total === 0 ? (
          <div className="empty-state">没有检测到差异</div>
        ) : result.mode === 'text' ? (
          <TextDiffTable
            rows={result.textRows}
            highlightInlineChanges={options.highlightInlineChanges}
            abbreviateLongValues={options.abbreviateLongValues}
          />
        ) : (
          <StructuredDiffTable
            result={result}
            selectedId={selectedId}
            highlightInlineChanges={options.highlightInlineChanges}
            abbreviateLongValues={options.abbreviateLongValues}
            onSelect={setSelectedId}
          />
        )}
      </section>
    </main>
  );
}

function controlsForResult(result: CompareResult, options: DiffOptions): VisibleControls {
  const structured = result.mode === 'structured';
  const table = result.mode === 'table';
  const text = result.mode === 'text';

  return {
    ignoreWhitespace: true,
    ignoreCase: true,
    ignoreKeyOrder: structured,
    highlightInlineChanges: true,
    abbreviateLongValues: true,
    showDiffInEditors: true,
    showEditorLineNumbers: true,
    enableEditorFolding:
      result.kind === 'json' ||
      result.kind === 'markdown' ||
      result.kind === 'http' ||
      options.showDiffInEditors,
    onlyChanges: text || options.showDiffInEditors,
    arrayKey: structured && ARRAY_KEY_FORMATS.has(result.kind),
    csvKey: table,
    ignoredPaths: structured || table
  };
}

function Toggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </label>
  );
}

function Metric({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: DiffType;
}) {
  return (
    <div className={`metric ${tone ?? ''}`}>
      {icon ? <div className="metric-icon">{icon}</div> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EditorPane({
  title,
  side,
  value,
  otherValue,
  result,
  options,
  detection,
  error,
  inputRef,
  editorRef,
  onChange,
  onFile,
  onEditorScroll
}: {
  title: string;
  side: 'left' | 'right';
  value: string;
  otherValue: string;
  result: CompareResult;
  options: DiffOptions;
  detection: string;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  editorRef: RefObject<CodeDiffEditorHandle | null>;
  onChange: (value: string) => void;
  onFile: (files: FileList | null) => void;
  onEditorScroll: (side: 'left' | 'right', metrics: EditorScrollMetrics) => void;
}) {
  return (
    <section
      className="editor-pane"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFile(event.dataTransfer.files);
      }}
    >
      <div className="editor-title">
        <div>
          <h2>{title}</h2>
          <p className={error ? 'status error' : 'status'}>{error ?? detection}</p>
        </div>
        <button type="button" className="square-button" title="导入文件" onClick={() => inputRef.current?.click()}>
          <Upload size={17} />
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden-input"
          onChange={(event) => onFile(event.target.files)}
        />
      </div>
      <CodeDiffEditor
        ref={editorRef}
        value={value}
        otherValue={otherValue}
        side={side}
        format={side === 'left' ? result.leftDetection.kind : result.rightDetection.kind}
        otherFormat={side === 'left' ? result.rightDetection.kind : result.leftDetection.kind}
        options={options}
        onChange={onChange}
        onScroll={onEditorScroll}
      />
    </section>
  );
}

function DiffNavigator({
  items,
  selectedId,
  onSelect
}: {
  items: DiffItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="nav-empty">无差异</div>;
  }

  return (
    <div className="diff-nav-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-item ${item.type} ${selectedId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <span>{TYPE_LABEL[item.type]}</span>
          <strong>{item.path}</strong>
        </button>
      ))}
    </div>
  );
}

function StructuredDiffTable({
  result,
  selectedId,
  highlightInlineChanges,
  abbreviateLongValues,
  onSelect
}: {
  result: CompareResult;
  selectedId: string;
  highlightInlineChanges: boolean;
  abbreviateLongValues: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="structured-table" role="table">
      <div className="structured-row header" role="row">
        <div role="columnheader">类型</div>
        <div role="columnheader">路径</div>
        <div role="columnheader">左侧</div>
        <div role="columnheader">右侧</div>
      </div>
      {result.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`structured-row ${item.type} ${selectedId === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          role="row"
        >
          <div role="cell">
            <span className={`type-pill ${item.type}`}>{TYPE_LABEL[item.type]}</span>
          </div>
          <code role="cell">{item.path}</code>
          <DiffValueCell
            item={item}
            side="left"
            highlightInlineChanges={highlightInlineChanges}
            abbreviateLongValues={abbreviateLongValues}
          />
          <DiffValueCell
            item={item}
            side="right"
            highlightInlineChanges={highlightInlineChanges}
            abbreviateLongValues={abbreviateLongValues}
          />
        </button>
      ))}
    </div>
  );
}

function DiffValueCell({
  item,
  side,
  highlightInlineChanges,
  abbreviateLongValues
}: {
  item: DiffItem;
  side: 'left' | 'right';
  highlightInlineChanges: boolean;
  abbreviateLongValues: boolean;
}) {
  const leftText = preview(item.leftValue, abbreviateLongValues);
  const rightText = preview(item.rightValue, abbreviateLongValues);
  const text = side === 'left' ? leftText : rightText;

  if (!highlightInlineChanges || item.type !== 'modified') {
    return <pre role="cell">{text}</pre>;
  }

  const inlineDiff = buildInlineDiff(leftText, rightText);
  const parts = side === 'left' ? inlineDiff.left : inlineDiff.right;

  return (
    <pre role="cell">
      <InlineParts parts={parts} />
    </pre>
  );
}

function InlineParts({ parts }: { parts: InlineDiffPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <span
          key={`${part.kind ?? 'equal'}-${index}`}
          className={part.changed ? `inline-diff ${part.kind ?? 'modified'}` : undefined}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}

function TextDiffTable({
  rows,
  highlightInlineChanges,
  abbreviateLongValues
}: {
  rows: TextDiffRow[];
  highlightInlineChanges: boolean;
  abbreviateLongValues: boolean;
}) {
  return (
    <div className="text-table" role="table">
      <div className="text-row header" role="row">
        <div role="columnheader">L</div>
        <div role="columnheader">左侧</div>
        <div role="columnheader">R</div>
        <div role="columnheader">右侧</div>
      </div>
      {rows.map((row) => (
        <div key={row.id} className={`text-row ${row.type}`} role="row">
          <div className="line-number" role="cell">
            {row.leftLine ?? ''}
          </div>
          <TextDiffValueCell
            row={row}
            side="left"
            highlightInlineChanges={highlightInlineChanges}
            abbreviateLongValues={abbreviateLongValues}
          />
          <div className="line-number" role="cell">
            {row.rightLine ?? ''}
          </div>
          <TextDiffValueCell
            row={row}
            side="right"
            highlightInlineChanges={highlightInlineChanges}
            abbreviateLongValues={abbreviateLongValues}
          />
        </div>
      ))}
    </div>
  );
}

function TextDiffValueCell({
  row,
  side,
  highlightInlineChanges,
  abbreviateLongValues
}: {
  row: TextDiffRow;
  side: 'left' | 'right';
  highlightInlineChanges: boolean;
  abbreviateLongValues: boolean;
}) {
  const leftText = formatTextCellValue(row.leftText, abbreviateLongValues);
  const rightText = formatTextCellValue(row.rightText, abbreviateLongValues);
  const text = side === 'left' ? leftText : rightText;

  if (
    !highlightInlineChanges ||
    row.type !== 'modified' ||
    row.leftText === undefined ||
    row.rightText === undefined
  ) {
    return <pre role="cell">{text}</pre>;
  }

  const inlineDiff = buildInlineDiff(leftText, rightText);
  const parts = side === 'left' ? inlineDiff.left : inlineDiff.right;

  return (
    <pre role="cell">
      <InlineParts parts={parts} />
    </pre>
  );
}

function formatTextCellValue(value: string | undefined, abbreviateLongValues: boolean): string {
  return value === undefined ? '' : preview(value, abbreviateLongValues);
}

function iconForMode(mode: CompareResult['mode']) {
  if (mode === 'table') return <Table2 size={16} />;
  if (mode === 'structured') return <Braces size={16} />;
  return <FileText size={16} />;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFileExtension(filename: string): string {
  const extension = filename.split('.').pop()?.trim().toLowerCase();
  if (!extension || extension === filename.toLowerCase()) return 'none';
  return extension.slice(0, 16);
}

function bucketFileSize(bytes: number): string {
  if (bytes < 10 * 1024) return '0-10kb';
  if (bytes < 100 * 1024) return '10-100kb';
  if (bytes < 1024 * 1024) return '100kb-1mb';
  return '1mb-plus';
}
