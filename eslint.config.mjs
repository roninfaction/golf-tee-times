import coreWebVitalsConfig from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", ".open-next/**", "node_modules/**"] },
  ...coreWebVitalsConfig,
  ...typescriptConfig,
];

export default eslintConfig;
