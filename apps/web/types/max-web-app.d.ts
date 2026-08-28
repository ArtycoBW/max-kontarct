interface MaxWebApp {
  initData: string;
  platform?: "android" | "desktop" | "ios" | "web" | string;
  version?: string;
}

interface Window {
  WebApp?: MaxWebApp;
}
