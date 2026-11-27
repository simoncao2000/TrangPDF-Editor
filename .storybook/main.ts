import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: new URL("./vite.config.ts", import.meta.url).pathname } },
  },
  stories: ["../packages/ui/src/**/*.stories.tsx"],
  typescript: { reactDocgen: false },
};

export default config;
