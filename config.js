/*
 * 
**/

export const config = {
    // スニペット展開のトリガーとなる文字
    // KeyCode 187 or Key: ";")
    TRIGGER_KEY: ';',

    LOGGER_MAX: 50 ,

    debugMode: false
};
//
export async function getDebugMode() {
    const mode = await chrome.storage.local.get("debugMode");
    return mode.debugMode ?? false;
}
//
export function setDebugMode() {
    return chrome.storage.local.set({ debugMode: value});
}
