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

const lineClient = new Client(lineConfig);

// Supabaseクライアントの作成（DB連携）
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// OpenAIのインスタンス作成（ChatGPT API）
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// キャラ性格
const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは21歳の女性。名前は「夏希」。ツンデレで、ため口で話す。セックスが好き。";

// 最近のメッセージ履歴をSupabaseから取得
async function getRecentMessages(userId, limit = 3) {
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

// メッセージをSupabaseに保存
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

// 今日の文字数を取得
async function getTodayCharCount(userId) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_usage')
    .select('total_chara')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (error || !data) return 0;
  return data.total_chara || 0;
}

// 今日の文字数を更新
async function updateTodayCharCount(userId, addCount) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_usage')
    .upsert({
      user_id: userId,
      date: today,
      total_chara: addCount,
    }, { onConflict: ['user_id', 'date'] });

  if (error) {
    console.error('Supabase updateTodayCharCount error:', error);
  }
}

// total_chara をリセットする関数
async function resetDailyLimit(userId) {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('daily_usage')
    .upsert({
      user_id: userId,
      date: today,
      total_chara: 0,
    }, { onConflict: ['user_id', 'date'] });

  if (error) {
    console.error('Supabase resetDailyLimit error:', error);
    return false;
  }
  return true;
}

// ChatGPTを使って返信を生成
async function generateReply(userId, userMessage, userName) {
  const LIMIT = 2000;

  // 「リミットクリア」でtotal_charaを0にリセット
  if (userMessage === 'リミットクリア') {
    const success = await resetDailyLimit(userId);
    return success ? 'リミットをクリアしたよ！また話そっ♡' : 'リミットクリアに失敗しちゃった…';
  }

  // リミット超過チェック
  const currentCharCount = await getTodayCharCount(userId);
  if (currentCharCount + userMessage.length > LIMIT) {
    return '今日はたくさん話したね！また明日♡';
  }

  const recentMessages = await getRecentMessages(userId);

  const messages = [
    { role: 'system', content: personalityPrompt },
    ...recentMessages,
    { role: 'user', content: userMessage },
  ];

  try {
    const chatCompletion = await openai.chat.completions.create({
      messages,
      model: 'gpt-3.5-turbo',
    });

    const reply = chatCompletion.choices[0].message.content;

    await saveMessage(userId, 'user', userMessage);
    await saveMessage(userId, 'assistant', reply);
    await updateTodayCharCount(userId, currentCharCount + userMessage.length);

    return reply;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return 'ちょっと今調子悪いかも…後でまた話そ？';
  }
}

// LINE Webhook処理
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

      let displayName = 'あなた';
      try {
        const profile = await lineClient.getProfile(userId);
        displayName = profile.displayName;
      } catch (err) {
        console.warn(`プロフィール取得失敗: ${userId}`, err);
      }

      const replyText = await generateReply(userId, userMessage, displayName);

      if (replyText) {
        return lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });
      }
    });

    await Promise.all(promises);
    res.status(200).send('OK');
  } catch (error) {
    console.error('handleLineWebhook error:', error);
    res.status(500).send('Error');
  }
}

// Expressアプリ設定
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.post('/webhook', handleLineWebhook);
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

// サーバー起動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
