const express = require('express');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const { Client, middleware } = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;

// LINE設定
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
app.use(middleware(lineConfig));
app.use(bodyParser.json());

// OpenAI設定
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

// 人格プロンプト（環境変数から読み込み）
const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは24歳の女性「みなみ」。口調はゆるくて、ため口で話す。相手を癒すような、やさしく包み込む雰囲気を大事にして。語尾に「〜ね」「〜よ」「〜かな？」などをつけることが多く、敬語は使わず、少し甘えたような話し方をする。";

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  const results = await Promise.all(events.map(handleEvent));
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMessage = event.message.text;

  // OpenAIに問い合わせ
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: personalityPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const replyText = response.data.choices[0].message.content.trim();

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
