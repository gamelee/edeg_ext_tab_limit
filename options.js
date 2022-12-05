function save_options() {
    let options = {
        // empty_first: document.options.empty_first.checked,
        debug: document.options.debug.checked,
        max_count: Number(document.options.max_count.value),
        mode: document.options.mode.value,
    }
    if (options.max_count < 5) {
        notify("修改失败，数量请大于等5")
        return
    }
    chrome.storage.sync.set(options, function (items) {
        chrome.extension.getBackgroundPage().refresh_options()
    });
}


function notify(msg) {
    let oldTitle = document.title; // 保存原有标题
    let times = 1;
    let notice = setInterval(function () {
        if (times % 2) {
            document.title = "通知：" + msg;
        } else {
            document.title = oldTitle;
            if (times > 10) clearInterval(notice)
        }
        times++
    }, 600);
}


(function () {
    document.title = chrome.i18n.getMessage("Name")
    chrome.storage.sync.get({
        mode: 'rnu', //
        max_count: 10,
        debug: false,
    }, function (options) {
        console.log("config options", options)
        // if (options.empty_first) document.options.empty_first.checked = true
        if (options.debug) document.options.debug.checked = true
        document.options.max_count.value = options.max_count
        document.options.mode.value = options.mode

        document.getElementById('save_options').onclick = save_options
    })

})()