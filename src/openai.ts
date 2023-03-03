type Role = 'user' | 'system' | 'assistant';

type RequestMessage = {
  role: Role;
  content: string;
};

/**
 * @ref https://platform.openai.com/docs/guides/chat/introduction
 */
type ChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: {
    message: {
      role: Role;
      content: string;
    };
    finish_reason: string;
    index: number;
  }[];
}

export async function getChatCompletions(messages: ReadonlyArray<RequestMessage>): Promise<ChatCompletionResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
    })
  });

  if(!res.ok) throw new Error(`HTTP error ${res.status}: ${await res.text()}`);

  return res.json();
}