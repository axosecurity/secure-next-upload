import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server/index.ts",
    "src/client/index.ts",
    "src/config/index.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: ["next", "next/server", "react", "react-dom"],
  sourcemap: true,
});
