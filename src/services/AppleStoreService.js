// services/AppleStoreService.js
// Apple App Store Server API v1 - StoreKit 2

const jwt = require('jsonwebtoken');
const https = require('https');

// ─── Ortam Ayarları ───────────────────────────────────────────────────────────

const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_ISSUER_ID = process.env.APPLE_ISSUER_ID;
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID;
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Sandbox mı production mı?
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const APPLE_API_BASE = IS_PRODUCTION
  ? 'https://api.storekit.itunes.apple.com'
  : 'https://api.storekit-sandbox.itunes.apple.com';

// ─── JWT Üretimi (Apple API için) ─────────────────────────────────────────────

/**
 * Apple App Store Server API için Bearer token üretir.
 * Her istek için yeni token üretmek yerine cache'lenebilir (max 60 dk).
 */
let cachedToken = null;
let tokenExpiresAt = null;

function generateAppleAPIToken() {
  // Cache kontrolü — 55 dakikadan az kaldıysa yenile
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!APPLE_KEY_ID || !APPLE_ISSUER_ID || !APPLE_PRIVATE_KEY) {
    throw new Error('Apple API credentials eksik. .env dosyasını kontrol et.');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 60 * 60; // 1 saat

  const payload = {
    iss: APPLE_ISSUER_ID,
    iat: now,
    exp: expiry,
    aud: 'appstoreconnect-v1',
    bid: APPLE_BUNDLE_ID
  };

  const token = jwt.sign(payload, APPLE_PRIVATE_KEY, {
    algorithm: 'ES256',
    keyid: APPLE_KEY_ID
  });

  cachedToken = token;
  tokenExpiresAt = expiry * 1000;

  return token;
}

// ─── Apple API İsteği ─────────────────────────────────────────────────────────

function appleAPIRequest(path) {
  return new Promise((resolve, reject) => {
    const token = generateAppleAPIToken();
    const url = new URL(path, APPLE_API_BASE);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Apple API isteği zaman aşımına uğradı'));
    });
    req.end();
  });
}

// ─── Apple JWT Decode (Webhook için) ─────────────────────────────────────────

/**
 * Apple'ın imzaladığı JWS token'ı decode eder.
 * Production'da Apple'ın public key'i ile verify edilmeli.
 * Şimdilik decode yapıyoruz, imza doğrulaması TODO olarak işaretlendi.
 */
function decodeAppleJWT(signedJWT) {
  try {
    const parts = signedJWT.split('.');
    if (parts.length !== 3) return null;

    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);

    // TODO: Production'da Apple'ın WWDR sertifikaları ile verify et
    // https://developer.apple.com/documentation/appstoreservernotifications/enabling_app_store_server_notifications
  } catch (error) {
    console.error('Apple JWT decode hatası:', error.message);
    return null;
  }
}

// ─── Transaction Doğrulama ────────────────────────────────────────────────────

/**
 * Verilen originalTransactionId için Apple'dan abonelik bilgilerini çeker.
 * Client'tan gelen hiçbir tarihe güvenmiyoruz — tüm veriler Apple'dan geliyor.
 *
 * @param {string} originalTransactionId
 * @returns {{ isValid: boolean, expiresDate: Date|null, status: string, productId: string|null }}
 */
async function verifySubscriptionWithApple(originalTransactionId) {
  try {
    // App Store Server API: Get All Subscription Statuses
    const response = await appleAPIRequest(
      `/inApps/v1/subscriptions/${originalTransactionId}`
    );

    if (response.statusCode === 404) {
      return { isValid: false, expiresDate: null, status: 'not_found', productId: null };
    }

    if (response.statusCode !== 200) {
      console.error(`Apple API hata kodu: ${response.statusCode}`, response.data);
      return { isValid: false, expiresDate: null, status: 'api_error', productId: null };
    }

    const { data } = response;

    // data dizisinden aktif aboneliği bul
    // Her eleman bir subscription group, içinde lastTransactions var
    if (!data?.data || !Array.isArray(data.data)) {
      return { isValid: false, expiresDate: null, status: 'invalid_response', productId: null };
    }

    let latestTransaction = null;
    let latestExpiresDate = null;

    for (const group of data.data) {
      for (const transaction of group.lastTransactions || []) {
        // status: 1=active, 2=expired, 3=billing retry, 4=grace period, 5=revoked
        const txInfo = decodeAppleJWT(transaction.signedTransactionInfo);
        const renewalInfo = decodeAppleJWT(transaction.signedRenewalInfo);

        if (!txInfo) continue;

        const expiresDate = txInfo.expiresDate ? new Date(txInfo.expiresDate) : null;

        // En son bitiş tarihli transaction'ı al
        if (!latestExpiresDate || (expiresDate && expiresDate > latestExpiresDate)) {
          latestTransaction = { txInfo, renewalInfo, status: transaction.status };
          latestExpiresDate = expiresDate;
        }
      }
    }

    if (!latestTransaction) {
      return { isValid: false, expiresDate: null, status: 'no_transactions', productId: null };
    }

    const { txInfo, status } = latestTransaction;
    const now = new Date();
    const expiresDate = latestExpiresDate;

    // status: 1=active, 4=grace period → erişim var
    const isValid = (status === 1 || status === 4) && expiresDate > now;

    // Abonelik durumunu belirle
    let subscriptionStatus = 'expired';
    if (status === 1 && expiresDate > now) subscriptionStatus = 'active';
    else if (status === 4) subscriptionStatus = 'grace_period';
    else if (status === 5) subscriptionStatus = 'cancelled';
    else if (status === 3) subscriptionStatus = 'billing_retry';

    return {
      isValid,
      expiresDate,
      status: subscriptionStatus,
      productId: txInfo.productId || null,
      originalTransactionId: txInfo.originalTransactionId,
      latestTransactionId: txInfo.transactionId
    };

  } catch (error) {
    console.error('Apple abonelik doğrulama hatası:', error.message);
    throw error;
  }
}

// ─── Sandbox Fallback ─────────────────────────────────────────────────────────

/**
 * Production'da 404 gelirse sandbox'ta dene.
 * Test cihazlarından gelen satın almalar sandbox'ta olur.
 */
async function verifySubscriptionWithFallback(originalTransactionId) {
  try {
    const result = await verifySubscriptionWithApple(originalTransactionId);

    // Production'da not_found ise sandbox'ta dene (development/TestFlight için)
    if (result.status === 'not_found' && IS_PRODUCTION) {
      console.log('Production\'da bulunamadı, sandbox deneniyor...');
      const sandboxResult = await verifySubscriptionInSandbox(originalTransactionId);
      return sandboxResult;
    }

    return result;
  } catch (error) {
    throw error;
  }
}

async function verifySubscriptionInSandbox(originalTransactionId) {
  // Geçici olarak sandbox URL'ini kullan
  const originalBase = APPLE_API_BASE;
  const sandboxBase = 'https://api.storekit-sandbox.itunes.apple.com';

  return new Promise((resolve, reject) => {
    const token = generateAppleAPIToken();
    const path = `/inApps/v1/subscriptions/${originalTransactionId}`;
    const url = new URL(path, sandboxBase);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  }).then(response => {
    if (response.statusCode !== 200) {
      return { isValid: false, expiresDate: null, status: 'not_found', productId: null };
    }
    // Aynı parse mantığı (DRY için ileride refactor edilebilir)
    return { isValid: false, expiresDate: null, status: 'sandbox_found', productId: null };
  });
}

module.exports = {
  verifySubscriptionWithApple,
  verifySubscriptionWithFallback,
  decodeAppleJWT,
  generateAppleAPIToken
};