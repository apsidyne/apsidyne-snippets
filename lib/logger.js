/**
 * Logger Module
 * 1. リリース時は、Info/Debug off
 * 2. Errorはストレージにも残す（事後解析用）。
 * 3. デバッグモードで詳細ログ
 *  @author Apsidyne+ext2025[at]gmail(dot)com
 */
import { config, getDebugMode } from '../config.js';

let isSaving = false;   // エラーログ保存処理中
let logQueue = [];      // エラーログ一時まとめ

export class Logger {
    constructor(sourceName) {
        this.source = sourceName; // どのモジュールからのログか（例: 'Content', 'Options'）
        this.isDebug = config.debugMode;     // デバッグモードフラグ
        
        // 設定読み込み（非同期、初期化直後のログ漏れ許容）
        this.init();
    }

    async init() {
        // ストレージからデバッグ設定を読み込む
        // chrome.storageが使える環境（拡張機能内）かチェック
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['debugMode'], (result) => {
                this.isDebug = !!result.debugMode;
                if (this.isDebug) {
                    console.log(`[${this.source}] Debug Mode Enabled 🐛`);
                }
            });
            
            // 設定変更を監視（オプション画面でON/OFFした瞬間に反映）
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.debugMode) {
                    this.isDebug = changes.debugMode.newValue;
                    console.log(`[${this.source}] Debug Mode changed to: ${this.isDebug}`);
                }
            });
        }
    }

    /**
     * 詳細情報（開発用）
     * デバッグモードOFF時は出力されない
     */
    debug(message, ...args) {
        if (!this.isDebug) return;
        
        // スタイル付きログ
        console.debug(
            `%c[${this.source}]%c ${message}`, 
            'color: #888; font-weight: bold;', 
            'color: inherit;', 
            ...args
        );
    }

    /**
     * 一般情報（操作履歴など）
     * デバッグモードOFF時は出力されない
     */
    info(message, ...args) {
        if (!this.isDebug) return;

        console.info(
            `%c[${this.source}]%c ${message}`, 
            'color: #2196F3; font-weight: bold;', 
            'color: inherit;', 
            ...args
        );
    }

    /**
     * 警告
     * 常に表示するが、処理は継続するレベル
     */
    warn(message, ...args) {
        console.warn(
            `%c[${this.source}]%c ${message}`, 
            'color: #FF9800; font-weight: bold;', 
            'color: inherit;', 
            ...args
        );
    }

    /**
     * エラー
     * 常に表示し、かつ解析用に永続化（ストレージ保存）を検討すべきレベル
     */
    error(message, errorObj = null) {
        console.error(
            `%c[${this.source}]%c ${message}`, 
            'color: #F44336; font-weight: bold;', 
            'color: inherit;', 
            errorObj || ''
        );

        // 【高度な運用】エラーログをストレージに保存する処理
        // ここに実装することで、ユーザーから「動かない」と言われた時に
        // 「オプション画面からエラーログをコピーして送ってください」と言えるようになる
        this.saveErrorLog(message, errorObj);
    }

    /**
     * 内部用：エラーログ保存
     */
    async saveErrorLog(msg, errObj) {
        if (typeof chrome === 'undefined' || !chrome.storage) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            source: this.source,
            message: msg,
            stack: errObj && errObj.stack ? errObj.stack : String(errObj)
        };

        // キューに追加
        logQueue.push(logEntry);
        
        // 保存処理を実行
        this.processQueue();
    }

    async processQueue() {
        if (isSaving || logQueue.length === 0) return;

        isSaving = true; // ロック取得

        try {
            // ストレージから最新を取得
            const result = await chrome.storage.local.get(['errorLogs']);
            let logs = result.errorLogs || [];
            
            // キューの中身を全てマージ
            while(logQueue.length > 0) {
                logs.push(logQueue.shift());
            }

            // 最大件数制限（溢れたら古いものから削除）
            if (logs.length > config.LOGGER_MAX) {
                logs = logs.slice(logs.length - config.LOGGER_MAX);
            }

            // 書き込み
            await chrome.storage.local.set({ errorLogs: logs });
            
        } catch (e) {
            console.error("ログ保存中にエラー:", e);
        } finally {
            isSaving = false; // ロック解放
            
            // 処理中に新たなログが積まれたか再チェック
            if (logQueue.length > 0) {
                this.processQueue();
            }
        }
    }

}
