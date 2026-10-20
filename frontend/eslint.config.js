import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Blueprint §10.2 / CLAUDE.md rule 2: no browser storage anywhere in src/.
const BANNED_IDENTIFIERS = 'localStorage|sessionStorage|indexedDB|caches'
const storageBan = [
  'error',
  {
    selector: `Identifier[name=/^(${BANNED_IDENTIFIERS})$/]`,
    message: 'Browser storage is banned (Blueprint §10.2): session lives in memory only.',
  },
  {
    selector: "MemberExpression[property.name='cookie']",
    message: 'Cookies are banned for clinical content (CLAUDE.md rule 2).',
  },
  {
    selector: "MemberExpression[property.name='serviceWorker']",
    message: 'Service workers are banned (Blueprint §10.2).',
  },
]

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage_ban.test.ts'],
    rules: { 'no-restricted-syntax': storageBan },
  },
)
