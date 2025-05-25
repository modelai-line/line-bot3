const express = require('express');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// --- LINE設定 ---
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);

// --- Supabase & OpenAI 初期化 ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT ||
  "あなたは21歳の女性「こころ」。口調はゆるくて、ため口で話す。";

// --- ユーザー名管理 ---
const userDataFile = path.join(__dirname, 'usernames.json');
let userNames = {};
try {
  userNames = JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
} catch {
  userNames = {};
}
function saveUserNames(data) {
  fs.writeFileSync(userDataFile, JSON.stringify(data, null, 2), 'utf8');
}

// --- Supabase 会話履歴取得 ---
async function getRecentMessages(userId, limit = 20) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Supabase getRecentMessages error:', error);
    return [];
  }

  return data.reverse();
}

// --- Supabase 会話履歴保存 ---
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);

  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

// --- OpenAI 応答生成 ---
async function generateReply(userId, userMessage, userName) {
  await saveMessage(userId, 'user', userMessage);

  // personalityテーブルからユーザーごとのプロンプトを取得
  const { data: personalityData, error: personalityError } = await supabase
    .from('personality')
    .select('prompt')
    .eq('user_id', userId)
    .single();

  let promptToUse = personalityPrompt; // デフォルト
  if (!personalityError && personalityData && personalityData.prompt) {
    promptToUse = personalityData.prompt;
  }

  const recentMessages = await getRecentMessages(userId, 10);

  const systemMessage = {
    role: 'system',
    content: `${userName}と会話するあなたは、${promptToUse}`,
  };

  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5',
    messages,
  });

  const botReply = completion.choices[0].message.content.trim();

  await saveMessage(userId, 'assistant', botReply);

  return botReply;
}

// --- LINE Webhook処理 ---
async function handleLineWebhook(req, res) {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('No events');
    }

    const promises = events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const userId = event.source.userId;
      const userMessage = event.message.text.trim();

      const savedName = userNames[userId];

      if (!savedName) {
        if (userNames[`${userId}_asked`]) {
          userNames[userId] = userMessage;
          delete userNames[`${userId}_asked`];
          saveUserNames(userNames);

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `${userMessage}って呼べばいいのかな？これからよろしくね💗`,
          });
        } else {
          userNames[`${userId}_asked`] = true;
          saveUserNames(userNames);

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ねぇ、あなたの名前教えてくれない？🥺',
          });
        }
      }

      const replyText = await generateReply(userId, userMessage, savedName);

      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText,
      });
    });

    await Promise.all(promises);
    res.status(200).send('OK');
  } catch (error) {
    console.error('handleLineWebhook error:', error);
    res.status(500).send('Error');
  }
}

// --- Expressアプリ起動 ---
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post('/webhook', handleLineWebhook);
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
