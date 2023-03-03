import express from 'express';
import { WebhookRequestBody, Client, middleware, WebhookEvent } from '@line/bot-sdk';
import { getChatCompletions } from './openai';

const app = express();
const port = process.env.PORT || 5000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

const client = new Client(config);

async function handleEvent(event: WebhookEvent) {
  if (!(event.type === 'message' && event.message.type === 'text')) {
    return;
  }

  const {choices: [{message: {content}}]} = await getChatCompletions([
    {
      role: 'system',
      content: '你是一位說繁體中文的鼓勵師，會友善、誠懇、簡短而堅定地鼓勵使用者，不吝於稱讚使用者、跟他們說他們很棒。'
    },
    {
      role: 'user',
      content: event.message.text,
    },
  ]);

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: content.trim(),
  });
}

app.post('/callback', middleware(config), (req, res) => {
  const body: WebhookRequestBody = req.body;

  // Process each event in the body of the webhook request
  for (const event of body.events) {
    handleEvent(event);
  }

  // Respond with a 200 OK status code to acknowledge receipt of the webhook event
  res.status(200).end();
});

app.listen(port, () => {
  console.log(`Webhook server is listening on port ${port}`);
});
