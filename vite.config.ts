import { defineConfig } from "vitest/config";

export default defineConfig({
  root: process.env.VITEST ? "." : "demo",
  test: {
    environment: "jsdom",
  },
  base: "/codemirror-ai/",
});
