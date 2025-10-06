const express = require('express');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// --- Multer の設定 ---
// ファイルの保存先とファイル名を定義
const storage = multer.diskStorage({
  // 保存先の指定
  destination: function (req, file, cb) {
    // __dirname は現在のファイルがある場所 (routes)
    // '../public/sounds/' で、一つ上の階層の public/sounds フォルダを指定
    cb(null, path.join(__dirname, '../public/sounds/'));
  },
  // ファイル名の指定
  filename: function (req, file, cb) {
    // ユーザーがアップロードした元のファイル名で保存
    cb(null, file.originalname);
  }
});

// 上記の設定を元に、アップロード用のミドルウェアを作成
const upload = multer({ 
  storage: storage,
  // ファイルフィルタを追加して音声ファイルのみを許可 (任意)
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('音声ファイルのみアップロードできます。'), false);
    }
  }
});

/**
 * GET /settings
 * 設定ページを表示する
 */
router.get('/', (req, res, next) => {
  // public/sounds フォルダのパスを取得
  const soundsDirectory = path.join(__dirname, '../public/sounds/');

  // soundsフォルダ内のファイル一覧を読み込む
  fs.readdir(soundsDirectory, (err, files) => {
    if (err) {
      console.error('サウンドフォルダの読み込みエラー:', err);
      files = []; // エラーの場合は空の配列とする
    }

    // 音声ファイルのみをフィルタリング (例: .mp3, .wav, .ogg)
    const audioFiles = files.filter(file => 
      ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase())
    );

    // 読み込んだファイル一覧をページに渡して描画
    res.render('settings', { 
      title: 'アラーム設定',
      sounds: audioFiles // ★ファイル一覧を渡す
    });
  });
});

/**
 * POST /settings/upload
 * ファイルアップロードを処理する
 */
// 'alarmSound' は <input type="file"> の name 属性と一致させる
router.post('/upload', upload.single('alarmSound'), (req, res, next) => {
  // アップロードが成功した後の処理
  console.log('アップロードされたファイル:', req.file);
  // 成功したら、設定ページにリダイレクトして戻す
  res.redirect('/settings');
});

module.exports = router;