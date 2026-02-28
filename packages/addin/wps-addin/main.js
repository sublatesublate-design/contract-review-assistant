/**
 * wps-addin/main.js
 * WPS 插件加载的回调脚本（wpsjs 框架标准格式）
 */

var ribbonUI = null;

function OnAddinLoad(ribbon) {
    ribbonUI = ribbon;
    if (typeof wps.ribbonUI !== 'undefined') {
        wps.ribbonUI = ribbon;
    }
}

function OnShowTaskPane(control) {
    var tsId = wps.PluginStorage.getItem('taskpane_id');
    // index.html 是本插件目录自带的入口页，由 WPS 直接加载（不依赖 dev server 端口）
    // 注意：WPS 会把插件目录下的 index.html 以 file:// 或内嵌方式打开
    var taskpaneUrl = 'https://localhost:3000/taskpane-wps.html';

    if (!tsId) {
        var tskpane = wps.CreateTaskPane(taskpaneUrl);
        var id = tskpane.ID;
        wps.PluginStorage.setItem('taskpane_id', id);
        tskpane.Visible = true;
    } else {
        var tskpane = wps.GetTaskPane(tsId);
        tskpane.Visible = !tskpane.Visible;
    }
}
