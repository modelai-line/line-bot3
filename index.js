// 必要なライブラリを読み込み
const express = require('express');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// LINE Messaging APIの設定
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// LINEクライアントのインスタンス作成
const lineClient = new Client(lineConfig);

// Supabaseクライアントの作成（DB連携）
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// OpenAIのインスタンス作成（ChatGPT API）
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// デフォルトのキャラクター性格プロンプト（環境変数または固定文）
const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは21歳の女性「こころ」。口調はゆるくて、ため口で話す。";

// 最近のメッセージ履歴をSupabaseから取得
async function getRecentMessages(userId, limit = 5) {
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
  return data.reverse(); // 時系列を正順にする
}

// メッセージをSupabaseに保存
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

// ChatGPTを使って返信を生成
async function generateReply(userId, userMessage, userName) {
  const today = new Date().toISOString().split('T')[0];

  // 今日の使用量をチェック
  const { data: usageData, error: usageError } = await supabase
    .from('daily_usage')
    .select('total_chars')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const currentTotal = usageData ? usageData.total_chars : 0;

  // 上限チェック
  if (currentTotal >= 1000) {
    return "ごめんね、今日はもう話せないんだ。また明日ね、バイバイ🌙";
  } else if (currentTotal >= 800) {
    await saveMessage(userId, 'assistant', "実はこれから用事があるの。💭");
  }

  await saveMessage(userId, 'user', userMessage);

  const { data: personalityData } = await supabase
    .from('personality')
    .select('prompt')
    .eq('user_id', userId)
    .single();

  let promptToUse = personalityPrompt;
  if (personalityData?.prompt) {
    promptToUse = personalityData.prompt;
  }

  const recentMessages = await getRecentMessages(userId, 10);
  const systemMessage = {
  role: 'system',
  content: `あなたは${promptToUse}

  相手の名前は「${userName}」っていうんだ。仲良く、楽しくおしゃべりしてね。
  口調はゆるくて、ため口で。返答は短めでOKだよ。`,
};

  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 50,
    temperature: 0.7,
  });

  const botReply = completion.choices[0].message.content.trim();
  await saveMessage(userId, 'assistant', botReply);

  const totalNewChars = userMessage.length + botReply.length;
  await supabase.from('daily_usage').upsert([
    {
      user_id: userId,
      date: today,
      total_chars: currentTotal + totalNewChars,
    },
  ]);

  return botReply;
}

// LINEのWebhookを処理する関数
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

      // LINEのdisplayNameを取得
      let displayName = 'あなた';
      try {
        const profile = await lineClient.getProfile(userId);
        displayName = profile.displayName;
      } catch (err) {
        console.warn(`プロフィール取得失敗: ${userId}`, err);
      }

      const replyText = await generateReply(userId, userMessage, displayName);

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

// Expressアプリの設定
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.post('/webhook', handleLineWebhook);
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

// サーバー起動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
