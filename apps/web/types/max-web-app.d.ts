interface MaxWebApp {
  initData: string;
  platform?: "android" | "desktop" | "ios" | "web" | string;
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
