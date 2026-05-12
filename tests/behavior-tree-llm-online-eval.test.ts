import { describe, expect, it } from 'vitest'
import {
  createOnlineEvalEngineConfigFromEnv,
  formatBehaviorTreeOnlineEvalReport,
  runBehaviorTreeOnlineEvalSuite,
} from '../src/battle-core/eval/behavior-tree-llm/online-eval'

const ONLINE_EVAL_TEST_TIMEOUT_MS = Number(process.env.BT_EVAL_TEST_TIMEOUT_MS || 600_000)

describe('behavior tree llm online eval', () => {
  it(
    'runs real-model eval for patch and initial prompts',
    async () => {
      const config = createOnlineEvalEngineConfigFromEnv(process.env)
      if (!config) {
        console.log('[bt-online-eval] skipped: set BT_EVAL_PROXY_URL or one of BT_EVAL_API_KEY/MINIMAX_API_KEY/DEEPSEEK_API_KEY')
        return
      }
      const expectedProvider = process.env.BT_EVAL_EXPECT_PROVIDER
      if (expectedProvider && config.provider !== expectedProvider) {
        throw new Error(
          `[bt-online-eval] provider mismatch: expected=${expectedProvider} actual=${config.provider}`
        )
      }
      console.log(
        `[bt-online-eval] using provider=${config.provider} model=${config.model || 'default'} route=${config.proxyUrl ? 'proxy' : 'direct'} baseUrl=${config.baseUrl || 'default'}`
      )
      const runs = Math.max(1, Number(process.env.BT_EVAL_RUNS || 3))
      const report = await runBehaviorTreeOnlineEvalSuite({ llmConfig: config, runs })
      console.log(formatBehaviorTreeOnlineEvalReport(report))

      const minRate = Number(process.env.BT_EVAL_MIN_HARD_PASS_RATE || 0)
      expect(report.aggregate.hardPassRate).toBeGreaterThanOrEqual(minRate)
    },
    ONLINE_EVAL_TEST_TIMEOUT_MS
  )
})
