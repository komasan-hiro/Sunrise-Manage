const express = require('express');
const router = express.Router();
const fitbit = require('../lib/fitbit-api');
const db = require('../lib/database');

// ログイン必須にするミドルウェア
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/users/login');
}
// このルーターのすべてのAPIにログインチェックを適用
router.use(ensureAuthenticated);

// GET /auth - ユーザーをFitbitの認可ページにリダイレクト
router.get('/', (req, res, next) => {
  const authUrl = fitbit.getAuthorizationUrl();
  res.redirect(authUrl);
});

// GET /auth/callback - Fitbitからのリダイレクトを受け取る
router.get('/callback', async (req, res, next) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Error: Authorization code not found.');
  }
  try {
    const tokens = await fitbit.fetchTokens(code);
    await db.saveFitbitTokens(req.user.id, tokens);
    res.redirect('/');
  } catch (error) {
    console.error('Failed to process Fitbit callback:', error);
    res.status(500).send('Failed to fetch tokens.');
  }
});

module.exports = router;