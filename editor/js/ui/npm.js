 /**
 * Copyright 2015 IBM Corp.
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


RED.npmInstallNode = (function() {

    var dialog;
    var dialogContainer;
    var importNodesDialog;

    function setupDialogs(){
        var fakeProgressRunning = false;
        var progressTimer;
        var fakeTimer;
        RED.comms.subscribe("npmInstall",function(topic,msg) {
            if(msg.hasOwnProperty("status")){
                if (msg.status == "success"){
                    success();
                } else if (msg.status == "error"){
                    fail();
                }
            }
            if (msg.hasOwnProperty("progressbarTime")){
                startProgressBar(Number(msg.progressbarTime));
            }
        });
        function closeProgressBar(){
            $("#import-progress-bar").hide();
            $("#import-progress-value").attr("value",0); 
        }
        function startFakeProgressBar(){
            fakeProgressRunning = true;
            var val = $("#import-progress-value").attr("value");
            val = Number(val);
            if(val < 9){
                var nextVal = val+0.025;
                fakeTimer = setTimeout(function(){
                    $("#import-progress-value").attr("value",nextVal);
                    startFakeProgressBar(nextVal);
                },25);
            } else {
                fakeProgressRunning = false;
            }
            
        }

        function startProgressBar(v){
            if (fakeProgressRunning) {
                setTimeout(function(){
                    startProgressBar(v);
                }, 3000);
            } else {
                progressBar(v);
            }
        }

        function progressBar(v){
            var val = $("#import-progress-value").attr("value");
            if (val < 100){                
                var nextVal = Number(val)+0.025;
                var seuil = 85;
                var x;
                if (val < seuil){
                    x = v/4;                                        
                } else {
                    x = (v/4)*Math.exp(val-seuil);
                }
                progressTimer = setTimeout(function(){
                    $("#import-progress-value").attr("value",nextVal);   
                    progressBar(v);
                },x);
            }
        }
        function success() {
            $("#npmInstallNode-dialog-cancel").button("disable");
            $("#npmInstallNode-dialog-reboot").button("enable");
            clearTimeout(fakeTimer);
            clearTimeout(progressTimer);
            setTimeout(function(){
                $("#import-progress-value").attr("value",100);
                setTimeout(closeProgressBar,1000);
            },1000);
        }
        function fail(err) {            
            clearTimeout(fakeTimer);
            clearTimeout(progressTimer);
            $("#npmInstallNode-dialog-cancel").click();
            RED.notify(RED._("npmInstallNode.installFail", {}), "error");                                
            closeProgressBar(); 
        }
        dialog = $('<div id="npmInstallNode-dialog" class="hide"><form class="dialog-form form-horizontal"></form></div>')
            .appendTo("body")
            .dialog({
                modal: true,
                autoOpen: false,
                width: 500,
                resizable: false,
                buttons: [
                    {
                        id: "npmInstallNode-dialog-ok",
                        text: RED._("common.label.ok"),
                        click: function() {                            
                            clearTimeout(fakeTimer);
                            clearTimeout(progressTimer);                            
                            $("#import-progress-value").attr("value",0); 
                            setTimeout(function(){
                                $("#import-progress-value").attr("value",0); 
                                var n = $("#npmInstallNode-import").val();
                                $.post("/npm/install",{node:n});
                                $("#import-progress-bar").show();
                                startFakeProgressBar();
                            },1000);
                        }
                    },
                    {
                        id: "npmInstallNode-dialog-cancel",
                        text: RED._("common.label.cancel"),
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    },
                    {
                        id: "npmInstallNode-dialog-close",
                        text: RED._("common.label.close"),
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    }, 
                    {
        				id : "npmInstallNode-dialog-reboot",
        				text : RED._("common.label.reboot"),
        				click : function () {
        					$.ajax({
        						type : "POST",
        						url : "/inject/restart"
        					}),
        					$(this).dialog("close")
        				}
        			}
                ],
                open: function(e) {
                    if ($("#buttonForOpenConsole").length == 0){
                        var divLink = $("<div></div>",{style:'width: auto; float: left; margin:1em .4em .0em .4em; test-align:center; vertical-align:middle', id: "buttonForOpenConsole"})
                        $('<a />', {text: RED._("menu.label.console"), href: '/log/console.txt', target: "_blank"}).appendTo(divLink);
                        divLink.appendTo($("#npmInstallNode-dialog").parent().find(".ui-dialog-buttonpane").find(".ui-dialog-buttonset"));
                    }
                    $(this).parent().find(".ui-dialog-titlebar-close").hide();
                    $("#import-progress-bar").hide();
                    $("#import-progress-value").attr("value",0); 
                    RED.keyboard.disable();
                },
                close: function(e) {
                    RED.keyboard.enable();
                }
        });

        dialogContainer = dialog.children(".dialog-form");

        importNodesDialog = 
            '<div class="form-row">'+
                '<input style="resize: none; width: 100%; border-radius: 0px;font-family: monospace; font-size: 12px; background:#eee; padding-left: 0.5em; box-sizing:border-box;" '+
                        'id="npmInstallNode-import" '+
                        'rows="5" '+
                        'placeholder="'+RED._("npmInstallNode.pasteNodes")+'" '+
                '/>'+
            '</div>'+
            '<div class="form-row" id="import-progress-bar">'+
                '<progress id="import-progress-value" value="0" min="0" max="100" style="width:100%;height:20px;">' +
                    '0% ' +
                '</progress>'+
            '</div>';
    }

    function validateImport() {
        var importInput = $("#npmInstallNode-import");
        var v = importInput.val();
        try {
            importInput.removeClass("input-error");
        } catch(err) {
            if (v !== "") {
                importInput.addClass("input-error");
            }
        }
    }

    function importNodes() {
        dialogContainer.empty();
        dialogContainer.append($(importNodesDialog));
        $("#npmInstallNode-dialog-ok").show();
        $("#npmInstallNode-dialog-cancel").show();
	$("#npmInstallNode-dialog-reboot").show(),
        $("#npmInstallNode-dialog-close").hide();
	$("#npmInstallNode-dialog-reboot").button("disable"),
        $("#npmInstallNode-import").keyup(validateImport);
        $("#npmInstallNode-import").on('paste',function() { setTimeout(validateImport,10)});

        dialog.dialog("option","title",RED._("npmInstallNode.importNodes")).dialog("open");
    }


    function hideDropTarget() {
        $("#dropTarget").hide();
        RED.keyboard.remove(/* ESCAPE */ 27);
    }

    return {
        init: function() {
            setupDialogs();
            RED.events.on("view:selection-changed",function(selection) {
                if (!selection.nodes) {
                    RED.menu.setDisabled("menu-item-export",true);
                    RED.menu.setDisabled("menu-item-export-clipboard",true);
                    RED.menu.setDisabled("menu-item-export-library",true);
                } else {
                    RED.menu.setDisabled("menu-item-export",false);
                    RED.menu.setDisabled("menu-item-export-clipboard",false);
                    RED.menu.setDisabled("menu-item-export-library",false);
                }
            });


            $('#chart').on("dragenter",function(event) {
                if ($.inArray("text/plain",event.originalEvent.dataTransfer.types) != -1) {
                    $("#dropTarget").css({display:'table'});
                    RED.keyboard.add(/* ESCAPE */ 27,hideDropTarget);
                }
            });

            $('#dropTarget').on("dragover",function(event) {
                if ($.inArray("text/plain",event.originalEvent.dataTransfer.types) != -1) {
                    event.preventDefault();
                }
            })
            .on("dragleave",function(event) {
                hideDropTarget();
            })
            .on("drop",function(event) {
                var data = event.originalEvent.dataTransfer.getData("text/plain");
                hideDropTarget();
                RED.view.importNodes(data);
                event.preventDefault();
            });


        },
        import: importNodes,
    }

})();
