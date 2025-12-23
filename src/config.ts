/**
 * config.ts - アプリケーション設定の読み込みと管理
 *
 * 機能:
 * - .alecto/config.jsonからの設定読み込み
 * - MCPサーバー設定の定義
 * - Ollamaサーバー設定（ホスト、モデル、パラメータ）の定義
 */

import * as fs from "fs";
import * as path from "path";

export interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface OllamaConfig {
  host?: string;
  model: string;
  parameters?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface Config {
  mcpServers: Record<string, ServerConfig>;
  ollama: OllamaConfig;
}

const CONFIG_PATH = path.resolve(process.cwd(), ".alecto/config.json");

/**
 * 設定ファイルを読み込んでパースする
 * @returns パースされた設定オブジェクト
 * @throws 設定ファイルの読み込みまたはパースに失敗した場合
 */
function loadConfig(): Config {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(configData) as Config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${CONFIG_PATH}: ${message}`);
  }
}

const config: Config = loadConfig();

/**
 * アプリケーション設定を取得する
 * @returns 設定オブジェクト
 */
export const getConfig = (): Config => config;

export const ollamaConfig: OllamaConfig = config.ollama;
