// Stripe Webhookの中の checkout.session.completed 処理内

const session = event.data.object;
const userId = session.metadata?.user_id;
const quantity = session.amount_total / 128000;

if (userId) {
  // 🆕 日付に関係なく、そのユーザーの char_limit を取得
  const { data, error } = await supabase
    .from('daily_usage')
    .select('char_limit, total_chars')
    .eq('user_id', userId)
    .order('date', { ascending: false }) // 最も新しい記録を取得
    .limit(1)
    .single();

  const newLimit = (data?.char_limit || 0) + quantity * 10000;
  const newTotalChars = data?.total_chars || 0;

  // 🔁 すでにレコードがあれば更新、なければ新規
  const { error: upsertError } = await supabase
    .from('daily_usage')
    .upsert([{
      user_id: userId,
      date: new Date().toISOString().split('T')[0], // 今日でOK（履歴用に残す）
      total_chars: newTotalChars,
      char_limit: newLimit,
      gomen_sent: false
    }]);

  if (upsertError) {
    console.error('❌ daily_usage upsert error:', upsertError.message);
  } else {
    console.log(`✅ Stripe決済成功！${userId} の char_limit を ${newLimit} に更新`);
  }
}
