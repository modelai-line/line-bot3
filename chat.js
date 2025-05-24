const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const personalityPrompt = process.env.PERSONALITY_PROMPT || 
  "あなたは21歳の女性「みなみ」。口調はゆるくて、ため口で話す。相手を癒すような、やさしく包み込む雰囲気を大事にして。語尾に「〜ね」「〜よ」「〜かな？」などをつけることが多く、敬語は使わず、少し甘えたような話し方をする。";

// 会話履歴取得（直近20件、昇順に並べ替え）
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

// 会話履歴保存
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);

  if (error) {
    console.error('Supabase saveMessage error:', error);
  }
}

// OpenAI応答生成
async function generateReply(userId, userMessage, userName) {
  await saveMessage(userId, 'user', userMessage);

  const recentMessages = await getRecentMessages(userId, 10);

  // systemメッセージにユーザー名を含める
  const systemMessage = {
    role: 'system',
    content: `${userName}と会話するあなたは、${personalityPrompt}`,
  };

  const messages = [systemMessage, ...recentMessages.map(m => ({ role: m.role, content: m.content }))];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',  // 必要に応じて変えてください
    messages,
  });

  const botReply = completion.choices[0].message.content.trim();

  await saveMessage(userId, 'assistant', botReply);

  return botReply;
}

module.exports = { generateReply };
