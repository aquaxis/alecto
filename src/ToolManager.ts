/**
 * ToolManager.ts - MCPツールの管理と実行
 *
 * 機能:
 * - MCPサーバーへの接続とクライアント管理
 * - 利用可能なツールの取得とOpenAI形式への変換
 * - ツール呼び出しの実行（タイムアウト付き）
 * - パラメータのマッピングと修正提案
 * - コマンドの検証と代替コマンドの解決
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolCall, formatToolResponse } from "./toolTypes.js";
import { getConfig, ServerConfig } from "./config.js";
import { exec } from "child_process";
import { promisify } from "util";

interface McpClientEntry {
  client: Client;
  transport: StdioClientTransport;
}

interface ToolParameterInfo {
  type: string;
  description?: string;
  items?: {
    type: string;
    properties?: Record<string, ToolParameterInfo>;
  };
  properties?: Record<string, ToolParameterInfo>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, ToolParameterInfo>;
    required?: string[];
  };
}

interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameterInfo>;
      required: string[];
    };
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterInfo>;
    required: string[];
    additionalProperties: boolean;
  };
}

const execAsync = promisify(exec);

/**
 * コマンドがシステムで利用可能かを検証する
 * @param command 検証するコマンド名
 * @returns コマンドが利用可能な場合true
 */
async function validateCommand(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * コマンドを解決する（存在しない場合は代替コマンドを探す）
 * @param command 解決するコマンド名
 * @returns 利用可能なコマンド名
 * @throws コマンドが見つからない場合
 */
async function resolveCommand(command: string): Promise<string> {
  const packageManagers = {
    node: ["node", "npx", "npm"],
    python: ["python", "uvx", "pip"],
  };

  if (await validateCommand(command)) {
    return command;
  }

  const alternatives = Object.values(packageManagers).flat();
  for (const alt of alternatives) {
    if (await validateCommand(alt)) {
      console.log(
        `⚠️ Original command '${command}' not found, using '${alt}' instead`
      );
      return alt;
    }
  }

  throw new Error(
    `Could not resolve command '${command}'. Please ensure it's installed and in your PATH.`
  );
}

const DEFAULT_INHERITED_ENV_VARS = [
  "HOME",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TERM",
  "USER",
];

/**
 * デフォルトの環境変数を取得する
 * @returns 継承する環境変数のオブジェクト
 */
function getDefaultEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        DEFAULT_INHERITED_ENV_VARS.includes(key) &&
        value !== undefined &&
        !value.startsWith("()")
    )
  ) as Record<string, string>;
}

/**
 * MCPツールをOpenAI形式に変換する
 * @param tools MCPツールの配列
 * @returns OpenAI形式のツール配列
 */
function convertToOpenaiTools(tools: McpTool[]): OpenAiTool[] {
  return tools
    .filter((tool): tool is McpTool & { name: string } => {
      if (!tool.name) {
        console.warn("Tool missing name:", tool);
        return false;
      }
      return true;
    })
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: {
          type: "object" as const,
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
        },
      },
    }));
}

/**
 * 設定に基づいてMCPクライアントを作成・接続する
 * @returns サーバー名をキーとしたMCPクライアントのMap
 */
