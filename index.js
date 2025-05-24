import express from 'express';
import { config } from 'dotenv';
import { OpenAI } from 'openai';
import line from '@line/bot-sdk';

config(); // .envファイルから環境変数を読み込む

// LINEの設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// OpenAIの設定（v4対応）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(express.json());
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events;
  if (!events.length) {
    return res.status(200).send('No events');
  }

  // 応答を非同期で処理
  const results = await Promise.all(events.map(handleEvent));
  res.status(200).json(results);
});

// ユーザーからのメッセージを処理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  // ChatGPTへ送信
  const chatResponse = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo', // または "gpt-4"
    messages: [{ role: 'user', content: userMessage }],
  });

  const replyText = chatResponse.choices[0].message.content;

  const client = new line.Client(lineConfig);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
