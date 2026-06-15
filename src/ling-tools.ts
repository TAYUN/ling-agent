import 'dotenv/config'
import OpenAI from 'openai'
import { createToolRegistry } from './tools'

const client = new OpenAI()
const model = 'gpt-5.4-mini'
const registry = createToolRegistry()
type Message = OpenAI.ChatCompletionMessageParam
const systemPromt = `You are Ling, a coding assistant. You have access to tools to read, write, edit files, search code, and run commands. Use tools to accomplish tasks step by step.`
async function agentLoop(userMessage: string, history: Message[]) {
  history.push({ role: 'user', content: userMessage })

  while (true) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPromt }],
      tools: registry.toOpenAITools()
    })
    const message = response.choices[0].message
    history.push(message as Message)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? '(no response)'
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== 'function') continue 
      const name = toolCall.function.name
      const params = JSON.parse(toolCall.function.arguments)
      console.log(`  [tool] <equation>{name}(</equation>{JSON.stringify(params).slice(0, 80)}...)`);

      let result: string

      try {
        result = await registry.execute(name, params)
      } catch (err) {
        result = `Error: ${(err as Error).message}`
      }
    }
  }
}