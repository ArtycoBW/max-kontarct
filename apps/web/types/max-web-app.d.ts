interface MaxWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  openMaxLink?: (url: string) => void | Promise<unknown>;
  openLink?: (url: string) => void | Promise<unknown>;
  downloadFile?: (url: string, filename: string) => Promise<unknown>;
  shareContent?: (params: { link?: string; text?: string }) => unknown | Promise<unknown>;
  shareMaxContent?: (params: { link?: string; text?: string }) => unknown | Promise<unknown>;
  platform?: "android" | "desktop" | "ios" | "web" | string;
  ready?: () => void;
  enableClosingConfirmation?: () => void;
  requestContact?: () => Promise<
    | {
        authDate: string;
        hash: string;
        phone: string;
      }
    | { error: { code: string } }
  >;
  version?: string;
}

interface Window {
  WebApp?: MaxWebApp;
}
