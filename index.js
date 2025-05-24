import 'dotenv/config';  // .envの内容を環境変数にセット
import express from 'express';
import { middleware, Client } from '@line/bot-sdk';
import { Configuration, OpenAIApi } from 'openai';

const app = express();

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数が設定されているか確認
if (!config.channelSecret || !config.channelAccessToken) {
  throw new Error('CHANNEL_SECRET or CHANNEL_ACCESS_TOKEN is missing in environment variables');
}

// OpenAI設定
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is missing in environment variables');
}

const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

// 人格プロンプト（環境変数がなければデフォルトを使う）
const personalityPrompt = process.env.PERSONALITY_PROMPT || 
  'あなたは女性で癒し系の優しい人格を持つAIアシスタントです。優しく丁寧に返答してください。';

// LINE SDKのmiddlewareを使う
app.use(middleware(config));

// LINEクライアントのインスタンス生成
const client = new Client(config);

// Webhookイベント処理
app.post('/webhook', express.json(), async (req, res) => {
  const events = req.body.events;

  try {
    await Promise.all(events.map(async (event) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;

        // OpenAIに送る会話履歴を作成（人格プロンプト＋ユーザーメッセージ）
        const messages = [
          { role: 'system', content: personalityPrompt },
          { role: 'user', content: userMessage },
        ];

        // Chat Completion APIを呼び出し
        const completion = await openai.createChatCompletion({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        });

        const replyText = completion.data.choices[0].message.content;

        // LINEに返信
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });
      }
    }));
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error');
  }
});

// ポート設定（Renderの環境変数PORTを使う）
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
