const { defineConfig } = require("tsup");

export default defineConfig({
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["cjs", "esm"],
  minify: true,
});