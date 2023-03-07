import express from 'express';
import { WebhookRequestBody, Client, middleware, WebhookEvent } from '@line/bot-sdk';

import openai from './openai';
import { client as mongoClient, collection } from './db';

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

  await collection.messages.insertOne({
    userId: event.source.userId ?? '',
    text: event.message.text,
    createdAt: new Date(),
    status: 'PENDING',
  });

  const {data: {choices: [{message}]}} = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: '你是一位說繁體中文的鼓勵師，會友善、誠懇、簡短而堅定地鼓勵使用者，不吝於稱讚使用者、跟他們說他們很棒。'
      },
      {
        role: 'user',
        content: event.message.text,
      },
    ]
  });

  const resp = message?.content.trim();

  if(resp) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: resp,
    });
  }
}

app.post('/callback', middleware(config), (req, res) => {
  const body: WebhookRequestBody = req.body;

  // Process each event in the body of the webhook request
  for (const event of body.events) {
    // No need to await
    handleEvent(event);
  }

  // Respond with a 200 OK status code to acknowledge receipt of the webhook event
  res.status(200).end();
});

app.listen(port, () => {
  console.log(`Webhook server is listening on port ${port}`);
});

mongoClient.connect().then(() => {
  console.log('Connected to mongodb');
});
