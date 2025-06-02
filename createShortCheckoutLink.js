const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ←必ず追加！
const crypto = require('crypto');

// Supabase初期化（Serviceロールを使う）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔑 短縮コードを生成（6文字の英数字）
function generateShortCode() {
  return crypto.randomBytes(3).toString('hex');
}

// 🎟 チェックアウトURLを生成し、短縮コード付きで保存
async function createShortCheckoutLink(userId) {
  // 1. StripeのCheckoutセッションを作成
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID, // ←Stripeダッシュボードで作成した Price ID を指定
        quantity: 1,
      },
    ],
    success_url: 'https://natsuki-asmr.com/success', // 決済後遷移
    cancel_url: 'https://natsuki-asmr.com/cancel',   // キャンセル時遷移
  });

  const fullUrl = session.url;
  const shortCode = generateShortCode();

  // 2. Supabaseに保存
  const { error } = await supabase.from('short_links').insert([
    {
      user_id: userId,
      short_code: shortCode,
      full_url: fullUrl,
    },
  ]);

  if (error) {
    console.error('❌ Supabase insert error:', error.message);
    return null;
  }

  // 3. 短縮URLとして返す
  return `https://natsuki-asmr.com/s/${shortCode}`;
}

module.exports = { createShortCheckoutLink };
