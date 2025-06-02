const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// Supabase初期化（サービスロールキーを使用）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔑 ランダムな短縮コードを生成（例：6桁の英数字）
function generateShortCode() {
  return crypto.randomBytes(3).toString('hex'); // 6文字
}

// 🎟 ユーザーごとの Stripe Checkout リンクを作成し、短縮URLを返す関数
async function createShortCheckoutLink(userId) {
  try {
    const baseUrl = process.env.BASE_URL;

    // 🔒 必須チェック
    if (!baseUrl) {
      console.error('❌ BASE_URL が設定されていません');
      return null;
    }
    if (!userId) {
      console.error('❌ userId が未定義のまま createShortCheckoutLink に渡されました');
      return null;
    }

    console.log('🎫 Stripe セッション作成開始: userId =', userId);
    // 1. StripeのCheckoutセッションを作成
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        user_id: userId, // ✅ Webhookで識別するための重要データ
      },
    });

    const checkoutUrl = session.url;
    const shortCode = generateShortCode();

    // 2. Supabaseのcheckout_linksテーブルに保存
    const { error } = await supabase.from('checkout_links').insert([
      {
        user_id: userId,
        short_code: shortCode,
        checkout_url: checkoutUrl,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error('❌ Supabase insert error:', error.message);
      return null;
    }

    // 3. 有効な短縮URLを返す
    return `${baseUrl}/s/${shortCode}`;

  } catch (err) {
    console.error('❌ Stripe checkout link error:', err.message);
    return null;
  }
}

module.exports = { createShortCheckoutLink };
