class History {
    constructor(tabs, options) {
        this.list = []
        this.map = {}
        for (const tab of tabs) {
            this.list.push(tab)
        }
        this.rebuild(options)
    }

    rebuild(options) {

        this.options = options
        this.compareFunc = getCompareFunc(options)

        this.list.sort(this.compareFunc)
        this.map = {}
        for (const i in this.list) {
            this.map[this.list[i].id] = Number(i)
        }
        this.length = this.list.length
    }

    compareFunc(tabA, tabB) {
        if (this.options.empty_first) {
            let ia = tabA.url.includes("://newtab/")
            let ib = tabB.url.includes("://newtab/")
            if (ia) {
                return -1
            }
            if (ib) {
                return 1
            }
        }

        if (tabA.time === tabB.time) {
            return tabA.id - tabB.id
        }
        return tabA.time - tabB.time
    }

    push(tab) {
        let flag = false
        for (let i = 0; i < this.list.length; i++) {
            let c_tab = this.list[i]

            if (flag) {
                this.map[c_tab.id]++
                continue
            }

            if (!flag && this.compareFunc(tab, c_tab) >= 0) {
                continue
            }

            this.list.splice(i, 0, tab)
            this.map[tab.id] = i
            flag = true
        }

        !flag && (this.map[tab.id] = this.list.push(tab) - 1)
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
        this.list.splice(idx, 1)
        delete this.map[tab_id]
        this.length--
        for (let i = idx; i < this.length; i++) {
            let tab = this.list[i]
            this.map[tab.id]--
        }
        return this.length
    }

    get(tab_id, err_exit = true) {
        if (!(tab_id in this.map)) {
            if (err_exit) {
                console.log(this.name, "未找到指定的 tab ", tab_id)
                throw new Error(this.name + " 未找到指定的 tab " + tab_id)
            }
            return undefined
        }
        return this.list[this.map[tab_id]]
    }

    update(tab) {
        this.get(tab.id)

        let idx = this.map[tab.id]

        if (idx === this.length - 1) return

        let flag = false
        let i = idx + 1
        for (; i < this.length; i++) {
            let c_tab = this.list[i]
            if (this.compareFunc(tab, c_tab) < 0) {
                flag = true
                break
            }
        }
        for (let j = idx; j < i - 1; j++) {
            let c_tab = this.list[j + 1]
            this.list[j] = c_tab
            this.map[c_tab.id]--

        }
        this.list[i - 1] = tab
        this.map[tab.id] = i - 1
    }

    info() {
        return [
            this.length,
            this.list.length,
            Object.keys(this.map).length,
            this.list,
            this.map,
        ]
    }
}

class TabsManager {
    constructor(tabs, options) {
        this.options = options
        this.start_time =
            tabs = tabs.map((x) => this.parse_tab(x, new Date()))
        this.tab = new History(tabs, options)
        console.log(this.tab.info())
    }

    parse_tab(tab, date = new Date()) {
        tab = Object.assign({}, tab)
        tab.time = Number(date)
        tab.c_url = tab.url ?? tab.pendingUrl
        delete tab["favIconUrl"]
        return tab
    }

    remove(tabId) {
        this.tab.remove(tabId, false)
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
        r_tabs.length > 0 && console.log("remove full", r_tabs)
        return tab
    }

    update(tabId, {status = "", url = "", title = ""} = {}) {

        if (status === "") {
            return
        }

        let tab = this.tab.get(tabId, false)

        if (!tab) {
            console.warn("update tab not found", tabId, arguments)
            return
        }

        tab.time = Number(new Date())
        title && (tab.title = title)
        url && (tab.c_url = url)
        this.tab.update(tab)
        return tab
    }

}

let compareFunctions = {
    ef: (tab1, tab2) => {
        let ia = tab1.c_url.includes("://newtab/")
        let ib = tab2.c_url.includes("://newtab/")
        if (ia) {
            return -1
        }
        if (ib) {
            return 1
        }
        return 0
    },
    // 最少使用
    rnu: (tab1, tab2) => {
        if (tab1.time === tab2.time) {
            return tab1.id - tab2.id
        }
        return tab1.time - tab2.time
    },
    // 左侧优先
    lf: (tab1, tab2) => {
        return tab1.index - tab2.index
    },
}


function getCompareFunc(options) {
    let fn1 = options.empty_first ? compareFunctions.ef : () => {
    }
    let fn2 = options.mode in compareFunctions ? compareFunctions[options.mode] : () => {
    }
    return function (tab1, tab2) {
        let v = fn1(tab1, tab2)
        if (v) return v
        return fn2(tab1, tab2)
    }
}

let mgr = undefined

function refresh_options() {
    chrome.storage.sync.get(defaultOptions, function (options) {
        console.log("options", options)
        chrome.tabs.query({currentWindow: true}, function (tabs) {
            mgr = new TabsManager(tabs, options)
            chrome.tabs.onCreated.addListener(log(mgr.add))
            chrome.tabs.onRemoved.addListener(log(mgr.remove))
            chrome.tabs.onUpdated.addListener(log(mgr.update))
            chrome.tabs.onActivated.addListener(log(active))
        })
    })
}


function log(fn) {

    return function () {

        let rst = fn.apply(mgr, arguments)
        if (mgr.options.debug) {
            console.log("debug", fn.name, rst, arguments, mgr.tab.info())
            console.log("sort", mgr.tab.length, mgr.tab.list.map(x => x.title))
        }
        return rst
    }
}


function active({tabId, windowId}) {
    mgr.update(tabId, {status: "active"})
}

(function () {
    refresh_options()
})()