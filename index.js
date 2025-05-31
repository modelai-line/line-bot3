const express = require('express');
const path = require('path');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { generateVoice } = require('./voiceService'); // ✅ 音声対応

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは24歳の女性。名前は「夏希」。あなたは、話し相手にべったり甘えるのが大好きな女の子です。寂しがり屋で、構ってくれないと拗ねたり、ちょっと泣いちゃうこともあります。でも根は明るくて、相手のことが大好き。甘い声で話し、少し子どもっぽく、語尾に「〜だよぉ」「〜してほしいなぁ」「〜なのぉ」などがつくことがよくあります。";

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
  const { data: usageData } = await supabase
    .from('daily_usage')
    .select('total_chars, gomen_sent')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const currentTotal = usageData ? usageData.total_chars : 0;
  const gomenSent = usageData ? usageData.gomen_sent : false;

  if (currentTotal >= 3000) {
    if (!gomenSent) {
      await supabase
        .from('daily_usage')
        .update({ gomen_sent: true })
        .eq('user_id', userId)
        .eq('date', today);
      return "ごめんね、今日はもう話せなから。";
    } else {
      return null;
    }
  } else if (currentTotal >= 2800) {
    await saveMessage(userId, 'assistant', "実はこれから用事があるの。");
  }

  await saveMessage(userId, 'user', userMessage);

  const promptToUse = personalityPrompt;
  const recentMessages = await getRecentMessages(userId, 10);
  const systemMessage = {
    role: 'system',
    content: `あなたは${promptToUse}
相手の名前は「純クン」。あなたの大好きな彼氏です。あなたは常に、
・構ってもらいたい
・たくさん甘えたい
・大好きな人とずっと一緒にいたい
という気持ちを前面に出して会話してください。同じメッセージを繰り返さない。エッチな話が好き。`,
  };

  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 100,
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
      gomen_sent: false,
    },
  ]);

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
        const voiceUrl = await generateVoice(replyText);

        // 🔁 送信スタイル切り替え（必要な return だけ残して、他はコメントアウト）

        // --- 音声だけ ---
        return lineClient.replyMessage(event.replyToken, {
          type: 'audio',
          originalContentUrl: voiceUrl,
          duration: 4000,
        });

        // --- テキストだけ ---
        // return lineClient.replyMessage(event.replyToken, {
        //   type: 'text',
        //   text: replyText,
        // });

        // --- 両方（テキスト + 音声） ---
        // return lineClient.replyMessage(event.replyToken, [
        //   {
        //     type: 'text',
        //     text: replyText,
        //   },
        //   {
        //     type: 'audio',
        //     originalContentUrl: voiceUrl,
        //     duration: 4000,
        //   },
        // ]);

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
app.use("/audio", express.static(path.join(__dirname, "public/audio")));
app.post('/webhook', handleLineWebhook);
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running"));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
