const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const BASE_URL = process.env.BASE_URL;

function generateShortCode(length = 6) {
  return crypto.randomBytes(length).toString('base64url').substring(0, length);
}

async function createShortCheckoutLink(userId) {
  const shortCode = generateShortCode();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'jpy',
          unit_amount: 128000, // 1280円（×100）
          product_data: {
            name: 'LINEチャットチケット（10000文字）',
          },
        },
        quantity: 1,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: 10
        }
      }
    ],
    mode: 'payment',
    metadata: {
      user_id: userId,
    },
    success_url: `${BASE_URL}/success`,
    cancel_url: `${BASE_URL}/cancel`,
  });

  const { error } = await supabase.from('checkout_links').insert({
    short_code: shortCode,
    checkout_url: session.url,
    user_id: userId,
  });

  if (error) {
    console.error('❌ Supabase insert error:', error);
    throw new Error('短縮リンクの作成に失敗しました');
  }

  return `${BASE_URL}/s/${shortCode}`;
}

module.exports = { createShortCheckoutLink };
