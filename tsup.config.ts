import { defineConfig } from "tsup";

export default defineConfig({
  target: ["node21"],
  entryPoints: ["./src/app.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  shims: true,
});
