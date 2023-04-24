import { z } from 'zod'
import { ChatCompletionRequestMessage } from "openai";
import { Message, collection } from "./db";
import { WithId } from "mongodb";
import openai from "./openai";

/** If history text length exceeds this number, start compressing  */
const MAX_HISTORY_WORD_COUNT = 500;

/** Number of words to compress the history to */
const MAX_COMPRESSED_WORD_COUNT = 50;

/**
 * Number of replied conversations that do not compress.
 * These conversations are sent to ChatGPT without compression.
 */
const UNCOMPRESSD_CONVERSATION_COUNT = 1;

export function dbMessageToChatMessage(msg: Message): ChatCompletionRequestMessage[] {
  const messages: ChatCompletionRequestMessage[] = [{
    role: 'user',
    content: msg.text,
  }];

  // If response is shown to the user, add response
  if(msg.response && msg.status === 'REPLIED') messages.push({
    role: 'assistant',
    content: msg.response,
  });

  return messages;
}

const CompressedResponseSchema = z.array(
  z.object({user: z.string(), assistant: z.string()})
);

export async function compressMessagesIfNecessary(prevMessages: WithId<Message>[]) {
  // Skip if compression is on the way
  if(prevMessages.some(m => m.compressionStartedAt)) {
    return;
  }

  //
  /**
   * The index in prevMessages that marks the end of replied conversations.
   *
   * Ex:
   *   User: Hello?
   *   User: Any body here?
   *   assistant: Hi, I am assistant.
   * ^^^ The above count as 1 conversation.
   */
  const conversationEndIdx = prevMessages
    .map((message, idx) => ({message, idx}))
    .filter(({message: {status, response}}) => status === 'REPLIED' && !!response)
    .map(({idx}) => idx);

    // Don't compress the conversations that are too short.
  if(conversationEndIdx.length <= UNCOMPRESSD_CONVERSATION_COUNT) return;
  const lastConversationIdx = conversationEndIdx[conversationEndIdx.length - UNCOMPRESSD_CONVERSATION_COUNT - 1];

  const messagesToCompress = prevMessages.slice(0, lastConversationIdx + 1);
  const chatMessagesToCompress = messagesToCompress.flatMap(dbMessageToChatMessage);

  const words = chatMessagesToCompress.reduce((sum, message) =>
    sum + message.content.length,
    0
  );

  // Skip if history words are not long enough
  if(words <= MAX_HISTORY_WORD_COUNT) {
    return;
  }

  const chatMessageIds = messagesToCompress.map(({_id}) => _id);
  console.log(`Compressing ${words} words of history for:`, chatMessageIds);

  // Mark the messages to being compressed
  await collection.messages.updateMany({
    _id: {$in: chatMessageIds}
  }, {
    $set: { compressionStartedAt: new Date() }
  });

  const {data: {choices: [{message}]}} = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      ...chatMessagesToCompress,
      {
        role: 'user',
        content: `
請縮短並改寫以上對話紀錄，使總字數不超過${MAX_COMPRESSED_WORD_COUNT}字。輸出的對話應是一合法 JSON 陣列，格式如下所示，JSON 陣列中可包含回傳一至多個對話。除 JSON 之外，不要輸出解釋。

[{"user": "{{User 的對話摘要}}", "assistant": "{{Assistant 的對話摘要}}"}]
        `,
      }
    ]
  });

  const resp = message?.content.trim();
  console.log('Compressed', {from: chatMessagesToCompress, to: resp});

  const lastMessageToCompress = messagesToCompress[messagesToCompress.length - 1];

  try {
    if(!resp) throw new Error('Compression response empty');
    const conversations = CompressedResponseSchema.parse(JSON.parse(resp));

    // Replace historic chat messages with the compressed ones
    //
    await collection.messages.insertMany(
      conversations.map(({user,assistant}) => ({
        userId: lastMessageToCompress.userId,
        text: user,
        response: assistant,
        status: 'REPLIED',
        createdAt: lastMessageToCompress.createdAt,
        updatedAt: lastMessageToCompress.updatedAt,
      }))
    );
    await collection.messages.deleteMany({ id: {$in: chatMessageIds} });
  } catch(e) {
    console.error('Error parsing compression response', e);
    // Reset summarizing flag
    //
    await collection.messages.updateMany({
      _id: {$in: chatMessageIds}
    }, {
      $unset: { compressionStartedAt: '' }
    });
  }
}
