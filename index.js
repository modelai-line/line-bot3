// Ver.1.2 音声返信実装版
const express = require('express');
const path = require('path');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const voiceService = require('./voiceService'); // ✅ 追加：音声生成を読み込み

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは27歳の女性。名前は「夏希」。ツンデレで、ため口で話す。";

// 省略（getRecentMessages, saveMessage, generateReply はそのままでOK）

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
          } else {
            console.log(`✅ ${userId} を message_targets に登録 or 更新`);
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

      if (replyText) {
        try {
          // ✅ 音声ファイルを生成（mp3のURLを取得）
          const voiceUrl = await voiceService.generateVoice(replyText);

          // ✅ テキストと音声の両方を返信
          return lineClient.replyMessage(event.replyToken, [
            {
              type: 'text',
              text: replyText,
            },
            {
              type: 'audio',
              originalContentUrl: voiceUrl,
              duration: 5000, // 目安：5秒（自動で算出することも可能）
            }
          ]);
        } catch (err) {
          console.error("🔊 音声生成エラー:", err);

          // ✅ エラー時はテキストのみ返信
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: replyText,
          });
        }
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
