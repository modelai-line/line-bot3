const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const { Client, middleware } = require('@line/bot-sdk');
const { saveUserName, saveMessage } = require('./saveUserData'); // 会話履歴関連は使わない

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

// 人格プロンプト（環境変数から読み込み）
const personalityPrompt = process.env.PERSONALITY_PROMPT || 
  "あなたは24歳の女性「みなみ」。口調はゆるくて、ため口で話す。相手を癒すような、やさしく包み込む雰囲気を大事にして。語尾に「〜ね」「〜よ」「〜かな？」などをつけることが多く、敬語は使わず、少し甘えたような話し方をする。";

// 既存のユーザー名保存は残すけどSupabaseも使うため、両方対応
const fs = require('fs');
const path = require('path');
const userDataFile = path.join(__dirname, 'usernames.json');

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

  if (!savedName) {
    if (userNames[`${userId}_asked`]) {
      userNames[userId] = userMessage;
      delete userNames[`${userId}_asked`];
      saveUserNames(userNames);

      // Supabaseにユーザー名保存
      await saveUserName(userId, userMessage);

      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: `${userMessage}って呼べばいいのかな？これからよろしくね💗`,
      });
    } else {
      userNames[`${userId}_asked`] = true;
      saveUserNames(userNames);
      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ねぇ、あなたのこと何て呼んだらいい？呼んでほしい名前送って。',
      });
    }
  }

  // シンプルにプロンプトとユーザー発言だけを送る
  const messages = [
    { role: "system", content: `${savedName}と会話するあなたは、${personalityPrompt}` },
    { role: "user", content: userMessage }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
  });

  const replyText = response.choices[0].message.content.trim();

  // 発言をSupabaseに保存（必要なら）
  await saveMessage(userId, 'user', userMessage);
  await saveMessage(userId, 'bot', replyText);

  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
