const BAIDU_SITE_ID = import.meta.env.VITE_BAIDU_SITE_ID ?? '';
const TRACKED_HOSTS = new Set(parseList(import.meta.env.VITE_ANALYTICS_HOSTS ?? ''));

type GtagCommand = 'js' | 'config' | 'event';
type GtagArgs =
  | [GtagCommand, string | Date]
  | [GtagCommand, string, Record<string, unknown>];

declare global {
  interface Window {
    dataLayer?: GtagArgs[];
    gtag?: (...args: GtagArgs) => void;
    _hmt?: unknown[][];
  }
}

export type AnalyticsEventName =
  | 'app_loaded'
  | 'clipboard_compare'
  | 'copy_diff_summary'
  | 'download_summary'
  | 'file_import'
  | 'format_inputs'
  | 'format_mode_changed'
  | 'input_cleared'
  | 'inputs_swapped'
  | 'navigator_drawer_toggled'
  | 'open_source_link_clicked'
  | 'option_changed'
  | 'sample_loaded'
  | 'sync_scroll_changed';

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

let initialized = false;

export function initAnalytics(): void {
  if (
    initialized ||
    typeof window === 'undefined' ||
    !isTrackedHost() ||
    (!BAIDU_SITE_ID && typeof window.gtag !== 'function')
  ) {
    return;
  }

  initialized = true;
  trackEvent('app_loaded', { host: window.location.hostname });
  scheduleAnalyticsLoad(() => {
    loadBaiduAnalytics();
  });
}

export function trackEvent(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined' || !isTrackedHost()) return;

  const safeParams = sanitizeParams({
    ...params,
    debug_mode: isGaDebugMode() ? true : undefined
  });

  try {
    window.gtag?.('event', name, safeParams);
  } catch {
    // Analytics must never affect the diff tool.
  }

  try {
    window._hmt?.push(['_trackEvent', 'difflens', name, serializeBaiduLabel(safeParams)]);
  } catch {
    // Analytics must never affect the diff tool.
  }
}

function loadBaiduAnalytics(): void {
  if (!BAIDU_SITE_ID) return;

  try {
    window._hmt = window._hmt ?? [];
    injectScript(`https://hm.baidu.com/hm.js?${BAIDU_SITE_ID}`);
  } catch {
    // Analytics must never affect the diff tool.
  }
}

function scheduleAnalyticsLoad(callback: () => void): void {
  const run = () => window.setTimeout(callback, 1200);

  if (document.readyState === 'complete') {
    run();
    return;
  }

  window.addEventListener('load', run, { once: true });
}

function injectScript(src: string): void {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function sanitizeParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const entries: Array<[string, string | number | boolean]> = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    entries.push([sanitizeKey(key), sanitizeValue(value)]);
  }

  return Object.fromEntries(entries);
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
}

function sanitizeValue(value: string | number | boolean): string | number | boolean {
  if (typeof value !== 'string') return value;
  return value.replace(/[^\w .:/-]/g, '').slice(0, 80);
}

function serializeBaiduLabel(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(',');
}

function isGaDebugMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('ga_debug');
  } catch {
    return false;
  }
}

function isTrackedHost(): boolean {
  return TRACKED_HOSTS.size === 0 || TRACKED_HOSTS.has(window.location.hostname);
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
