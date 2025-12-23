/**
 * toolTypes.ts - ツール関連の型定義とユーティリティ
 *
 * 機能:
 * - ToolCall インターフェースの定義
 * - ツールレスポンスのフォーマット関数
 */

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * ツールレスポンスを文字列にフォーマットする
 * @param responseContent ツールからのレスポンス内容（配列または任意の値）
 * @returns フォーマットされた文字列
 */
export function formatToolResponse(responseContent: any): string {
  if (Array.isArray(responseContent)) {
    return responseContent
      .filter((item: any) => item && item.type === "text")
      .map((item: any) => item.text || "No content")
      .join("\n");
  }
  return String(responseContent);
}
