// cron.js
import { createClient } from '@supabase/supabase-js';
import { Client } from '@line/bot-sdk';

// Supabase & LINE 環境変数
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const lineClient = new Client({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN });

async function main() {
  const { data: users, error } = await supabase.from('users').select('user_id, created_at');
  if (error) {
    console.error('Supabase fetch error:', error);
    return;
  }

  const today = new Date();

  for (const user of users) {
    const joined = new Date(user.created_at);
    const days = Math.floor((today - joined) / (1000 * 60 * 60 * 24));

    // ステップ別メッセージ
    let message;
    switch (days) {
      case 0:
        message = '🎉 初日だね！これからよろしく♪';
        break;
      case 1:
        message = '📅 2日目！昨日は楽しめた？';
        break;
      case 2:
        message = '☀️ 3日目、今日もいい日になるよ！';
        break;
      default:
        message = '🌈 いつもありがとう！今日も話そうね♪';
    }

    try {
      await lineClient.pushMessage(user.user_id, {
        type: 'text',
        text: message,
      });
      console.log(`✅ Sent to ${user.user_id}`);
    } catch (err) {
      console.error(`❌ Error sending to ${user.user_id}:`, err);
    }
  }
}

main();
