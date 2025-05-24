const supabase = require('./supabaseClient'); // 追加
const { generateReply } = require('./chat');
const { Client } = require('@line/bot-sdk');

const lineClient = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

// 🔽 名前を取得する関数
async function getUserName(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('name')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('getUserName error:', error);
    return null;
  }

  return data?.name || null;
}

// 🔽 名前を保存する関数
async function saveUserName(userId, name) {
  const { error } = await supabase
    .from('users')
    .upsert([{ user_id: userId, name: name }], { onConflict: 'user_id' });

  if (error) {
    console.error('saveUserName error:', error);
  }
}

// 🔽 Webhook の中で使うように修正
async function handleLineWebhook(req, res) {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.status(200).send('No events');

    const promises = events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const userId = event.source.userId;
      const userMessage = event.message.text.trim();

      const savedName = await getUserName(userId);

      if (!savedName) {
        if (userMessage.length < 20) {
          await saveUserName(userId, userMessage);
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `${userMessage}って呼べばいいのかな？これからよろしくね💗`,
          });
        } else {
          return lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ねぇ、あなたの名前教えてくれない？🥺（短めでね）',
          });
        }
      }

      // 通常の応答生成
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

module.exports = { handleLineWebhook };
