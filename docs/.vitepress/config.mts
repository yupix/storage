import { defineConfig, UserConfig } from "vitepress";
import { withSidebar } from "vitepress-sidebar";

const vitePressOptions:UserConfig<any> = {
  title: "Storage Docs",
  description: "Google Driveもどきのドキュメント",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "概要", link: "/overview" },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/vuejs/vitepress" },
    ],
  },
    vite: {
      server: {
        allowedHosts: true
      }
    }
};

const vitePressSidebarOptions = {
  // VitePress Sidebar's options here...
  documentRootPath: "docs/",
  collapsed: false,
  capitalizeFirst: true,
};
// https://vitepress.dev/reference/site-config
export default defineConfig(
  withSidebar(vitePressOptions, vitePressSidebarOptions),
);
