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
    // 诊断日志：确认 WPS 运行时对象是否注入
    console.log('[合同审查] OnAddinLoad called');
    console.log('[合同审查] window.wps:', typeof wps);
    console.log('[合同审查] window.Application:', typeof Application);
}

function OnShowTaskPane(control) {
    var taskpaneUrl = 'https://localhost:3000/taskpane-wps.html';
    console.log('[合同审查] OnShowTaskPane called');
    console.log('[合同审查] wps:', typeof wps, 'Application:', typeof Application);

    try {
        var tsId = wps.PluginStorage.getItem('taskpane_id');
        var tskpane = null;

        if (tsId) {
            // 官方文档拼写：GetTaskpane（小写 p）
            tskpane = wps.GetTaskpane(tsId);
        }

        if (!tskpane) {
            tskpane = wps.CreateTaskPane(taskpaneUrl);
            var id = tskpane.ID;
            wps.PluginStorage.setItem('taskpane_id', id);
            tskpane.Visible = true;
        } else {
            tskpane.Visible = !tskpane.Visible;
        }
    } catch (e) {
        console.error('[合同审查] wps.CreateTaskPane 失败:', e);
        // 回退：尝试通过 Application 对象创建（部分 WPS 版本的路径）
        try {
            if (typeof Application !== 'undefined' && Application.CreateTaskPane) {
                var pane = Application.CreateTaskPane(taskpaneUrl);
                pane.Visible = true;
            } else {
                console.error('[合同审查] Application.CreateTaskPane 也不可用');
            }
        } catch (e2) {
            console.error('[合同审查] 回退方案也失败:', e2);
        }
    }
}
