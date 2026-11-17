import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import adapter from "@sveltejs/adapter-static";

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      // Static site for GitHub Pages; everything renders in the browser.
      adapter: adapter({ fallback: "404.html" }),
      paths: {
        // GitHub Pages serves the site under /<repository>/. CI sets BASE_PATH,
        // so a renamed repository keeps working without touching the code.
        base: (process.env.BASE_PATH ?? "") as "" | `/${string}`,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
