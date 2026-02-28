/**
 * wps-addin/main.js
 * WPS 插件加载的回调脚本
 */

function OnAddinLoad(ribbonUI) {
    if (typeof wps.ribbonUI !== "undefined") {
        wps.ribbonUI = ribbonUI;
    }
}

function OnShowTaskPane(control) {
    var tsId = wps.PluginStorage.getItem("taskpane_id");
    // 本地开发调试地址，若是线上打包请修改为对应的静态页面地址
    var taskpaneUrl = "https://localhost:3000/taskpane-wps.html";

    if (!tsId) {
        var tskpane = wps.CreateTaskPane(taskpaneUrl);
        var id = tskpane.ID;
        wps.PluginStorage.setItem("taskpane_id", id);
        tskpane.Visible = true;
    } else {
        var tskpane = wps.GetTaskPane(tsId);
        // Toggle 可见性
        tskpane.Visible = !tskpane.Visible;
    }
}
