// index.js
import 'dotenv/config';  // .envの内容を環境変数にセット
import express from 'express';
import { middleware, Client } from '@line/bot-sdk';

const app = express();

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数が設定されているか確認
if (!config.channelSecret || !config.channelAccessToken) {
  throw new Error('CHANNEL_SECRET or CHANNEL_ACCESS_TOKEN is missing in environment variables');
}

// LINE SDKのmiddlewareを使う
app.use(middleware(config));

// LINEクライアントのインスタンス生成
const client = new Client(config);

// 受け取ったWebhookイベントの処理例（簡単な返信）
app.post('/webhook', express.json(), (req, res) => {
  // LINEプラットフォームからのイベントを受け取る
  const events = req.body.events;

  // 全イベントを非同期で処理
  Promise.all(
    events.map(async (event) => {
      if (event.type === 'message' && event.message.type === 'text') {
        // 受け取ったテキストメッセージに対して同じテキストで返信する例
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `あなたは「${event.message.text}」と言いましたね！`,
        });
      }
      // 他のタイプのイベントは無視
      return Promise.resolve(null);
    })
  )
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error');
    });
});

// ポート設定（Renderの環境変数PORTを使う）
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
