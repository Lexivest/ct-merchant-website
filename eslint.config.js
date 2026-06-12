import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Keep ESLint's scope aligned with .gitignore: skip build output, Claude Code
  // worktrees/session data, the backup folder, and the sibling mobile-app
  // workspaces that live inside this repo but are not part of the web build.
  globalIgnores([
    'dist',
    '.claude',
    'Prod V1',
    'ctm_mobile_expo',
    'ctm_app_mobile',
    'ctm_mobile_react',
    'mobile_app',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
