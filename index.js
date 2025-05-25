// 必要なライブラリを読み込み
const express = require('express');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

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

// ユーザー名の保存ファイルのパスを設定
const userDataFile = path.join(__dirname, 'usernames.json');

// ユーザー名をロード（JSONファイルから）
let userNames = {};
try {
  userNames = JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
} catch {
  userNames = {};
}

// ユーザー名をファイルに保存する関数
function saveUserNames(data) {
  fs.writeFileSync(userDataFile, JSON.stringify(data, null, 2), 'utf8');
}

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
  await saveMessage(userId, 'user', userMessage); // ユーザーメッセージを保存

  // 個別に設定された性格プロンプトがあれば取得
  const { data: personalityData, error: personalityError } = await supabase
    .from('personality')
    .select('prompt')
    .eq('user_id', userId)
    .single();

  let promptToUse = personalityPrompt;
  if (!personalityError && personalityData && personalityData.prompt) {
    promptToUse = personalityData.prompt;
  }

  // 最近のチャット履歴を取得（文脈として渡す）
  const recentMessages = await getRecentMessages(userId, 10);

  // システムメッセージにキャラ設定と「短めに話すように」指示
  const systemMessage = {
  role: 'system',
  content: `${userName}と会話するあなたは、${promptToUse}。会話は自然体で、LINEでのやりとりのように短くてラフに返して。無駄な説明や丁寧すぎる言い回しは避けて、相手のテンポに合わせて返事して。必要なときだけ詳しく話してOK。`,
};

  // ChatGPTに渡す全メッセージを整形
  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];

  // ChatGPTにリクエスト（短く話すようmax_tokens制限）
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 50,      // 最大50トークンに制限（短く話す）
    temperature: 0.7,    // 返答のランダム度（創造性）
  });

  const botReply = completion.choices[0].message.content.trim(); // 返答取得

  await saveMessage(userId, 'assistant', botReply); // Botの返答を保存

  return botReply; // LINEへ返す用
}

// LINEのWebhookを処理する関数
async function handleLineWebhook(req, res) {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('No events'); // イベントなし
    }

    const promises = events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return; // テキスト以外は無視

      const userId = event.source.userId;
      const userMessage = event.message.text.trim();

      const savedName = userNames[userId];

      // 名前が未登録なら、名前を聞くフロー
      if (!savedName) {
        if (userNames[`${userId}_asked`]) {
          // 名前を受け取ったら登録
          userNames[userId] = userMessage;
          delete userNames[`${userId}_asked`];
          saveUserNames(userNames);

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `${userMessage}って呼ぶね。`,
          });
        } else {
          // 初回は名前を尋ねる
          userNames[`${userId}_asked`] = true;
          saveUserNames(userNames);

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ねぇ、あなたの名前教えてくれない？',
          });
        }
      }

      // 通常の会話処理
      const replyText = await generateReply(userId, userMessage, savedName);

      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText,
      });
    });

    await Promise.all(promises); // すべてのイベントを並列処理
    res.status(200).send('OK');
  } catch (error) {
    console.error('handleLineWebhook error:', error);
    res.status(500).send('Error');
  }
}

// Expressアプリの設定
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // JSONボディをパース
app.post('/webhook', handleLineWebhook); // LINE用Webhookエンドポイント
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running")); // 動作確認用

// サーバー起動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
