import "@total-typescript/ts-reset";
import express from 'express';
import { WebhookRequestBody, Client, middleware, WebhookEvent } from '@line/bot-sdk';

import openai from './openai';
import { client as mongoClient, collection } from './db';
import { ChatCompletionRequestMessage } from 'openai';

const app = express();
const port = process.env.PORT || 5000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

const client = new Client(config);

const HISTORY_LENGTH = 3;

async function handleEvent(event: WebhookEvent) {
  if (!(event.type === 'message' && event.message.type === 'text')) {
    return;
  }

  // Message is received, set status of pending messages to superseded
  await collection.messages.updateMany({
    userId: event.source.userId ?? '',
    status: 'PENDING'
  }, {
    $set: {status: 'SUPERSEDED'}
  });

  // Get history
  const prevMessages = (
    await collection.messages.find({userId: event.source.userId ?? ''})
      .sort({createdAt: -1}).limit(HISTORY_LENGTH).toArray()
  ).reverse();

  // Record user text in DB
  //
  const {insertedId: messageIdInDb} = await collection.messages.insertOne({
    userId: event.source.userId ?? '',
    text: event.message.text,
    createdAt: new Date(),
    status: 'PENDING',
  });

  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'system',
      content: '你是一位說繁體中文的鼓勵師，會友善、誠懇、簡短而堅定地鼓勵使用者，不吝於稱讚使用者、跟他們說他們很棒。'
    },
    ...prevMessages.flatMap(msg => {
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
    }),
    {
      role: 'user',
      content: event.message.text,
    },
  ];

  console.log('Input messages', {messages});
  try {

    const {data: {choices: [{message}]}} = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages
    });

    const resp = message?.content.trim();

    if(!resp) throw new Error('API return empty result');

    // Record response in DB
    // Only reply when message is pending.
    const { modifiedCount } = await collection.messages.updateOne(
      {_id: messageIdInDb, status: 'PENDING'},
      {$set: {updatedAt: new Date(), status: 'REPLIED', response: resp}}
    );

    if(modifiedCount !== 1) {
      console.log(`Message ${messageIdInDb} is already superseded, reply not written.`);
      return;
    }

    console.log(`Response written to: ${messageIdInDb}`);

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: resp,
    });

  } catch(e) {
    console.error('Response error', e);
    collection.messages.updateOne(
      {_id: messageIdInDb},
      {$set: {updatedAt: new Date(), status: 'ERROR', response: e.message}}
    );
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