async function createMcpClients() {
  const config = getConfig();
  const clients = new Map<
    string,
    { client: Client; transport: StdioClientTransport }
  >();

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers) as [string, ServerConfig][]) {
    const resolvedCommand = await resolveCommand(serverConfig.command);

    const transport = new StdioClientTransport({
      command: resolvedCommand,
      args: serverConfig.args || [],
      env: serverConfig.env || getDefaultEnvironment(),
    });

    const client = new Client(
      { name: `ollama-client-${serverName}`, version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    clients.set(serverName, { client, transport });
  }

  return clients;
}

/**
 * MCPツールの管理と実行を行うクラス
 */
export class ToolManager {
  private toolMap: Map<string, Client> = new Map();
  protected clients: Map<string, McpClientEntry> = new Map();
  public tools: OpenAiTool[] = [];

  /**
   * 接続中のMCPクライアントを取得する
   * @returns MCPクライアントのMap
   */
  getClients(): Map<string, McpClientEntry> {
    return this.clients;
  }

  /**
   * MCPクライアントを初期化し、利用可能なツールを取得する
   * @returns OpenAI形式のツール配列
   * @throws MCPクライアントのロードに失敗した場合
   */
  async initialize(): Promise<OpenAiTool[]> {
    const newClients = await createMcpClients();
    if (!newClients || newClients.size === 0) {
      throw new Error("No MCP clients loaded.");
    }

    this.clients = newClients;
    const allMcpTools: McpTool[] = [];

    for (const [, { client }] of this.clients.entries()) {
      const mcpTools = await this.fetchTools(client);
      if (mcpTools) {
        allMcpTools.push(...mcpTools);
        for (const tool of mcpTools) {
          this.toolMap.set(tool.name, client);
        }
      }
    }

    this.tools = convertToOpenaiTools(allMcpTools);
    return this.tools;
  }

  /**
   * MCPクライアントから利用可能なツールを取得する
   * @param client MCPクライアント
   * @returns ツールの配列、または失敗時はnull
   */
  private async fetchTools(client: Client): Promise<McpTool[] | null> {
    try {
      const toolsResponse = await client.listTools();
      const tools = toolsResponse?.tools || [];

      if (
        !Array.isArray(tools) ||
        !tools.every((tool) => typeof tool === "object")
      ) {
        console.debug("Invalid tools format received.");
        return null;
      }

      return tools as McpTool[];
    } catch (error) {
      console.error("Error fetching tools:", error);
      return null;
    }
  }

  /**
   * タイムアウト付きでツールを呼び出す
   * @param client MCPクライアント
   * @param name ツール名
   * @param args ツール引数
   * @param timeoutMs タイムアウト時間（ミリ秒）
   * @returns ツール呼び出しの結果
   * @throws タイムアウトまたはツール呼び出しエラー時
   */
  private async callToolWithTimeout(
    client: Client,
    name: string,
    args: string | Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<CallToolResult> {
    let parsedArgs: Record<string, unknown>;

    if (typeof args === "string") {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        parsedArgs = { value: args };
      }
    } else if (typeof args !== "object" || args === null) {
      parsedArgs = {};
    } else {
      parsedArgs = args;
    }

    const toolCallPromise = client.callTool({
      name,
      arguments: parsedArgs,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Tool call timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      const result = await Promise.race([toolCallPromise, timeoutPromise]);
      return result as CallToolResult;
    } catch (error) {
      throw new Error(
        `Tool call failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * ToolCallオブジェクトを実行する
   * @param toolCall 実行するツール呼び出し
   * @returns フォーマットされたツールレスポンス
   * @throws ツールが見つからない場合
   */
  async executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, args } = this.parseToolCall(toolCall);
    const client = this.toolMap.get(name);

    if (!client) {
      throw new Error(`Tool '${name}' not found`);
    }

    const result = await this.callToolWithTimeout(client, name, args);
    return formatToolResponse(result?.content || []);
  }

  /**
   * ToolCallオブジェクトをパースしてツール名と引数を抽出する
   * @param toolCall パースするツール呼び出し
   * @returns ツール名と引数のオブジェクト
   * @throws 無効なツール呼び出し形式の場合
   */
  private parseToolCall(
    toolCall: ToolCall
  ): { name: string; args: Record<string, unknown> } {
    if (!toolCall.function?.name) {
      throw new Error("Invalid tool call format provided.");
    }

    const toolName = toolCall.function.name;
    const rawArguments = toolCall.function.arguments;

    let toolArgs: Record<string, unknown>;
    if (typeof rawArguments === "string") {
      try {
        toolArgs = JSON.parse(rawArguments);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug(`Error parsing arguments string: ${message}`, rawArguments);
        throw error;
      }
    } else {
      toolArgs = rawArguments;
    }

    return { name: toolName, args: toolArgs };
  }

  /**
   * ツールを名前と引数で呼び出す
   * @param toolName ツール名
   * @param args ツール引数
   * @returns ツール呼び出しの結果、または失敗時はundefined
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult | undefined> {
    const clientForTool = this.toolMap.get(toolName);
    if (!clientForTool) {
      console.warn(`Tool '${toolName}' not found among available tools.`);
      return undefined;
    }

    try {
      const toolCall = {
        name: toolName,
        arguments: args,
      };

      return (await clientForTool.callTool(toolCall)) as CallToolResult;
    } catch (error) {
      console.error(`Error calling tool '${toolName}':`, error);
      return undefined;
    }
  }

  /**
   * ツールのパラメータ情報を取得する
   * @param toolName ツール名
   * @returns ツール情報、または見つからない場合はundefined
   */
  getToolParameterInfo(toolName: string): OpenAiTool | undefined {
    return this.tools.find((t) => t.function.name === toolName);
  }

  /**
   * 提供された引数名から期待されるパラメータ名へのマッピングを提案する
   * @param toolName ツール名
   * @param providedArgs 提供された引数
   * @returns パラメータ名のマッピング
   */
  suggestParameterMapping(
    toolName: string,
    providedArgs: Record<string, unknown>
  ): Record<string, string> {
    const tool = this.getToolParameterInfo(toolName);
    if (!tool) return {};

    const mapping: Record<string, string> = {};
    const expectedParams = Object.keys(tool.function.parameters.properties);

    for (const providedParam of Object.keys(providedArgs)) {
      if (expectedParams.includes(providedParam)) {
        continue;
      }

      const mostSimilar = this.findMostSimilarParameter(
        providedParam,
        expectedParams
      );
      if (mostSimilar) {
        mapping[providedParam] = mostSimilar;
      }
    }

    return mapping;
  }

  /**
   * 提供されたパラメータ名に最も類似した期待パラメータ名を探す
   * @param provided 提供されたパラメータ名
   * @param expected 期待されるパラメータ名の配列
   * @returns 最も類似したパラメータ名、または見つからない場合はnull
   */
  private findMostSimilarParameter(
    provided: string,
    expected: string[]
  ): string | null {
    const normalized = provided.toLowerCase().replace(/[_-]/g, "");
    for (const param of expected) {
      const normalizedExpected = param.toLowerCase().replace(/[_-]/g, "");
      if (
        normalizedExpected.includes(normalized) ||
        normalized.includes(normalizedExpected)
      ) {
        return param;
      }
    }
    return null;
  }

  /** すべてのMCPクライアントとトランスポートを閉じる */
  async cleanup() {
    if (this.clients) {
      for (const { client, transport } of this.clients.values()) {
        await client.close();
        await transport.close();
      }
    }
  }
}
