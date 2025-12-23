.PHONY: all build install uninstall clean dev start link unlink help setup check-deps

# デフォルトターゲット
all: build

# 実行環境のセットアップ
setup: check-deps
	npm install

# 依存関係の確認
check-deps:
	@command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is not installed"; exit 1; }
	@echo "Node.js: $$(node --version)"
	@echo "npm: $$(npm --version)"

# TypeScriptをコンパイル
build:
	npm run build

# グローバルにインストール
install: build
	npm install -g .

# グローバルからアンインストール
uninstall:
	npm uninstall -g alecto

# ビルド成果物を削除
clean:
	rm -rf dist

# 開発モード（TypeScript直接実行）
dev:
	npm start

start: dev

# 開発用リンク（グローバルにシンボリックリンク）
link: build
	npm link

# リンク解除
unlink:
	npm unlink -g alecto

# ヘルプ
help:
	@echo "使用可能なターゲット:"
	@echo "  make setup     - 実行環境のセットアップ（依存関係インストール）"
	@echo "  make build     - TypeScriptをコンパイル"
	@echo "  make install   - グローバルにインストール"
	@echo "  make uninstall - グローバルからアンインストール"
	@echo "  make clean     - ビルド成果物を削除"
	@echo "  make dev       - 開発モード（TypeScript直接実行）"
	@echo "  make link      - 開発用グローバルリンク"
	@echo "  make unlink    - リンク解除"
	@echo "  make check-deps - Node.js/npmのバージョン確認"
