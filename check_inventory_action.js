// 必要なモジュールをインポート
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

  for (const url of productsToMonitor) {
    try {
      console.log(`⏳ 確認中: ${url}`);
      const result = await checkInventory(url);

      if (result.error) {
        console.error(`❌ エラー (${url}):`, result.error);
        continue;
      }

      console.log(`📊 ${result.productName}: ${result.status}`);

      // 在庫がある場合に通知
      if (result.inStock) {
        console.log(`🎉 在庫あり検出: ${result.productName}`);
        await sendNotification(result);
      }
    } catch (error) {
      console.error(`❌ 予期せぬエラー (${url}):`, error);
    }

    // サーバー負荷軽減のための待機
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log(`✅ 在庫チェック完了: ${new Date().toLocaleString('ja-JP')}`);
}

// 実行
run().catch(error => {
  console.error('❌ プログラム実行エラー:', error);
  process.exit(1);
});
