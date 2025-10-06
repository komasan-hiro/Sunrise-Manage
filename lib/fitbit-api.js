const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const crypto = require('crypto');
const db = require('./database');

// --- PKCE Code Generator ---
function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateCodeVerifier() { return base64URLEncode(crypto.randomBytes(32)); }
function generateCodeChallenge(verifier) { return base64URLEncode(crypto.createHash('sha256').update(verifier).digest()); }

/** 認可ページのURLを生成 */
function getAuthorizationUrl() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  require('fs').writeFileSync(path.join(__dirname, '..', 'pkce-verifier.txt'), codeVerifier);

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID, response_type: 'code',
    code_challenge: codeChallenge, code_challenge_method: 'S256',
    scope: 'sleep heartrate profile',
    redirect_uri: process.env.REDIRECT_URL,
  });
  return `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
}

/** 認可コードを使ってトークンを取得 */
async function fetchTokens(code) {
  const codeVerifier = require('fs').readFileSync(path.join(__dirname, '..', 'pkce-verifier.txt'), 'utf8');
  const credentials = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');
  
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID, grant_type: 'authorization_code', code,
    code_verifier: codeVerifier, redirect_uri: process.env.REDIRECT_URL,
  });

  try {
    const response = await axios.post('https://api.fitbit.com/oauth2/token', body.toString(), {
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (error) {
    console.error('トークン取得エラー:', error.response?.data);
    throw error;
  }
}

/** トークンをリフレッシュ (userIdを引数に取る) */
async function refreshTokens(userId) {
  const user = await db.findUserById(userId);
  if (!user || !user.refresh_token) throw new Error('No refresh token found for user.');
  
  const credentials = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.refresh_token });

  try {
    const response = await axios.post('https://api.fitbit.com/oauth2/token', body.toString(), {
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    await db.saveFitbitTokens(userId, response.data);
    console.log(`ユーザー(${userId})のトークンをリフレッシュしました。`);
    return response.data;
  } catch (error) {
    console.error(`ユーザー(${userId})のトークンリフレッシュエラー:`, error.response?.data);
    throw error;
  }
}

/** APIリクエストを実行 (userIdを引数に取る) */
async function makeApiRequest(userId, apiCall) {
  const user = await db.findUserById(userId);
  if (!user || !user.access_token) throw new Error('User has no access token.');
  
  try {
    return await apiCall(user.access_token);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log(`ユーザー(${userId})のアクセストークンが期限切れです。リフレッシュします...`);
      const newTokens = await refreshTokens(userId);
      return await apiCall(newTokens.access_token);
    }
    throw error;
  }
}

/** 睡眠データを取得 (userIdを引数に取る) */
async function getSleepData(userId) {
  return makeApiRequest(userId, async (accessToken) => {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (response.data.sleep && response.data.sleep.length > 0) {
      return response.data.sleep.find(log => log.isMainSleep) || response.data.sleep[0];
    }
    return null;
  });
}

/** ユーザープロファイルを取得 (userIdを引数に取る) */
async function getUserProfile(userId) {
  return makeApiRequest(userId, async (accessToken) => {
    const url = `https://api.fitbit.com/1/user/-/profile.json`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.user;
  });
}

/** 心拍数を取得 (userIdを引数に取る) */
async function getRecentHeartRate(userId) {
  return makeApiRequest(userId, async (accessToken) => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 15 * 60 * 1000);
    const formatDate = (d) => `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    const url = `https://api.fitbit.com/1/user/-/activities/heart/date/today/1d/1min/time/${formatDate(startTime)}/${formatDate(now)}.json`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data['activities-heart-intraday'].dataset;
  });
}

module.exports = {
  getAuthorizationUrl,
  fetchTokens,
  getSleepData,
  getUserProfile,
  getRecentHeartRate
};