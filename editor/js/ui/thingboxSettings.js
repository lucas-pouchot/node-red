
RED.thingboxSettings = (function() {

	function init() {
	    RED.userSettings.add({
            id:'thingboxSettings',
            title: 'Params',
            get: getSettingsPane
        })

        RED.actions.add("core:show-user-ttbsettings",function() {
            RED.userSettings.show('thingboxSettings');
        });
    }

    function getSettingsPane() {
    	var pane = $('<div id="user-settings-tab-thingboxSettings"></div>');
        var iframeParam = $('<iframe>', {
           src: '/form/settings',
           id:  'thingboxSettings-iframe',
           frameborder: 0,
           width: '100%',
           scrolling: 'auto'
        })
        iframeParam.load(function() {
            $(this).height(Number($("#user-settings-tabs-content").height())-6);
        });
        iframeParam.appendTo(pane);
    	return pane;
    }

    return {
        init: init
    }

})();