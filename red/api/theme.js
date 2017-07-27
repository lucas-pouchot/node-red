/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var express = require("express");
var util = require("util");
var path = require("path");
var fs = require("fs");
var clone = require("clone");

var defaultContext = {
    page: {
        title: "Node-RED",
        favicon: "favicon.ico",
        tabicon: "red/images/node-red-icon-black.svg"
    },
    header: {
        title: "Node-RED",
        image: "red/images/node-red.png"
    },
    asset: {
        red_min: "red/red.min.js",
        red: "red/red.js",
        red_main_min: "red/main.min.js",
        red_main: "red/main.js",
        red_events: "red/events.js",
        red_i18n: "red/i18n.js",
        red_settings: "red/settings.js",
        red_user: "red/user.js",
        red_comms: "red/comms.js",
        red_text_bidi: "red/text/bidi.js",
        red_text_format: "red/text/format.js",
        red_ui_state: "red/ui/state.js",
        red_nodes: "red/nodes.js",
        red_history: "red/history.js",
        red_validators: "red/validators.js",
        red_ui_utils: "red/ui/utils.js",
        red_ui_common_editableList: "red/ui/common/editableList.js",
		red_ui_common_checkboxSet: "red/ui/common/checkboxSet.js",
        red_ui_common_menu: "red/ui/common/menu.js",
		red_ui_common_panels: "red/ui/common/panels.js",
        red_ui_common_popover: "red/ui/common/popover.js",
        red_ui_common_searchBox: "red/ui/common/searchBox.js",
        red_ui_common_tabs: "red/ui/common/tabs.js",
		red_ui_common_stack: "red/ui/common/stack.js",
        red_ui_common_typedInput: "red/ui/common/typedInput.js",
        red_ui_actions: "red/ui/actions.js",
        red_ui_deploy: "red/ui/deploy.js",
        red_ui_diff: "red/ui/diff.js",
        red_ui_keyboard: "red/ui/keyboard.js",
        red_ui_workspaces: "red/ui/workspaces.js",
        red_ui_view: "red/ui/view.js",
        red_ui_sidebar: "red/ui/sidebar.js",
        red_ui_palette: "red/ui/palette.js",
        red_ui_tab_info: "red/ui/tab-info.js",
        red_ui_tab_config: "red/ui/tab-config.js",
        red_ui_palette_editor: "red/ui/palette-editor.js",
        red_ui_npm: "red/ui/npm.js",
        red_ui_editor: "red/ui/editor.js",
        red_ui_tray: "red/ui/tray.js",
        red_ui_clipboard: "red/ui/clipboard.js",
        red_ui_library: "red/ui/library.js",
        red_ui_notifications: "red/ui/notifications.js",
        red_ui_thingboxSettings: "red/ui/thingboxSettings.js",
        red_ui_typeSearch: "red/ui/typeSearch.js",
        red_ui_search: "red/ui/search.js",
        red_ui_subflow: "red/ui/subflow.js",
        red_ui_userSettings: "red/ui/userSettings.js",
        red_ui_touch_radialMenu: "red/ui/touch/radialMenu.js"
    },
    compressedBuild: true
};

var theme = null;
var themeContext = clone(defaultContext);
var themeSettings = null;
var runtime = null;

var themeApp;

function serveFile(app,baseUrl,file) {
    try {
        var stats = fs.statSync(file);
        var url = baseUrl+path.basename(file);
        //console.log(url,"->",file);
        app.get(url,function(req, res) {
            res.sendFile(file);
        });
        return "theme"+url;
    } catch(err) {
        //TODO: log filenotfound
        return null;
    }
}

function serveFilesFromTheme(themeValue, themeApp, directory) {
    var result = [];
    if (themeValue) {
        var array = themeValue;
        if (!util.isArray(array)) {
            array = [array];
        }

        for (var i=0;i<array.length;i++) {
            var url = serveFile(themeApp,directory,array[i]);
            if (url) {
                result.push(url);
            }
        }
    }
    return result
}

module.exports = {
    init: function(runtime) {
        var settings = runtime.settings;
        themeContext = clone(defaultContext);
        if (runtime.version) {
            themeContext.version = runtime.version();
        }
        if(settings.hasOwnProperty("SKIP_BUILD_CHECK") && settings.SKIP_BUILD_CHECK === true){
            themeContext.compressedBuild = false;
        }
        themeSettings = null;
        theme = settings.editorTheme || {};
    },

    app: function() {
        var i;
        var url;
        themeSettings = {};

        themeApp = express();

        if (theme.page) {

            themeContext.page.css = serveFilesFromTheme(
                theme.page.css,
                themeApp,
                "/css/")
            themeContext.page.scripts = serveFilesFromTheme(
                theme.page.scripts,
                themeApp,
                "/scripts/")

            if (theme.page.favicon) {
                url = serveFile(themeApp,"/favicon/",theme.page.favicon)
                if (url) {
                    themeContext.page.favicon = url;
                }
            }

            if (theme.page.tabicon) {
                url = serveFile(themeApp,"/tabicon/",theme.page.tabicon)
                if (url) {
                    themeContext.page.tabicon = url;
                }
            }

            themeContext.page.title = theme.page.title || themeContext.page.title;
        }

        if (theme.header) {

            themeContext.header.title = theme.header.title || themeContext.header.title;

            if (theme.header.hasOwnProperty("url")) {
                themeContext.header.url = theme.header.url;
            }

            if (theme.header.hasOwnProperty("image")) {
                if (theme.header.image) {
                    url = serveFile(themeApp,"/header/",theme.header.image);
                    if (url) {
                        themeContext.header.image = url;
                    }
                } else {
                    themeContext.header.image = null;
                }
            }
        }

        if (theme.deployButton) {
            if (theme.deployButton.type == "simple") {
                themeSettings.deployButton = {
                    type: "simple"
                }
                if (theme.deployButton.label) {
                    themeSettings.deployButton.label = theme.deployButton.label;
                }
                if (theme.deployButton.icon) {
                    url = serveFile(themeApp,"/deploy/",theme.deployButton.icon);
                    if (url) {
                        themeSettings.deployButton.icon = url;
                    }
                }
            }
        }

        if (theme.hasOwnProperty("userMenu")) {
            themeSettings.userMenu = theme.userMenu;
        }

        if (theme.login) {
            if (theme.login.image) {
                url = serveFile(themeApp,"/login/",theme.login.image);
                if (url) {
                    themeContext.login = {
                        image: url
                    }
                }
            }
        }

        if (theme.hasOwnProperty("menu")) {
            themeSettings.menu = theme.menu;
        }

        if (theme.hasOwnProperty("palette")) {
            themeSettings.palette = theme.palette;
        }
        return themeApp;
    },
    context: function() {
        return themeContext;
    },
    settings: function() {
        return themeSettings;
    },
    serveFile: function(baseUrl,file) {
        return serveFile(themeApp,baseUrl,file);
    }
}
