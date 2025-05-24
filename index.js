import 'dotenv/config';  // .envの内容を環境変数にセット
import express from 'express';
import { middleware, Client } from '@line/bot-sdk';
import { Configuration, OpenAIApi } from 'openai';

const app = express();

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数チェック
if (!config.channelSecret || !config.channelAccessToken) {
  throw new Error('CHANNEL_SECRET or CHANNEL_ACCESS_TOKEN is missing in environment variables');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is missing in environment variables');
}

// LINE SDKのmiddleware
app.use(middleware(config));

// LINEクライアントのインスタンス生成
const client = new Client(config);

// OpenAI設定
const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

//人格プロンプトはRenderの環境変数にて設定
const systemPrompt = process.env.BOT_PERSONALITY_PROMPT;
if (!systemPrompt) {
  throw new Error('環境変数 BOT_PERSONALITY_PROMPT が設定されていません');
}

async function getChatGPTReply(userText) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText },
  ];

  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-4o-mini', // GPT-4o-miniやgpt-4でもOK
      messages: messages,
      max_tokens: 150,
    });
    const reply = completion.data.choices[0].message.content.trim();
    return reply;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return 'ごめんなさい、今ちょっと調子が悪いみたいです。もう一度話しかけてくださいね。';
  }
}

app.post('/webhook', express.json(), async (req, res) => {
  const events = req.body.events;

  try {
    await Promise.all(events.map(async (event) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const aiReply = await getChatGPTReply(userMessage);

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: aiReply,
        });
      }
      return Promise.resolve(null);
    }));

    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
