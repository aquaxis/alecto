/**
 * ChatManager.ts - Ollamaとのチャットセッション管理
 *
 * 機能:
 * - Ollamaサーバーへの接続とチャットセッションの管理
 * - ユーザー入力の受付とレスポンスの表示
 * - ツール呼び出し（Function Calling）の処理とエラーハンドリング
 * - 会話履歴の管理
 */

import { Ollama, Message, ToolCall as OllamaToolCallType } from "ollama";
import { ToolManager } from "./ToolManager.js";
import { formatToolResponse } from "./toolTypes.js";

import * as p from "@clack/prompts";

interface ErrorWithCause extends Error {
  cause?: {
    code?: string;
  };
}

interface OpenAiToolInfo {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}


interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCallType[];
  tool_call_id?: string;
  name?: string;
}

/**
 * コマンドラインでのユーザー入力を管理するクラス
 * clackを使用してマルチバイト文字入力に対応
 */
class ChatInterface {
  /**
   * ユーザーからの入力を取得する
   * @returns ユーザーが入力した文字列
   */
  async getUserInput(): Promise<string> {
    const result = await p.text({ message: "You:" });
    if (p.isCancel(result)) {
      return "exit";
    }
    return result;
  }

  /** リソースをクリーンアップする（clackでは不要だが互換性のため維持） */
  close(): void {
    // clackは明示的なクリーンアップ不要
  }
}

/**
 * Ollamaとのチャットセッションを管理するクラス
 */
export class ChatManager {
  private ollama: Ollama;
  private messages: OllamaMessage[] = [];
  private toolManager: ToolManager;
  private chatInterface: ChatInterface;
  private model: string;

  /**
   * ChatManagerを初期化する
   * @param ollamaConfig Ollamaサーバーの設定（ホスト、モデル）
   */
  constructor(ollamaConfig: { host?: string; model?: string } = {}) {
    this.ollama = new Ollama(ollamaConfig);
    this.model = ollamaConfig.model || "ministral-3:14b";
    this.toolManager = new ToolManager();
    this.chatInterface = new ChatInterface();

    console.log('Model is ' + this.model);

    this.messages = [
      {
        role: "system",
        content:
          "You are a helpful AI assistant. Please provide clear, accurate, and relevant responses to user queries. If you need to use tools to help answer a question, explain what you're doing.",
      },
    ];
  }

