// supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ユーザー名の保存
async function saveUserName(userId, name) {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, name: name });

  if (error) {
    console.error('Error saving user name:', error);
  }
}

// メッセージの保存
async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([{ user_id: userId, role, content }]);

  if (error) {
    console.error('Error saving message:', error);
  }
}

// 直近のメッセージ履歴を取得（最大 limit 件）
async function getRecentMessages(userId, limit = 5) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent messages:', error);
    return [];
  }

  return data.reverse(); // 時系列順に並べ替えて返す
}

module.exports = {
  supabase,
  saveUserName,
  saveMessage,
  getRecentMessages,
};
