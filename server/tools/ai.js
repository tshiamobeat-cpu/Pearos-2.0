const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';

export function aiStatus() {
  return {
    configured: Boolean(KEY),
    provider: 'openai-compatible',
    baseUrl: BASE_URL,
    model: MODEL,
    keyVariable: 'AI_API_KEY'
  };
}

const SYSTEM_PROMPT = `You are the SHADOW X cybersecurity assistant inside a defensive security platform.
Rules:
- Explain concepts, findings and remediations clearly and accurately. Use short sections and concrete steps.
- Help the user understand their own scan results and how to fix issues.
- Teach ethical hacking only in the context of authorized labs, your own systems, or written permission.
- Refuse requests for attacking third parties, credential theft, malware, ransomware, spyware, denial of service, auth bypass on systems without permission, or evading detection.
- Never invent scan data. If you do not have a finding, say what would need to be measured.
- Prefer defensive depth: prevention, detection, verification steps.
Answer in the user's language. Keep answers focused and under roughly 350 words unless a checklist was requested.`;

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function askAssistant({ messages, context }) {
  if (!KEY) {
    throw new AiError(
      'ai_not_configured',
      'The AI assistant is not configured. The platform owner must add an AI_API_KEY environment variable (Settings → Environment variables). No answer is generated until then — SHADOW X never fakes AI output.',
      503
    );
  }
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  if (!history.length) throw new AiError('empty_request', 'Send a question for the assistant.', 400);

  const contextBlock = context
    ? `\n\nAuthorized scan context supplied by the app (real data from this user's own scans):\n${JSON.stringify(context).slice(0, 4000)}`
    : '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 900,
        messages: [{ role: 'system', content: SYSTEM_PROMPT + contextBlock }, ...history]
      })
    });

    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 400);
      try {
        detail = JSON.parse(text)?.error?.message || detail;
      } catch {
        /* keep raw text */
      }
      throw new AiError(
        'ai_provider_error',
        `AI provider rejected the request (HTTP ${response.status}): ${detail}`,
        response.status === 401 || response.status === 429 ? response.status : 502
      );
    }

    const data = JSON.parse(text);
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new AiError('ai_empty_response', 'The AI provider returned an empty response.');
    return {
      reply,
      model: data.model || MODEL,
      provider: 'openai-compatible',
      usage: data.usage || null,
      source: 'live_ai_provider'
    };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err?.name === 'AbortError') throw new AiError('ai_timeout', 'The AI provider did not answer in time. Try a shorter question.');
    throw new AiError('ai_unreachable', `Could not reach the AI provider: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
