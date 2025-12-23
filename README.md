# Alecto

Autonomous Logic Executor for Complex Task Operations

OllamaとMCP（Model Context Protocol）を組み合わせた、ツール拡張可能なAIチャットCLIアプリケーションです。

## 機能

- Ollamaを使ったローカルLLMとの対話
- MCPサーバーを通じたツール呼び出し（ファイル操作、Web検索など）
- 拡張可能なツールシステム

## 必要条件

- Node.js 18以上
- npm
- Ollama

## インストール

### 1. Ollamaのインストール

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. モデルのダウンロード

```bash
ollama pull ministral:3b
# または任意のモデル
ollama pull <MODEL_NAME>
```

利用可能なモデルの確認:
```bash
ollama list
```

### 3. 依存パッケージのインストール

```bash
make setup
```

または

```bash
npm install
```

## 設定

プロジェクトルートに `.alecto/config.json` を作成して設定を行います。

### 設定例

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-filesystem",
        "./"
      ]
    }
  },
  "ollama": {
    "host": "http://localhost:11434",
    "model": "ministral:3b"
  }
}
```

### 設定項目

| 項目 | 説明 |
|------|------|
| `mcpServers` | MCPサーバーの設定。各サーバーに`command`と`args`を指定 |
| `ollama.host` | Ollamaサーバーのホスト（デフォルト: `http://localhost:11434`） |
| `ollama.model` | 使用するモデル名 |

## 使用方法

### Ollamaサーバーの起動

```bash
ollama serve
```

### アプリケーションの起動

```bash
npm start
```

### チャットの操作

- メッセージを入力してEnterで送信
- `exit` と入力して終了

## MCPサーバーの追加

`.alecto/config.json` の `mcpServers` に新しいサーバーを追加することで、ツールを拡張できます。

### 例: Gemini CLIの追加

```json
{
  "mcpServers": {
    "gemini-cli": {
      "command": "npx",
      "args": ["mcp-gemini-cli", "--allow-npx"],
      "env": {}
    }
  }
}
```

## 開発

### Makeコマンド

```bash
make help          # 使用可能なコマンド一覧
make setup         # 実行環境のセットアップ（依存関係インストール）
make build         # TypeScriptをコンパイル
make dev           # 開発モード（TypeScript直接実行）
make install       # グローバルにインストール
make uninstall     # グローバルからアンインストール
make clean         # ビルド成果物を削除
make link          # 開発用グローバルリンク
make unlink        # リンク解除
make check-deps    # Node.js/npmのバージョン確認
```

### ビルド

```bash
make build
# または
npm run build
```

### 直接実行（TypeScript）

```bash
make dev
# または
npx tsx src/main.ts
```

## ライセンス

ISC

## MCP Server

### DuckDuckGo

DuckDuckGo MCP Serverは、DuckDuckGo検索エンジンを使用したWeb検索機能を提供するMCPサーバーです。AIがインターネット上の情報を検索・取得できるようになります。

#### インストール

```bash
uv venv
source .venv/bin/activate
uv pip install duckduckgo-mcp-server
```

#### 設定

`.alecto/config.json` に以下を追加します:

```json
{
  "mcpServers": {
    "duckduckgo": {
      "command": "uv",
      "args": ["run", "duckduckgo-mcp-server"]
    }
  }
}
```

#### 提供されるツール

| ツール名 | 説明 |
|----------|------|
| `search` | DuckDuckGoでWeb検索を実行し、検索結果を取得します |
