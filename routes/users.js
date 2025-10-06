const express = require('express');
const router = express.Router();
const passport = require('passport');
const db = require('../lib/database');
// GET /users/login - ログインページ表示
router.get('/login', (req, res) => {
// flashメッセージがあれば、それをビューに渡す
res.render('login', { title: 'Login', messages: req.flash('error') });
});
// POST /users/login - ログイン処理
router.post('/login', passport.authenticate('local', {
successRedirect: '/', // 成功したらトップページへ
failureRedirect: '/users/login', // 失敗したらログインページへ戻る
failureFlash: true // 失敗時にflashメッセージを有効にする
}));
// GET /users/register - 登録ページ表示
router.get('/register', (req, res) => {
res.render('register', { title: 'Register' });
});
// POST /users/register - 登録処理
router.post('/register', async (req, res, next) => {
try {
// パスワードと確認用パスワードが一致するかチェック
if (req.body.password !== req.body.passwordConfirm) {
// 一致しない場合は、エラーメッセージと共に登録ページを再表示（より親切な実装）
return res.render('register', { title: 'Register', error: 'パスワードが一致しません。' });
}
// データベースにユーザーを作成
await db.createUser(req.body.email, req.body.password);
// 成功したらログインページへリダイレクト
res.redirect('/users/login');
} catch (err) {
// emailの重複など、DBエラーが起きた場合
console.error('Registration error:', err);
// エラーメッセージと共に登録ページを再表示
return res.render('register', { title: 'Register', error: 'このメールアドレスは既に使用されています。' });
}
});
// GET /users/logout - ログアウト処理
router.get('/logout', (req, res, next) => {
// req.logoutのコールバック関数内でリダイレクトを行う
req.logout(function(err) {
if (err) { return next(err); }
res.redirect('/users/login');
});
});
module.exports = router;