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

### ビルド

```bash
npm run build
```

### 直接実行（TypeScript）

```bash
npx tsx src/main.ts
```

## ライセンス

ISC
