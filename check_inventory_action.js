// 必要なモジュールをインポート
const fs = require('fs');
const path = require('path');
const { checkInventory } = require('./inventory_checker');

// 環境変数から設定を読み込み
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

// PRODUCT_URLS未設定時のデフォルト (2026-09-08 動作確認済み3機種)
const DEFAULT_PRODUCT_URLS = [
  'https://mvno.geo-mobile.jp/uqmobile/smartphone/iPhone11_simfree',
  'https://mvno.geo-mobile.jp/uqmobile/smartphone/iPhone12_simfree',
  'https://mvno.geo-mobile.jp/uqmobile/smartphone/iPhoneSE3_simfree'
].join(',');

const productUrlsString = process.env.PRODUCT_URLS || DEFAULT_PRODUCT_URLS;

// 商品URLリストを解析 (カンマまたは改行で区切る)
const productsToMonitor = productUrlsString.split(/[,\n]+/).map(url => url.trim()).filter(url => url);

// 前回の在庫状態を保存するファイル (in_stock / out_of_stock を記録し、差分検知に使う)
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// Discord Webhookで在庫あり通知を送信する関数
async function sendNotification(product) {
  if (!discordWebhookUrl) {
    console.error('❌ DISCORD_WEBHOOK_URL が未設定のため通知をスキップしました');
    return false;
  }

  try {
    const payload = {
      embeds: [
        {
          title: `📱 在庫あり: ${product.productName}`,
          url: product.url,
          color: 0x4caf50,
          fields: [
            { name: 'ステータス', value: product.status, inline: true },
            { name: 'チェック時刻', value: product.checkedAt, inline: true }
          ],
          footer: { text: 'geomobile-stock-checker (GitHub Actions)' }
        }
      ]
    };

    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Discord Webhook error: HTTP ${response.status}`);
    }

    console.log(`✅ Discord通知送信成功 (${product.productName})`);
    return true;
  } catch (error) {
    console.error(`❌ Discord通知エラー (${product.productName}):`, error);
    return false;
  }
}

// メイン実行関数
async function run() {
  console.log(`🔍 在庫チェック開始: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`📋 チェック対象商品数: ${productsToMonitor.length}`);

  const state = loadState();
  let stateChanged = false;

  for (const url of productsToMonitor) {
    try {
      console.log(`⏳ 確認中: ${url}`);
      const result = await checkInventory(url);

      if (result.error) {
        console.error(`❌ エラー (${url}):`, result.error);
        continue;
      }

      console.log(`📊 ${result.productName}: ${result.status}`);

      const currentStatus = result.inStock ? 'in_stock' : 'out_of_stock';
      const previousStatus = state[url];

      // 「在庫切れ→在庫あり」に変わった時だけ通知（初回記録時は通知しない）
      if (currentStatus === 'in_stock' && previousStatus === 'out_of_stock') {
        console.log(`🎉 在庫切れ→在庫あり に変化: ${result.productName}`);
        await sendNotification(result);
      } else if (currentStatus === 'in_stock' && previousStatus === undefined) {
        console.log(`ℹ️ 初回記録 (在庫あり、通知はスキップ): ${result.productName}`);
      } else {
        console.log(`↔️ 状態変化なし (${previousStatus ?? '未記録'} → ${currentStatus}): ${result.productName}`);
      }

      if (state[url] !== currentStatus) {
        state[url] = currentStatus;
        stateChanged = true;
      }
    } catch (error) {
      console.error(`❌ 予期せぬエラー (${url}):`, error);
    }

    // サーバー負荷軽減のための待機
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  if (stateChanged) {
    saveState(state);
    console.log('💾 state.json を更新しました');
  }

  console.log(`✅ 在庫チェック完了: ${new Date().toLocaleString('ja-JP')}`);
}

// 実行
run().catch(error => {
  console.error('❌ プログラム実行エラー:', error);
  process.exit(1);
});
