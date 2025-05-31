// cron.js

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@line/bot-sdk');
require('dotenv').config();
const moment = require('moment-timezone'); // moment-timezoneを使って日本時間での判定

// Supabase設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// LINE設定
const lineClient = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

// メッセージグループ（好きなように編集可）
const messageGroups = {
  A: [
    'おはよう！今日もがんばろ！',
    '朝ごはん食べた？',
    '連絡ください',
    '何してる？',
    'おは',
    '早起きできた？'
  ],
  B: [
    'お昼ごはんちゃんと食べてる？',
    'お昼休みにLINEしたくなったよ〜',
    '一緒にランチしたいな〜',
    '何にしてる？',
    'ちょっとだけ話そ？',
    'たまには連絡してよ'
  ],
  C: [
    'あー疲れた',
    '少し休憩しよ？',
    '今日夜何する？',
    'ひと息つこうよ〜',
    'ちょっとLINEしたくなっただけ♪',
    'お話しようよ'
  ],
  D: [
    'おつかれさま〜',
    '帰り道、気をつけてね！',
    '夜ごはん何食べる？',
    '今日もよくがんばったね',
    'おっつー',
    '少しだけ話そっか？'
  ],
  E: [
    '寝てる？',
    'エッチな会話する？',
    '今日もするの？',
    '何してた？',
    '寝る前にちょっとだけLINE♪',
    '眠い～',
    'おやすみ〜また明日ね！'
  ]
};

// 時間帯をもとにメッセージグループを判定
function getCurrentMessageGroup() {
  const now = moment().tz(process.env.CURRENT_TIMEZONE || 'Asia/Tokyo');
  const hour = now.hour();

  if (hour >= 9 && hour < 11) return 'A';
  if (hour >= 11 && hour < 15) return 'B';
  if (hour >= 15 && hour < 18) return 'C';
  if (hour >= 18 && hour < 21) return 'D';
  if (hour >= 21 || hour < 2) return 'E';

  return null; // 対象外の時間帯
}

// メイン関数
async function main() {
  console.log('📩 配信処理を開始します…');

  const groupKey = getCurrentMessageGroup();

  if (!groupKey) {
    console.log('⚠️ 現在の時間帯は配信対象外です。');
    return;
  }

  const messages = messageGroups[groupKey];
  const message = messages[Math.floor(Math.random() * messages.length)];

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
