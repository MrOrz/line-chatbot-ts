import express from 'express';
import { WebhookRequestBody, Client, middleware } from '@line/bot-sdk';

const app = express();
const port = process.env.PORT || 5000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

const client = new Client(config);

app.post('/callback', middleware(config), async (req, res) => {
  const body: WebhookRequestBody = req.body;

  // Process each event in the body of the webhook request
  for (const event of body.events) {
    if (event.type === 'message' && event.message.type === 'text') {
      // Send a message echoing the user's message back to them
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: event.message.text,
      });
    }
  }

  // Respond with a 200 OK status code to acknowledge receipt of the webhook event
  res.status(200).end();
});

app.listen(port, () => {
  console.log(`Webhook server is listening on port ${port}`);
});
