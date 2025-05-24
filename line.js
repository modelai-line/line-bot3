const { Client, middleware } = require('@line/bot-sdk');
const { generateReply } = require('./chat');
const fs = require('fs');
const path = require('path');

const userDataFile = path.join(__dirname, 'usernames.json');

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);

let userNames = {};
try {
  userNames = JSON.parse(fs.readFileSync(userDataFile, 'utf8'));
} catch {
  userNames = {};
}

function saveUserNames(data) {
  fs.writeFileSync(userDataFile, JSON.stringify(data, null, 2), 'utf8');
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

      const savedName = userNames[userId];

      // 名前未登録時の処理
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

      // 名前がある場合はchat.jsのgenerateReplyを呼ぶ
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
