var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// ★認証関連のパッケージをインポート
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

// ★データベースモジュールをインポート
const db = require('./lib/database');

// --- ルーター(交通整理係)をインポート ---
var indexRouter = require('./routes/index');
var authRouter = require('./routes/auth');
var settingsRouter = require('./routes/settings');
var alarmsRouter = require('./routes/alarms');
var usersRouter = require('./routes/users'); // ★ユーザー認証用ルーターを追加

var app = express();
app.set('trust proxy', 1); 

// --- View Engine Setup ---
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- Middleware Setup ---
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- ★★★ ここから認証設定 (重要) ★★★ ---

// 1. セッションの設定
app.use(session({
  secret: 'your-very-strong-secret-key-change-this', // ★この文字列は、もっと複雑なランダムなものに変更してください
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // ローカル開発環境(http)ではfalse。本番環境(https)ではtrueにする
    maxAge: 7 * 24 * 60 * 60 * 1000 // セッションの寿命 (例: 7日間)
  }
}));

app.use(flash());

// 2. Passport.js の初期化
app.use(passport.initialize());
app.use(passport.session()); // セッションを使ったログイン維持を有効にする

// 3. Passport.js の「認証戦略」を定義
// ユーザー名とパスワードを使ったローカル認証
passport.use(new LocalStrategy(
  { usernameField: 'email' }, // ユーザー名は'email'フィールドを使うと宣言
  async (email, password, done) => {
    try {
      // DBからEmailでユーザーを探す
      const user = await db.findUserByEmail(email);
      if (!user) {
        // ユーザーが見つからなければ認証失敗
        return done(null, false, { message: 'このメールアドレスは登録されていません。' });
      }
      // パスワードが一致するかチェック
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        // パスワードが違えば認証失敗
        return done(null, false, { message: 'パスワードが間違っています。' });
      }
      // すべてOKなら、ユーザーオブジェクトを渡して認証成功
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// 4. セッションに保存するユーザー情報の定義
// ログイン成功時、セッションにユーザーIDのみを保存する
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// 以降のリクエストで、セッションIDを元にDBから完全なユーザー情報を復元する
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.findUserById(id);
    done(null, user); // req.user にユーザー情報が格納される
  } catch (err) {
    done(err);
  }
});

// --- ★★★ 認証設定ここまで ★★★ ---

app.use(express.static(path.join(__dirname, 'public')));

// --- Routing ---
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/settings', settingsRouter);
app.use('/alarms', alarmsRouter);
app.use('/users', usersRouter); // ★ユーザー認証用ルートを登録

// --- Error Handling ---
app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;