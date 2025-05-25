// 必要なモジュールの読み込み
const express = require('express');
const { Client } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config(); // .envファイルの読み込み

// LINEの設定（アクセストークンとシークレットを環境変数から取得）
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 各サービスのクライアント初期化
const lineClient = new Client(lineConfig);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// デフォルトの人格プロンプト（環境変数がなければこの文を使用）
const personalityPrompt = process.env.PERSONALITY_PROMPT || "あなたは21歳の女性「こころ」。口調はゆるくて、ため口で話す。";

// 一時的に「名前を聞いたかどうか」を記録するフラグ用オブジェクト（メモリ上のみ）
const nameRequestFlags = {};

// Supabaseからユーザー名を取得
async function getUserName(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_name')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null; // 見つからない、またはエラーがある場合
  }
  return data.user_name;
}

// Supabaseにユーザー名を保存
async function saveUserName(userId, userName) {
  const { error } = await supabase
    .from('user_profiles')
    .insert([{ user_id: userId, user_name: userName }]);

  if (error) {
    console.error('Supabase saveUserName error:', error);
  }
}

// 過去のメッセージ履歴を取得（新しい順に並べてから逆順にする）
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
  return data.reverse(); // 古い順に並べ直す
}

// チャットのメッセージを保存（ユーザー or AIの発言）
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);
  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

// OpenAIにリクエストして返答を生成
async function generateReply(userId, userMessage, userName) {
  await saveMessage(userId, 'user', userMessage); // ユーザーの発言を保存

  // ユーザーごとの人格プロンプトがあれば取得
  const { data: personalityData, error: personalityError } = await supabase
    .from('personality')
    .select('prompt')
    .eq('user_id', userId)
    .single();

  let promptToUse = personalityPrompt;
  if (!personalityError && personalityData && personalityData.prompt) {
    promptToUse = personalityData.prompt;
  }

  // 最近のメッセージ履歴を取得
  const recentMessages = await getRecentMessages(userId, 10);

  // システムメッセージ（人格・ルールの指定）
  const systemMessage = {
    role: 'system',
    content: `${userName}と会話するあなたは、${promptToUse}。回答はできるだけ端的で短くしてください。`,
  };

  // OpenAIへ送るメッセージ一覧（システム＋履歴）
  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];

  // OpenAIへAPIリクエスト
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 50,
    temperature: 0.7,
  });

  // AIの返答を取得してトリム
  const botReply = completion.choices[0].message.content.trim();

  await saveMessage(userId, 'assistant', botReply); // AIの返答を保存

  return botReply;
}

// LINEのWebhookハンドラ（ユーザーからのメッセージに反応）
async function handleLineWebhook(req, res) {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('No events'); // イベントがなければ終了
    }

    const promises = events.map(async (event) => {
      // テキストメッセージのみ処理対象
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const userId = event.source.userId;
      const userMessage = event.message.text.trim();

      const savedName = await getUserName(userId); // ユーザー名の取得

      if (!savedName) {
        // 名前を聞いた直後なら保存処理へ
        if (nameRequestFlags[userId]) {
          await saveUserName(userId, userMessage);
          delete nameRequestFlags[userId];

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `${userMessage}って呼ぶね。`, // 登録完了メッセージ
          });
        } else {
          // まだ名前を聞いていないなら質問する
          nameRequestFlags[userId] = true;

          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ねぇ、あなたの名前教えてくれない？', // 名前の入力をお願い
          });
        }
      }

      // ユーザー名が取得できた場合、返答を生成
      const replyText = await generateReply(userId, userMessage, savedName);

      return lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText, // 生成された返答をLINEへ送信
      });
    });

    await Promise.all(promises); // 並列処理をすべて待つ
    res.status(200).send('OK');
  } catch (error) {
    console.error('handleLineWebhook error:', error);
    res.status(500).send('Error'); // エラーハンドリング
  }
}

// Expressアプリの初期化とルーティング設定
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // JSONリクエストのパース
app.post('/webhook', handleLineWebhook); // Webhookエンドポイント
app.get("/", (req, res) => res.send("LINE ChatGPT Bot is running")); // テスト用のGETルート

// サーバーの起動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
