```dockerfile
# ベースとなる公式Node.jsイメージを選択 (LTS版を推奨)
FROM node:18-slim

# ffmpegをインストールするためにrootユーザーでコマンドを実行
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && rm -rf /var/lib/apt/lists/*

# アプリケーション用のディレクトリを作成
WORKDIR /usr/src/app

# 依存関係をインストールするためにpackage.jsonファイルを先にコピー
COPY package*.json ./

# npm installを実行
RUN npm install

# アプリケーションのソースコードをすべてコピー
COPY . .

# アプリケーションが使用するポートを公開 (Renderは10000番を推奨)
EXPOSE 10000

# コンテナが起動したときに実行されるコマンド
CMD [ "node", "./bin/www" ]