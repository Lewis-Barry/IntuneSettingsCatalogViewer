import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...coreWebVitals,
  { ignores: ['.next/**', 'out/**', 'data/**', 'public/**'] },
];

export default config;
