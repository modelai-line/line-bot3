// ユーザーの名前を保存
const fs = require('fs');
const path = require('path');
const userDataFile = path.join(__dirname, 'usernames.json');

const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
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

// OpenAI設定（v4対応）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 人格プロンプト（環境変数から読み込み）この部分は保険　実際はRenderの環境変数に設定済
const personalityPrompt = process.env.PERSONALITY_PROMPT || 
  "あなたは24歳の女性「みなみ」。口調はゆるくて、ため口で話す。相手を癒すような、やさしく包み込む雰囲気を大事にして。語尾に「〜ね」「〜よ」「〜かな？」などをつけることが多く、敬語は使わず、少し甘えたような話し方をする。";

// ユーザー名読み込み／保存
function loadUserNames() {
  try {
    return JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUserNames(data) {
  fs.writeFileSync(userDataFile, JSON.stringify(data, null, 2), 'utf8');
}

let userNames = loadUserNames();

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  const results = await Promise.all(events.map(handleEvent));
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  const savedName = userNames[userId];

  // 名前がまだ登録されていない場合
  if (!savedName) {
    // すでに名前を聞いた後なら、そのメッセージを名前として保存
    if (userNames[`${userId}_asked`]) {
      userNames[userId] = userMessage;
      delete userNames[`${userId}_asked`];
      saveUserNames(userNames);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: `${userMessage}って呼べばいいのかな？これからよろしくね💗`,
      });
    } else {
      // まだ聞いてない → 聞く
      userNames[`${userId}_asked`] = true;
      saveUserNames(userNames);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ねぇ、あなたのこと何て呼んだらいい？呼んでほしい名前送って。',
      });
    }
  }

  // OpenAIに問い合わせ（名前あり）
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: `${savedName}と会話するあなたは、${personalityPrompt}`
      },
      {
        role: "user",
        content: userMessage
      },
    ],
  });

  const replyText = response.choices[0].message.content.trim();

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
