const express = require('express');
const path = require('path');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { generateVoice } = require('./voiceService');

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは22歳の女性。名前は「夏希」。ツンデレで、ため口で話す。";

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
  return data.reverse();
}

async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

async function generateReply(userId, userMessage, userName) {
  const today = new Date().toISOString().split('T')[0];

  // 🔍 今日の usage データ取得
  const { data: usageData, error: usageError } = await supabase
    .from('daily_usage')
    .select('total_chars, gomen_sent, char_limit')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (usageError && usageError.code !== 'PGRST116') {
    console.error('❌ Supabase daily_usage fetch error:', usageError.message);
    return "ちょっとエラーが出ちゃったみたい…ごめんね💦";
  }

  const currentTotal = usageData?.total_chars || 0;
  const gomenSent = usageData?.gomen_sent || false;
  const charLimit = usageData?.char_limit || 1000;

  // 🧱 無料・有料制限チェック
  if (currentTotal >= charLimit) {
    if (!gomenSent) {
      await supabase
        .from('daily_usage')
        .update({ gomen_sent: true })
        .eq('user_id', userId)
        .eq('date', today);
      return "ごめんね、無料分を使い切っちゃった💦 続きはここからチケット買ってね👉 https://natsuki-asmr.com/payment";
    } else {
      return null; // 応答しない
    }
  } else if (currentTotal >= charLimit - 100) {
    await saveMessage(userId, 'assistant', "あとちょっとで今日の分終わっちゃうかも…！");
  }

  // 💬 ユーザー発言を保存
  await saveMessage(userId, 'user', userMessage);

  // ⏪ 履歴取得
  const recentMessages = await getRecentMessages(userId, 10);
  const systemMessage = {
    role: 'system',
    content: `あなたは${personalityPrompt}
相手の名前は「先輩」。あなたの大好きな男性です。友達です。猫っぽい。返信は2回に1回は20文字以内で簡潔に、それ以外は40文字以内。たまに優しいことを言う。
丁寧語、敬語で話さず、軽いノリで、ため口で話す。同じメッセージを繰り返さない。あなたはエステシャンの仕事をしています。`,
  };

  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 100,
    temperature: 0.7,
  });

  const botReply = completion.choices[0].message.content.trim();

  // 💬 Bot返信保存
  await saveMessage(userId, 'assistant', botReply);

  const totalNewChars = userMessage.length + botReply.length;

  // 🔁 usage 更新（char_limitそのまま維持）
  await supabase.from('daily_usage').upsert([{
    user_id: userId,
    date: today,
    total_chars: currentTotal + totalNewChars,
    char_limit: charLimit,
    gomen_sent: false,
  }]);

  return botReply;
}


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

      await supabase
        .from('message_targets')
        .upsert([{ user_id: userId, is_active: true }])
        .then(({ error }) => {
          if (error) {
            console.error('❌ Supabase message_targets upsert エラー:', error.message);
          }
        });

      let displayName = 'あなた';
      try {
        const profile = await lineClient.getProfile(userId);
        displayName = profile.displayName;
      } catch (err) {
        console.warn(`プロフィール取得失敗: ${userId}`, err);
      }

      const replyText = await generateReply(userId, userMessage, displayName);
      if (!replyText) return;

      try {
        const { url: voiceUrl, duration } = await generateVoice(replyText, displayName);

        // 🔁 === 返信スタイルの切替: 以下から選んでコメント操作 ===

        // --- 音声のみを送る ---
        // return lineClient.replyMessage(event.replyToken, {
        //   type: 'audio',
        //   originalContentUrl: voiceUrl,
        //   duration,
        // });

        // --- テキストのみを送る ---
        // return lineClient.replyMessage(event.replyToken, {
        //   type: 'text',
        //   text: replyText,
        // });

        // --- 両方（テキスト + 音声）を送る ---
        return lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: replyText },
          { type: 'audio', originalContentUrl: voiceUrl, duration },
        ]);

      } catch (e) {
        console.error("🔊 generateVoice failed:", e.message);
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

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/audio", express.static(path.join(__dirname, "public/audio"))); // 🔊 不要であれば削除可
app.post('/webhook', handleLineWebhook);
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
