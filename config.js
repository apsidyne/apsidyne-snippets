/*
 * 
**/


// cache
let cachedDebugMode = null;

export const config = {
    // スニペット展開のトリガーとなる文字
    // KeyCode 187 or Key: ";")
    TRIGGER_KEY: ';',

    LOGGER_MAX: 50 ,

    debugMode: false
};
//
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.debugMode) {
        cachedDebugMode = changes.debugMode.newValue;
        console.log(`[Config] debugMode updateed to : ${cachedDebugMode}`);
    }
});
//
export async function getDebugMode() {
    if (cachedDebugMode === null) {
        const mode = await chrome.storage.local.get("debugMode");
        cachedDebugMode = mode.debugMode ?? false;
    }
    return cachedDebugMode;
}
//
export function setDebugMode(value) {
    cachedDebugMode = value;
    return chrome.storage.local.set({ debugMode: value});
}
