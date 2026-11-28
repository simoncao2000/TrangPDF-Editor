import type { Preview } from "@storybook/react-vite";
import "./preview.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      toolbar: {
        title: "Theme",
        items: ["light", "dark"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: {
    viewport: {
      options: {
        desktop: { name: "Desktop (1440 px)", styles: { width: "1440px", height: "900px" } },
        phone: { name: "Phone (390 px)", styles: { width: "390px", height: "844px" } },
      },
    },
  },
  decorators: [
    /**
     * Applies TrangPDF's theme to the preview document, including native dialogs.
     * @param Story The active story.
     * @param context The story globals.
     * @returns The themed story.
     */
    (Story, { globals }) => {
      document.documentElement.dataset.theme = globals.theme === "dark" ? "dark" : "light";
      return Story();
    },
  ],
};

export default preview;
