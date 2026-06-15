import 'dotenv/config'
import OpenAI from 'openai'
import { createToolRegistry } from './tools'

const baseURL = process.env.LING_BASE_URL || process.env.LLM_BASE_URL || undefined
const apiKey = process.env.LING_API_KEY || process.env.LLM_API_KEY || undefined
const model = process.env.LING_MODEL || process.env.LLM_MODEL || 'gpt-4o'

const client = new OpenAI({ baseURL, apiKey })
const registry = createToolRegistry()

type Message = OpenAI.ChatCompletionMessageParam

const systemPrompt = `You are Ling, a coding assistant. You have access to tools to read, write, edit files, search code, and run commands. Use tools to accomplish tasks step by step.`

/**
 * Agent 主循环：接收用户消息，反复调用 LLM + 执行工具，直到模型给出最终回复。
 */
async function agentLoop(userMessage: string, history: Message[]) {
  history.push({ role: 'user', content: userMessage })

  for (let turn = 0; turn < 50; turn++) {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
      tools: registry.toOpenAITools(),
    })

    const message = response.choices[0].message
    history.push(message as Message)

    // 没有 tool_calls → 模型直接回复文本，结束
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? '(no response)'
    }

    // 有 tool_calls → 逐个执行
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== 'function') continue

      const name = toolCall.function.name
      let params: Record<string, unknown>
      try {
        params = JSON.parse(toolCall.function.arguments)
      } catch {
        params = {}
      }

      console.log(`  [tool] ${name}(${JSON.stringify(params).slice(0, 120)}…)`)

      let result: string
      try {
        result = await registry.execute(name, params)
      } catch (err) {
        result = `Error: ${(err as Error).message}`
      }

      // 关键：把工具结果传回给模型
      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      } as Message)
    }
  }

  return '(max turns reached)'
}

// ===== CLI Entry =====
const query = process.argv.slice(2).join(' ') || '读取 src/tools 目录，列出所有工具的名称和功能。'

const history: Message[] = []

agentLoop(query, history)
  .then((result) => {
    console.log('\n' + result)
  })
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })