/**
 * wps-addin/main.js
 * WPS 插件加载的回调脚本（wpsjs 框架标准格式）
 */

var ribbonUI = null;

function OnAddinLoad(ribbon) {
    ribbonUI = ribbon;
    if (typeof wps !== 'undefined' && typeof wps.ribbonUI !== 'undefined') {
        wps.ribbonUI = ribbon;
    }
    console.log('[法律写作审校] OnAddinLoad called');
    return true;
}

function OnShowTaskPane(control) {
    var taskpaneUrl = 'https://localhost:3000/taskpane-wps.html?wpsCacheBust=' + Date.now();
    console.log('[法律写作审校] OnShowTaskPane called');

    try {
        var taskpane = null;

        try {
            if (typeof wps !== 'undefined' && wps.PluginStorage) {
                wps.PluginStorage.removeItem('taskpane_id');
            }
        } catch (e) {
            console.warn('[法律写作审校] 清理旧 taskpane_id 失败:', e);
        }

        if (!taskpane) {
            if (typeof wps !== 'undefined' && typeof wps.CreateTaskPane === 'function') {
                taskpane = wps.CreateTaskPane(taskpaneUrl);
                if (taskpane && taskpane.ID && wps.PluginStorage) {
                    wps.PluginStorage.setItem('taskpane_id', taskpane.ID);
                }
            } else if (typeof Application !== 'undefined' && typeof Application.CreateTaskPane === 'function') {
                taskpane = Application.CreateTaskPane(taskpaneUrl);
            } else {
                console.error('[法律写作审校] 当前环境不支持 CreateTaskPane');
                return false;
            }
        }

        if (taskpane) {
            taskpane.Visible = true;
        }

        return true;
    } catch (e) {
        console.error('[法律写作审校] 打开任务窗格失败:', e);
        return false;
    }
}

console.log('[法律写作审校] main.js loaded');

(function () {
    var globalObj = null;

    if (typeof window !== 'undefined') {
        globalObj = window;
    } else if (typeof globalThis !== 'undefined') {
        globalObj = globalThis;
    } else if (typeof self !== 'undefined') {
        globalObj = self;
    } else {
        globalObj = Function('return this')();
    }

    globalObj.OnAddinLoad = OnAddinLoad;
    globalObj.OnShowTaskPane = OnShowTaskPane;

    console.log('[法律写作审校] OnAddinLoad 已挂载:', typeof globalObj.OnAddinLoad);
    console.log('[法律写作审校] OnShowTaskPane 已挂载:', typeof globalObj.OnShowTaskPane);
})();
