// Optional development validation; application runtime stays dependency-free.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = process.env.GHOSTTRACE_UI_TOOLS
  ? createRequire(path.join(path.resolve(process.env.GHOSTTRACE_UI_TOOLS), 'package.json')) : require;
const { ESLint } = load('eslint');
const css = load('css-tree');

(async () => {
  const globals = Object.fromEntries(['document', 'window', 'fetch', 'console', 'localStorage', 'matchMedia', 'Intl', 'Blob', 'URL', 'setTimeout'].map(key => [key, 'readonly']));
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
    files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'valid-typeof': 'error' },
  }] });
  const results = await eslint.lintFiles(['code/ui/app.js', 'code/ui/theme.js']);
  process.stdout.write(await (await eslint.loadFormatter('stylish')).format(results));
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
  console.log(`ESLint: ${errors} errors, ${warnings} warnings`);
  const issues = [];
  const ast = css.parse(fs.readFileSync(path.join(__dirname, '../ui/halloween.css'), 'utf8'));
  css.walk(ast, { visit: 'Declaration', enter(node) {
    if (node.property.startsWith('--')) return;
    const result = css.lexer.matchProperty(node.property, node.value);
    if (result.error && !css.generate(node.value).includes('var(')) {
      issues.push(`${node.property}: ${css.generate(node.value)}: ${result.error.message}`);
    }
  } });
  for (const issue of issues) console.error(issue);
  console.log(`CSS validation: ${issues.length} errors`);
  process.exitCode = errors || warnings || issues.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
