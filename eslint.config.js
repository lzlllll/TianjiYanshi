import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dist-local', 'dist-standalone'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    /**
     * 这些文件处在「大模型返回值 / 本地存档 → 游戏数据」的边界上，需要对未受信的 JSON 与旧版存档逐字段兜底，
     * 因此保留了显式 any。要彻底去掉需要先补一套运行时类型守卫，暂不在这轮范围内，
     * 这里把 any 约束在这一层边界内，其余代码仍按推荐规则检查。
     */
    files: [
      'src/lib/aiClient.ts',
      'src/lib/dataOps.ts',
      'src/lib/promptBuilder.ts',
      'src/data/quests.ts',
      'src/store/useAIStore.ts',
      'src/store/useGameStore.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
