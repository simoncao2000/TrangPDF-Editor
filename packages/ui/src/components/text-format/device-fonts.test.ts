import { expect, it } from "bun:test";
import { requestDeviceFonts, requestedDeviceFonts } from "./device-fonts";

it("lists one row per family with a regular face first", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      queryLocalFonts: async () => [
        { family: "Example", postscriptName: "Example-Bold", style: "Bold", blob: async () => new Blob() },
        { family: "Example", postscriptName: "Example-Regular", style: "Regular", blob: async () => new Blob() },
        { family: "Other", postscriptName: "Other-Italic", style: "Italic", blob: async () => new Blob() },
      ],
    },
  });
  expect(requestedDeviceFonts()).toBeUndefined();
  expect(requestedDeviceFonts()).toBeUndefined();
  const fonts = await requestDeviceFonts();
  expect(fonts.map(({ name }) => name)).toEqual(["Example", "Other"]);
  expect(fonts[0]?.local?.kind).toBe("device");
});
