class History {
    constructor() {
        this.list = []
        this.map = {}
    }

    rebuild(tabs, options) {
        this.list = []
        this.map = {}
        for (const tab of tabs) {
            this.list.push(tab)
        }

        this.options = options
        this.compareFunc = getCompareFunc(options)

        this.list.sort(this.compareFunc)
        this.map = {}
        for (const i in this.list) {
            this.map[this.list[i].id] = Number(i)
        }
        this.length = this.list.length
    }


    push(tab) {
        let flag = false
        for (let i = 0; i < this.list.length; i++) {
            let c_tab = this.list[i]

            if (flag) {
                this.map[c_tab.id]++
                c_tab.idx++
                continue
            }

            if (!flag && this.compareFunc(tab, c_tab) > 0) {
                continue
            }
            this.list.splice(i, 0, tab)
            this.map[tab.id] = i
            tab.idx = i
            flag = true
        }

        if (!flag) {
            this.map[tab.id] = this.list.push(tab) - 1
            tab.idx = this.map[tab.id]
        }
        this.length++
    }

    pop() {
        if (!this.length) return
        let tab = this.list.shift()
        delete this.map[tab.id]
        this.length--
        for (const c_tab of this.list) {
            this.map[c_tab.id]--
        }
        return tab
    }

    remove(tab_id, err_exit = true) {
        if (!this.get(tab_id, err_exit)) {
            return this.length
        }
        let idx = this.map[tab_id]
        let tab = this.list.splice(idx, 1)
        delete this.map[tab_id]
        this.length--
        for (let i = idx; i < this.length; i++) {
            let tab = this.list[i]
            tab.idx--
            this.map[tab.id]--
        }
        return tab
    }

    get(tab_id, err_exit = true) {
        if (!(tab_id in this.map)) {
            if (err_exit) {
                console.log("未找到指定的 tab ", tab_id)
                throw new Error("未找到指定的 tab " + tab_id)
            }
            return undefined
        }
        return this.list[this.map[tab_id]]
    }

    update(tab) {
        this.get(tab.id)

        let idx = this.map[tab.id]
        this.list[idx] = tab

        if (idx === this.length - 1) return

        let flag = false
        let skip = 0
        for (let i = idx + 1; i < this.length; i++) {
            let c_tab = this.list[i]
            if (this.compareFunc(tab, c_tab) < 0) {
                flag = true
                break
            } else {
                skip++
            }
        }
        // 不需要交换
        if (!skip) return

        for (let i = 0; i < skip; i++) {

            let c_tab = this.list[idx + i + 1]
            this.list[idx + i] = c_tab
            this.map[c_tab.id]--
            c_tab.idx--

        }
        this.list[idx + skip] = tab
        this.map[tab.id] = idx + skip
        tab.idx = idx + skip
    }

    info(...filed) {
        let info = [
            this.length,
            'dat',
            this.list,
        ]
        info.push("field", ...(filed.map(k => {
            return this.list.map(x => x[k])
        })))
        return info
    }

    title() {
        return this.list.map(x => x.title)
    }
}

class TabsManager {
    constructor() {
        this.options = {}
        this.tab = new History()
    }

    set_options(options = defaultOptions) {
        this.options = options
    }

    set_tabs(tabs = []) {
        tabs = tabs.map((x) => this.parse_tab(x, new Date()))
        this.tab.rebuild(tabs, this.options)
    }

    parse_tab(tab, date = new Date()) {
        return {
            id: tab.id,
            title: tab.title,
            window: tab.windowId,
            time: date,
            url: tab.url ?? tab.pendingUrl,
            sort_idx: -1,
            index: tab.index,
        }
    }

    remove(tabId) {
        return this.tab.remove(tabId, false)
    }

    add(tab) {
        tab = this.parse_tab(tab)

        this.tab.push(tab)

        let remove_count = this.tab.length - this.options.max_count
        let r_tabs = []

        while (remove_count > 0 && this.tab.length > 0) {
            let c_tab = this.tab.pop()
            chrome.tabs.remove(c_tab.id)
            r_tabs.push(c_tab)
            remove_count--
        }
        return tab
    }

    update(tabId, {status = "", url = "", title = ""} = {}) {

        if (status === "" && title) {
            status = "update_title"
        }

        if (status === "" || status === "complete") {
            return
        }

        if (status === "loading" && !url) {
            return
        }
        let tab = this.tab.get(tabId, false)

        if (!tab) {
            console.warn("update tab not found", tabId, arguments, this.tab)
            return
        }

        tab.time = Number(new Date())
        title && (tab.title = title)
        url && (tab.url = url)
        this.tab.update(tab)
        return [status, tab]
    }
}

let compareFunctions = {
    ef: (tab1, tab2) => {
        let t1 = tab1.url.includes("://newtab/") ? tab1.time - 4503599627370496 : tab1.time
        let t2 = tab2.url.includes("://newtab/") ? tab2.time - 4503599627370496 : tab2.time
        return Number(t1 - t2)
    },
    // 最少使用
    rnu: (tab1, tab2) => {
        if (tab1.time === tab2.time) {
            return tab1.id - tab2.id
        }
        return Number(tab1.time - tab2.time)
    },
    // 左侧优先
    lf: (tab1, tab2) => {
        return tab1.index - tab2.index
    },
}


function getCompareFunc(options) {
    // let fn1 = options.empty_first ? compareFunctions.ef : () => {
    // }
    let fn2 = options.mode in compareFunctions ? compareFunctions[options.mode] : () => {
    }
    return function (tab1, tab2) {
        // let v = fn1(tab1, tab2)
        // if (v) return v
        return fn2(tab1, tab2)
    }
}


var mgr = new TabsManager()

function refresh_options(fn = undefined) {
    chrome.storage.sync.get({
        mode: 'rnu', //
        max_count: 10,
        debug: false,
    }, function (options) {
        console.log("options", options)
        mgr.set_options(options)
        chrome.tabs.query({currentWindow: true}, function (tabs) {
            mgr.set_tabs(tabs)
            if (fn) fn()
        })
    })
}


function add(tab) {
    tab = mgr.add(tab)
    mgr.options.debug && console.log("add", tab, mgr.tab.title('id', 'title', 'time', "url"))
}

function remove(tab_id) {
    let tab = mgr.remove(tab_id)
    mgr.options.debug && tab instanceof Object && console.log("remove", tab, mgr.tab.title('id', 'title', 'time', "url"))
}

function update() {
    mgr.update(...arguments)
    mgr.options.debug && console.log("update", arguments, mgr.tab.title('id', 'title', 'time', "url"))
}

function active({tabId, windowId}) {
    mgr.update(tabId, {status: "active"})
    mgr.options.debug && console.log("active", tabId, mgr.tab.title('id', 'title', 'time', "url"))
}

(function () {
    refresh_options(() => {
        chrome.tabs.onCreated.addListener(add)
        chrome.tabs.onRemoved.addListener(remove)
        chrome.tabs.onUpdated.addListener(update)
        chrome.tabs.onActivated.addListener(active)
    })
})()

chrome.runtime.onMessage.addListener(({type}) => {
    if (type === "reload") {
        refresh_options()
    }
});