import { MongoClient } from 'mongodb';

export const client = new MongoClient(process.env.MONGODB_URI ?? '');
const db = client.db();

export type Message = {
  /** Chatbot user ID */
  userId: string;

  /** User's input text */
  text: string;

  /** Message create date */
  createdAt: Date;

  /** Chatbot response in string */
  response?: string;

  /**
   * Pending: calculating reply.
   * Replied: the chatbot has replied with generated text.
   * Superseded: the user inputs new messages before response, thus the reply is not sent to user.
   * Error: other issue
   */
  status: 'PENDING' | 'REPLIED' | 'SUPERSEDED' | 'ERROR';

  /** The last update time of the message */
  updatedAt?: Date;

  /** If preset, the message is selected to be compressed. */
  compressionStartedAt?: Date;
}

export const collection = {
  messages: db.collection<Message>('messages'),
}
