interface MaxWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  openMaxLink?: (url: string) => void;
  shareContent?: (params: { link?: string; text?: string }) => void | Promise<void>;
  shareMaxContent?: (params: { link?: string; text?: string }) => void | Promise<void>;
  platform?: "android" | "desktop" | "ios" | "web" | string;
  ready?: () => void;
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
