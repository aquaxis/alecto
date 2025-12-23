#!/usr/bin/env node
/**
 * main.ts - ALECTO CLIアプリケーションのエントリーポイント
 *
 * 機能:
 * - ASCIIアートロゴの表示（figlet使用）
 * - グラデーション付きスタートアップメッセージの表示
 * - ChatManagerの初期化と起動
 */

import figlet from 'figlet';
import chalk from 'chalk';
import gradient from 'gradient-string';

import { ChatManager } from "./ChatManager.js";
import { ollamaConfig } from "./config.js";

/**
 * ASCIIアートのALECTOロゴを表示する
 * @returns ロゴ表示完了時に解決するPromise
 */
const displayLogo = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    figlet.text('ALECTO', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 80,
      whitespaceBreak: true
    }, (err, data) => {
      if (err) {
        console.log('Error: Can\'t read logo.\n');
        reject(err);
        return;
      }

      console.clear(); 
      
      const redToPurple = gradient(['#FF0000', '#E30052', '#8B008B']);

      if (data) {
        console.log(redToPurple.multiline(data));
      }

      const line = '--------------------------------------------------';
      console.log(redToPurple(line));
      console.log(chalk.bold.white('   Welcome to ALECTO CLI v0.1.0'));
      console.log(redToPurple(line) + '\n');
      
      resolve();
    });
  });
};

/**
 * 起動メッセージを表示する（1秒後に「Access Granted」を表示）
 * @returns メッセージ表示完了時に解決するPromise
 */
async function showStartupMessage(): Promise<void> {
  return new Promise((resolve) => {
    console.log(chalk.gray('Connecting to server...'));
    setTimeout(() => {
      console.log(chalk.redBright('Access Granted.') + '\n');
      resolve();
    }, 1000);
  });
}

/**
 * アプリケーションのメインエントリーポイント
 * ロゴ表示、起動メッセージ、ChatManagerの初期化と開始を行う
 */
async function main() {
  await displayLogo();
  await showStartupMessage();

  const chatManager = new ChatManager(ollamaConfig);

  try {
    await chatManager.initialize();
    await chatManager.start();
  } catch (error) {
    console.error("Failed to start chat:", error);
  }
}

main().catch(console.error);
