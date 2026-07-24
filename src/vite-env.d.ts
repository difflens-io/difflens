/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_BAIDU_SITE_ID?: string;
  readonly VITE_ANALYTICS_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