  /**
   * ToolManagerとOllama接続を初期化する
   * @throws Ollamaサーバーへの接続に失敗した場合
   */
  async initialize() {
    await this.toolManager.initialize();
    try {
      await this.testOllamaConnection();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to Ollama. Is Ollama running? Error: ${errorMsg}`
      );
    }
  }

  /**
   * Ollamaサーバーへの接続をテストする
   * @throws 接続に失敗した場合
   */
  private async testOllamaConnection() {
    try {
      await this.ollama.chat({
        model: this.model,
        messages: [{ role: "user", content: "test" }],
        tools: [],
      });
    } catch (error) {
      const err = error as ErrorWithCause;
      if (err.cause?.code === "ECONNREFUSED") {
        throw new Error("Could not connect to Ollama server");
      }
      throw error;
    }
  }

  /**
   * チャットセッションを開始する
   * ユーザー入力を受け付け、"exit"が入力されるまでループする
   */
  async start() {
    try {
      console.log('Chat started. Type "exit" to end the conversation.');

      while (true) {
        const userInput = await this.chatInterface.getUserInput();
        if(userInput?.toLowerCase() === "exit") break;

        try {
          await this.processUserInput(userInput);
        } catch (error) {
          const err = error as ErrorWithCause;
          if (err.cause?.code === "ECONNREFUSED") {
            console.error(
              "\nError: Lost connection to Ollama server. Please ensure Ollama is running."
            );
            console.log("You can:");
            console.log("1. Start Ollama and type your message again");
            console.log('2. Type "exit" to quit\n');
          } else {
            console.error(
              "Error processing input:",
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.cleanup();
    }
  }

  /**
   * ユーザー入力を処理し、Ollamaからのレスポンスを取得する
   * @param userInput ユーザーが入力した文字列
   */
  private async processUserInput(userInput: string) {
    this.messages.push({ role: "user", content: userInput });

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: this.messages as Message[],
        tools: this.toolManager.tools,
      });

      this.messages.push(response.message as OllamaMessage);

      const toolCalls = response.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        console.log("Assistant:", response.message.content);
        return;
      }

      await this.handleToolCalls(toolCalls);
    } catch (error) {
      this.messages.pop();
      throw error;
    }
  }

  /**
   * モデルからのツール呼び出しを処理する
   * @param toolCalls 実行するツール呼び出しの配列
   */
  private async handleToolCalls(toolCalls: OllamaToolCallType[]) {
    console.log("Model is using tools to help answer...");

    for (const toolCall of toolCalls) {
      const args = this.parseToolArguments(toolCall.function.arguments);
      console.log(`Using tool: ${toolCall.function.name}`);
      //console.log(`With arguments:`, args);

      const parameterMappings = this.toolManager.suggestParameterMapping(
        toolCall.function.name,
        args
      );

      const fixedArgs = this.fixToolArguments(args, parameterMappings);
      const result = await this.toolManager.callTool(
        toolCall.function.name,
        fixedArgs
      );

      if (result) {
        //console.log(`Tool result:`, result.content);

        const resultContent = result.content;
        if (
          Array.isArray(resultContent) &&
          resultContent[0]?.type === "text" &&
          resultContent[0]?.text?.includes("Error")
        ) {
          const toolInfo = this.toolManager.getToolParameterInfo(
            toolCall.function.name
          );

          const errorMessage = this.createDetailedErrorMessage(
            toolCall.function.name,
            resultContent[0].text,
            toolInfo,
            args,
            parameterMappings
          );

          this.messages.push({
            role: "tool",
            content: errorMessage,
            tool_call_id: toolCall.function.name,
          });

          try {
            const errorResponse = await this.ollama.chat({
              model: this.model,
              messages: this.messages as Message[],
              tools: this.toolManager.tools,
            });

            this.messages.push(errorResponse.message as OllamaMessage);

            const newToolCalls = errorResponse.message.tool_calls ?? [];
            if (newToolCalls.length > 0) {
              const currentToolName = toolCall.function.name;
              const hasNewToolCalls = newToolCalls.some(
                (call) =>
                  call.function.name !== currentToolName ||
                  JSON.stringify(call.function.arguments) !==
                    JSON.stringify(toolCall.function.arguments)
              );

              if (hasNewToolCalls) {
                await this.handleToolCalls(newToolCalls);
              } else {
                console.log(
                  "There was an issue with the tool call. Trying again."
                );
                return;
              }
            }
          } catch (error) {
            const err = error as ErrorWithCause;
            if (err.cause?.code === "ECONNREFUSED") {
              throw error;
            }
            console.error(
              "Error handling tool response:",
              err instanceof Error ? err.message : String(err)
            );
          }
          return;
        }

        this.messages.push({
          role: "tool",
          content: formatToolResponse(result.content),
          tool_call_id: toolCall.function.name,
        });
      }
    }

    try {
      const finalResponse = await this.ollama.chat({
        model: this.model,
        messages: this.messages as Message[],
        tools: this.toolManager.tools,
      });

      this.messages.push(finalResponse.message as OllamaMessage);

      console.log("Assistant:", finalResponse.message.content);

      const newToolCalls = finalResponse.message.tool_calls ?? [];
      if (newToolCalls.length > 0) {
        const previousToolNames = new Set(
          toolCalls.map((t) => t.function.name)
        );
        const hasNewTools = newToolCalls.some(
          (call) => !previousToolNames.has(call.function.name)
        );

        if (hasNewTools) {
          await this.handleToolCalls(newToolCalls);
        }
      }
    } catch (error) {
      const err = error as ErrorWithCause;
      if (err.cause?.code === "ECONNREFUSED") {
        throw error;
      }
      console.error(
        "Error getting final response:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * ツールエラー時の詳細なエラーメッセージを生成する
   * @param toolName ツール名
   * @param errorText エラーテキスト
   * @param toolInfo ツールのパラメータ情報
   * @param _providedArgs 提供された引数（未使用）
   * @param suggestedMappings パラメータ名の修正提案
   * @returns フォーマットされたエラーメッセージ
   */
  private createDetailedErrorMessage(
    toolName: string,
    errorText: string,
    toolInfo: OpenAiToolInfo | undefined,
    _providedArgs: Record<string, unknown>,
    suggestedMappings: Record<string, string>
  ): string {
    let message = `Error using tool ${toolName}:\n${errorText}\n\n`;

    if (toolInfo) {
      const params = toolInfo.function.parameters;
      message += `Expected parameters:\n`;
      message += `Required: ${params.required.join(", ")}\n`;
      message += `Available: ${Object.keys(params.properties).join(", ")}\n\n`;

      if (Object.keys(suggestedMappings).length > 0) {
        message += `Suggested parameter mappings:\n`;
        for (const [provided, suggested] of Object.entries(suggestedMappings)) {
          message += `- ${provided} → ${suggested}\n`;
        }
      }
    }

    return message;
  }

  /**
   * ツール引数のパラメータ名を修正する
   * @param args 元の引数
   * @param mappings パラメータ名のマッピング
   * @returns 修正された引数
   */
  private fixToolArguments(
    args: Record<string, unknown>,
    mappings: Record<string, string>
  ): Record<string, unknown> {
    const fixedArgs: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      const mappedKey = mappings[key] || key;
      fixedArgs[mappedKey] = value;
    }

    return fixedArgs;
  }

  /**
   * ツール引数をパースする（文字列の場合はJSONとしてパース）
   * @param args 引数（文字列またはオブジェクト）
   * @returns パースされた引数オブジェクト
   */
  private parseToolArguments(
    args: string | Record<string, unknown>
  ): Record<string, unknown> {
    if (typeof args === "string") {
      try {
        return JSON.parse(args);
      } catch (e) {
        console.error("Failed to parse tool arguments:", e);
        return { value: args };
      }
    }
    return args;
  }

  /** チャットインターフェースとToolManagerをクリーンアップする */
  private cleanup() {
    this.chatInterface.close();
    this.toolManager.cleanup();
  }
}
