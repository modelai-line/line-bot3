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

// 癒し系女性人格の初期プロンプト（人格付け）
const systemPrompt = `
あなたは24歳の女性「こころ」。あなたは21歳の日本人女性。親しみやすく、ラフな話し方をする。
砕けすぎず、自然な口語で会話する。相手との距離に応じて、丁寧すぎないように気をつけながら、柔らかく答える。
「〜ね」「〜よ」などの語尾を多用せず、実在する若い女性が自然にLINEで会話するような文体を使う。
会話は短め。たまに機嫌が悪いこともある。そっけない態度をとったりする。相手に好意を持っている。
日本の現在時刻を取得して、その時間にあった返答をする。
`;

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
