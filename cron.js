// cron.js

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@line/bot-sdk');
require('dotenv').config(); // .env ファイルの読み込み

// Supabase設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// LINE設定
const lineClient = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

// 配信メッセージ一覧（好きなように編集可）
const messages = [
  '🌼 今日も元気にしてた？',
  '🌸 ゆっくり休めてる？',
  '🍀 いいことがある日になりますように♪',
  '☕ ちょっと休憩しよっか？',
  '📱 ひまなら話そっ♪',
  '🐱 にゃーん。元気？',
  'いつも大好きだよ。がんばってね！',
  'たまにはLINEしてよ💓',
  '何してる？',
  '忙しい？',
  '用事ないけど何となく。',
  '🐱 にゃーん。元気？',
  '🎀 いつも応援ありがとっ！'
];

// メイン関数
async function main() {
  console.log('📩 配信処理を開始します…');

  // Supabaseから配信対象ユーザー取得
  const { data: users, error } = await supabase
    .from('message_targets')
    .select('user_id')
    .eq('is_active', true);

  if (error) {
    console.error('❌ ユーザー取得エラー:', error.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log('⚠️ 配信対象のユーザーがいません。');
    return;
  }

  // ランダムメッセージを選択
  const message = messages[Math.floor(Math.random() * messages.length)];

  // 各ユーザーに送信
  for (const user of users) {
    try {
      await lineClient.pushMessage(user.user_id, {
        type: 'text',
        text: message
      });
      console.log(`✅ ${user.user_id} にメッセージを送信しました`);
    } catch (err) {
      console.error(`❌ ${user.user_id} への送信失敗:`, err.message);
    }
  }

  console.log('✅ 配信処理が完了しました。');
}

main();
