const supabase = require('./supabaseClient');

async function saveUserName(userId, userName) {
  const { error } = await supabase
    .from('user_names')
    .upsert({ line_user_id: userId, name: userName }, { onConflict: 'line_user_id' });
  if (error) {
    console.error('ユーザー名保存エラー:', error);
    return false;
  }
  return true;
}

async function saveMessage(userId, sender, message) {
  const { error } = await supabase
    .from('user_messages')
    .insert([{ line_user_id: userId, sender, message }]);
  if (error) {
    console.error('メッセージ保存エラー:', error);
    return false;
  }
  return true;
}

module.exports = { saveUserName, saveMessage };
