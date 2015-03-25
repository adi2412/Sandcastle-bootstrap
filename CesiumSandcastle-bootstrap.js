/*global require,Blob,CodeMirror,JSHINT*/
/*global gallery_demos*/// defined by gallery/gallery-index.js, created by build
/*global sandcastleJsHintOptions*/// defined by jsHintOptions.js, created by build
require({
    baseUrl : '.',
    shim : {
        bootstrap : { "deps" :['jquery'] }
    },
    paths: {
        jquery: '//code.jquery.com/jquery-1.11.2.min',
        jqueryMousewheel: 'ThirdParty/jquery.mousewheel/jquery.mousewheel.min',
        bootstrap: 'ThirdParty/bootstrap-3.3.2/js/bootstrap.min'
    },
    packages : [{
        name: 'bootstrap',
        location: 'ThirdParty/bootstrap-3.3.2/js'
    }, {
        name : 'Source',
        location : './Source'
    }, {
        name : 'CodeMirror',
        location : 'ThirdParty/codemirror-4.6'
    }]
}, [
        'jquery',
        'jqueryMousewheel',
        'Source/Cesium',
        'CodeMirror/lib/codemirror',
        'CodeMirror/addon/hint/show-hint',
        'CodeMirror/addon/hint/javascript-hint',
        'CodeMirror/mode/javascript/javascript',
        'CodeMirror/mode/css/css',
        'CodeMirror/mode/xml/xml',
        'CodeMirror/mode/htmlmixed/htmlmixed',
        'bootstrap'
    ], function(
        $,
        mousewheel,
        Cesium,
        CodeMirror) {
    "use strict";

    //In order for CodeMirror auto-complete to work, Cesium needs to be defined as a global.
    window.Cesium = Cesium;

    function defined(value) {
        return value !== undefined;
    }

    var numberOfNewConsoleMessages = 0;

    var logOutput = document.getElementById('logOutput');
    function appendConsole(className, message, showConsole) {
        var ele = document.createElement('span');
        ele.className = className;
        ele.textContent = message + '\n';
        logOutput.appendChild(ele);
        logOutput.parentNode.scrollTop = logOutput.clientHeight + 8 - logOutput.parentNode.clientHeight;
        if (showConsole) {
            hideGallery();
        } else {
            ++numberOfNewConsoleMessages;
            $('#bottomPanel a[href=#logContainer]').text('Console (' + numberOfNewConsoleMessages + ')');
        }
    }

    var URL = window.URL || window.webkitURL;

    function findCssStyle(selectorText) {
        for (var iSheets = 0, lenSheets = document.styleSheets.length; iSheets < lenSheets; ++iSheets) {
            var rules = document.styleSheets[iSheets].cssRules;
            for (var iRules = 0, lenRules = rules.length; iRules < lenRules; ++iRules) {
                if (rules[iRules].selectorText === selectorText) {
                    return rules[iRules];
                }
            }
        }
    }

    var jsEditor;
    var htmlEditor;
    var suggestButton = $('#buttonSuggest');
    var docTimer;
    var docTabs = {};
    var subtabs = {};
    var docError = false;
    var galleryError = false;
    var galleryTooltipTimer;
    var activeGalleryTooltipDemo;
    var demoTileHeightRule = findCssStyle('.demoTileThumbnail');
    var cesiumTabs = $('#cesiumTabs');
    var cesiumContainer = $('#cesiumContainer');
    var docNode = $('#docPopup');
    var docMessage = $('#docPopupMessage');
    var local = {
        'docTypes' : [],
        'headers' : '<html><head></head><body>',
        'bucketName' : '',
        'emptyBucket' : ''
    };
    var bucketTypes = {};
    var demoTooltips = {};
    var errorLines = [];
    var highlightLines = [];
    var searchTerm = '';
    var searchRegExp;
    var hintTimer;
    var currentTab = '';
    var newDemo;

    var galleryErrorMsg = document.createElement('span');
    galleryErrorMsg.className = 'galleryError';
    galleryErrorMsg.style.display = 'none';
    galleryErrorMsg.textContent = 'No demos match your search terms.';

    var bucketFrame = document.getElementById('bucketFrame');
    // var bucketPane = registry.byId('bucketPane');
    var bucketWaiting = false;

    $.ajax({
        url : 'Documentation/types.txt',
        dataType : 'json',
        error : function(error) {
            docError = true;
        }
    }).done(function(value) {
        local.docTypes = value;
    });

    var decoderSpan = document.createElement('span');
    function encodeHTML(text) {
        decoderSpan.textContent = text;
        text = decoderSpan.innerHTML;
        decoderSpan.innerHTML = '';
        return text;
    }
    function decodeHTML(text) {
        decoderSpan.innerHTML = text;
        text = decoderSpan.textContent;
        decoderSpan.innerHTML = '';
        return text;
    }

    function highlightRun() {
        domClass.add(registry.byId('buttonRun').domNode, 'highlightToolbarButton');
    }

    function clearRun() {
        domClass.remove(registry.byId('buttonRun').domNode, 'highlightToolbarButton');
    }

    function registerClose(title) {
        $('#cesiumTabs a[href="#'+title+'Pane"] span.close').click(function(){
            var docID = $(this).parent().attr("href");
            if($(this).parent().parent().hasClass("active"))
                $('#cesiumTabs a:first').tab('show');
            $(this).parent().parent().remove();
            $(docID).remove();
            docTabs[title] = undefined;
        });
    }

    function openDocTab(title, link) {
        // Bootstrap doesn't play nice with periods in tab IDs.
        var escapeTitle = title.replace('.','_');
        if (!defined(docTabs[escapeTitle])) {
            var docTab = '<li role="presentation"><a href="#'+escapeTitle+'Pane" class="docTab" aria-controls="'+escapeTitle+'Pane" role="tab" data-toggle="tab">' + title + '<span class="close">x</span></a></li>';
            var docTabPane = '<div role="tabpanel" class="tab-pane" id="'+escapeTitle+'Pane"><iframe class="fullFrame" src="' + link + '"></iframe></div>';
            cesiumTabs.append(docTab);
            cesiumContainer.append(docTabPane);
            registerClose(escapeTitle);
            docTabs[escapeTitle] = docTab;
            $('#'+escapeTitle+'Pane iframe').onload = function(){
                this.onload = function(){
                };
                this.src = link;
            };
            // After the iframe loads, re-scroll to selected field.
            $('#cesiumTabs a[href="#'+escapeTitle+'Pane"]').tab('show');
        } else {
            // Tab already exists, but maybe not visible.  Firefox needs the tab to
            // be revealed before a re-scroll can happen.  Chrome works either way.
            $('#cesiumTabs a[href="#'+escapeTitle+'Pane"]').tab('show');
            $('#'+escapeTitle+'Pane iframe').src = link;
        }
    }

    function showDocPopup() {
        var selectedText = jsEditor.getSelection();
        var lowerText = selectedText.toLowerCase();

        var onDocClick = function() {
            openDocTab(this.textContent, this.href);
            return false;
        };

        docTimer = undefined;
        if (docError && selectedText && selectedText.length < 50) {
            hideGallery();
        } else if (lowerText && lowerText in local.docTypes && typeof local.docTypes[lowerText].push === 'function') {
            docMessage.text('');
            for (var i = 0, len = local.docTypes[lowerText].length; i < len; ++i) {
                var member = local.docTypes[lowerText][i];
                var ele = document.createElement('a');
                ele.target = '_blank';
                ele.textContent = member.replace('.html', '').replace('module-', '').replace('#', '.');
                ele.href = 'Documentation/' + member;
                ele.onclick = onDocClick;
                docMessage.append(ele);
            }
            jsEditor.addWidget(jsEditor.getCursor(true), docNode.get(0));
            docNode.css('top', (parseInt(docNode.css('top'), 10) - 5) + 'px');
            $('#docPopup').tooltip('show');
        }
    }

    function onCursorActivity() {
        docNode.css('left', '-999px');
        if (defined(docTimer)) {
            window.clearTimeout(docTimer);
        }
        docTimer = window.setTimeout(showDocPopup, 500);
    }

    function makeLineLabel(msg, className) {
        var element = document.createElement('abbr');
        element.className = className;
        element.innerHTML = '&nbsp;';
        element.title = msg;
        return element;
    }

    function setDemoTooltip(demoLink, desc) {
        $(demoLink).attr('data-toggle', 'tooltip');
        $(demoLink).attr('data-delay', 220);
        $(demoLink).attr('data-title', desc);
    }

    function scriptLineToEditorLine(line) {
        // editor lines are zero-indexed, plus 3 lines of boilerplate
        return line - 4;
    }

    function clearErrorsAddHints() {
        var line;
        var i;
        var len;
        hintTimer = undefined;
        jsEditor.clearGutter('hintGutter');
        jsEditor.clearGutter('highlightGutter');
        jsEditor.clearGutter('errorGutter');
        jsEditor.clearGutter('searchGutter');
        while (errorLines.length > 0) {
            line = errorLines.pop();
            jsEditor.removeLineClass(line, 'text');
        }
        while (highlightLines.length > 0) {
            line = highlightLines.pop();
            jsEditor.removeLineClass(line, 'text');
        }
        var code = jsEditor.getValue();
        if (searchTerm !== '') {
            var codeLines = code.split('\n');
            for (i = 0, len = codeLines.length; i < len; ++i) {
                if (searchRegExp.test(codeLines[i])) {
                    line = jsEditor.setGutterMarker(i, 'searchGutter', makeLineLabel('Search: ' + searchTerm, 'searchMarker'));
                    jsEditor.addLineClass(line, 'text', 'searchLine');
                    errorLines.push(line);
                }
            }
        }
        // make a copy of the options, JSHint modifies the object it's given
        var options = JSON.parse(JSON.stringify(sandcastleJsHintOptions));
        if (!JSHINT(getScriptFromEditor(false), options)) {
            var hints = JSHINT.errors;
            for (i = 0, len = hints.length; i < len; ++i) {
                var hint = hints[i];
                if (hint !== null && defined(hint.reason) && hint.line > 0) {
                    line = jsEditor.setGutterMarker(scriptLineToEditorLine(hint.line), 'hintGutter', makeLineLabel(hint.reason, 'hintMarker'));
                    jsEditor.addLineClass(line, 'text', 'hintLine');
                    errorLines.push(line);
                }
            }
        }
    }

    function scheduleHint() {
        if (defined(hintTimer)) {
            window.clearTimeout(hintTimer);
        }
        hintTimer = setTimeout(clearErrorsAddHints, 550);
        highlightRun();
    }

    function scheduleHintNoChange() {
        if (defined(hintTimer)) {
            window.clearTimeout(hintTimer);
        }
        hintTimer = setTimeout(clearErrorsAddHints, 550);
    }

    function scrollToLine(lineNumber) {
        if (defined(lineNumber)) {
            jsEditor.setCursor(lineNumber);
            // set selection twice in order to force the editor to scroll
            // to this location if the cursor is already there
            jsEditor.setSelection({
                line : lineNumber - 1,
                ch : 0
            }, {
                line : lineNumber - 1,
                ch : 0
            });
            jsEditor.focus();
            jsEditor.setSelection({
                line : lineNumber,
                ch : 0
            }, {
                line : lineNumber,
                ch : 0
            });
        }
    }

    function highlightLine(lineNum) {
        var line;
        jsEditor.clearGutter('highlightGutter');
        while (highlightLines.length > 0) {
            line = highlightLines.pop();
            jsEditor.removeLineClass(line, 'text');
        }
        if (lineNum > 0) {
            lineNum = scriptLineToEditorLine(lineNum);
            line = jsEditor.setGutterMarker(lineNum, 'highlightGutter', makeLineLabel('highlighted by demo', 'highlightMarker'));
            jsEditor.addLineClass(line, 'text', 'highlightLine');
            highlightLines.push(line);
            scrollToLine(lineNum);
        }
    }

    var tabs = $('#bottomPanel');

    function showGallery() {
        $('#bottomPanel a[href=#innerPanel]').tab('show');
    }

    function hideGallery() {
        $('#bottomPanel a[href=#logContainer]').tab('show');
    }

    $('#bottomPanel a[href=#logContainer]').on('shown.bs.tab', function(e){
        numberOfNewConsoleMessages = 0;
        $('#bottomPanel a[href=#logContainer]').text('Console');
    });

    function registerScroll(demoContainer) {
        demoContainer.mousewheel(function(event, delta){
            this.scrollLeft -= delta * 30;
            event.preventDefault();
        });
    }

    CodeMirror.commands.runCesium = function(cm) {
        clearErrorsAddHints();
        // clearRun();
        $('#cesiumTabs a[href="#bucketPane"]').tab('show');
        // Check for a race condition in some browsers where the iframe hasn't loaded yet.
        if (bucketFrame.contentWindow.location.href.indexOf('bucket.html') > 0) {
            bucketFrame.contentWindow.location.reload();
        }
    };

    jsEditor = CodeMirror.fromTextArea(document.getElementById('code'), {
        mode : 'javascript',
        gutters : ['hintGutter', 'errorGutter', 'searchGutter', 'highlightGutter'],
        lineNumbers : true,
        matchBrackets : true,
        indentUnit : 4,
        extraKeys : {
            'Ctrl-Space' : 'autocomplete',
            'F8' : 'runCesium',
            'Tab' : 'indentMore',
            'Shift-Tab' : 'indentLess'
        }
    });

    jsEditor.on('cursorActivity', onCursorActivity);
    // jsEditor.on('change', scheduleHint);

    htmlEditor = CodeMirror.fromTextArea(document.getElementById('htmlBody'), {
        mode : 'text/html',
        lineNumbers : true,
        matchBrackets : true,
        indentUnit : 4,
        extraKeys : {
            'F8' : 'runCesium',
            'Tab' : 'indentMore',
            'Shift-Tab' : 'indentLess'
        }
    });

    // registry.byId('codeContainer').watch('selectedChildWidget', function(name, oldPane, newPane) {
    //     if (newPane.id === 'jsContainer') {
    //         jsEditor.focus();
    //     } else if (newPane.id === 'htmlContainer') {
    //         htmlEditor.focus();
    //     }
    // });

    function getScriptFromEditor(addExtraLine) {
        return 'function startup(Cesium) {\n' +
               '    "use strict";\n' +
               '//Sandcastle_Begin\n' +
               (addExtraLine ? '\n' : '') +
               jsEditor.getValue() +
               '//Sandcastle_End\n' +
               '    Sandcastle.finishedLoading();\n' +
               '}\n' +
               'if (typeof Cesium !== "undefined") {\n' +
               '    startup(Cesium);\n' +
               '} else if (typeof require === "function") {\n' +
               '    require(["Cesium"], startup);\n' +
               '}\n';
    }

    var scriptCodeRegex = /\/\/Sandcastle_Begin\s*([\s\S]*)\/\/Sandcastle_End/;

    function activateBucketScripts(bucketDoc) {
        var headNodes = bucketDoc.head.childNodes;
        var node;
        var nodes = [];
        for (var i = 0, len = headNodes.length; i < len; ++i) {
            node = headNodes[i];
            // header is included in blank frame.
            if (node.tagName === 'SCRIPT' && node.src.indexOf('Sandcastle-header.js') < 0) {
                nodes.push(node);
            }
        }

        for (i = 0, len = nodes.length; i < len; ++i) {
            bucketDoc.head.removeChild(nodes[i]);
        }

        // Apply user HTML to bucket.
        var htmlElement = bucketDoc.createElement('div');
        htmlElement.innerHTML = htmlEditor.getValue();
        bucketDoc.body.appendChild(htmlElement);

        var onScriptTagError = function() {
            if (bucketFrame.contentDocument === bucketDoc) {
                appendConsole('consoleError', 'Error loading ' + this.src, true);
                appendConsole('consoleError', "Make sure Cesium is built, see the Contributor's Guide for details.", true);
            }
        };

        // Load each script after the previous one has loaded.
        var loadScript = function() {
            if (bucketFrame.contentDocument !== bucketDoc) {
                // A newer reload has happened, abort this.
                return;
            }
            if (nodes.length > 0) {
                node = nodes.shift();
                var scriptElement = bucketDoc.createElement('script');
                var hasSrc = false;
                for (var j = 0, numAttrs = node.attributes.length; j < numAttrs; ++j) {
                    var name = node.attributes[j].name;
                    var val = node.attributes[j].value;
                    scriptElement.setAttribute(name, val);
                    if (name === 'src' && val) {
                        hasSrc = true;
                    }
                }
                scriptElement.innerHTML = node.innerHTML;
                if (hasSrc) {
                    scriptElement.onload = loadScript;
                    scriptElement.onerror = onScriptTagError;
                    bucketDoc.head.appendChild(scriptElement);
                } else {
                    bucketDoc.head.appendChild(scriptElement);
                    loadScript();
                }
            } else {
                // Apply user JS to bucket
                var element = bucketDoc.createElement('script');

                // Firefox line numbers are zero-based, not one-based.
                var isFirefox = navigator.userAgent.indexOf('Firefox/') >= 0;

                element.textContent = getScriptFromEditor(isFirefox);
                bucketDoc.body.appendChild(element);
            }
        };
        loadScript();
    }

    function applyBucket() {
        if (local.emptyBucket && local.bucketName && typeof bucketTypes[local.bucketName] === 'string') {
            bucketWaiting = false;
            var bucketDoc = bucketFrame.contentDocument;
            if (local.headers.substring(0, local.emptyBucket.length) !== local.emptyBucket) {
                appendConsole('consoleError', 'Error, first part of ' + local.bucketName + ' must match first part of bucket.html exactly.', true);
            } else {
                var bodyAttributes = local.headers.match(/<body([^>]*?)>/)[1];
                var attributeRegex = /([-a-z_]+)\s*="([^"]*?)"/ig;
                //group 1 attribute name, group 2 attribute value.  Assumes double-quoted attributes.
                var attributeMatch;
                while ((attributeMatch = attributeRegex.exec(bodyAttributes)) !== null) {
                    var attributeName = attributeMatch[1];
                    var attributeValue = attributeMatch[2];
                    if (attributeName === 'class') {
                        bucketDoc.body.className = attributeValue;
                    } else {
                        bucketDoc.body.setAttribute(attributeName, attributeValue);
                    }
                }

                var pos = local.headers.indexOf('</head>');
                var extraHeaders = local.headers.substring(local.emptyBucket.length, pos);
                bucketDoc.head.innerHTML += extraHeaders;
                activateBucketScripts(bucketDoc);
            }
        } else {
            bucketWaiting = true;
        }
    }

    function applyBucketIfWaiting() {
        if (bucketWaiting) {
            applyBucket();
        }
    }

    $.ajax({
        url : 'templates/bucket.html',
        dataType : 'text'
    }).done(function(value) {
        var pos = value.indexOf('</head>');
        local.emptyBucket = value.substring(0, pos);
        applyBucketIfWaiting();
    });

    function loadBucket(bucketName) {
        if (local.bucketName !== bucketName) {
            local.bucketName = bucketName;
            if (defined(bucketTypes[bucketName])) {
                local.headers = bucketTypes[bucketName];
            } else {
                local.headers = '<html><head></head><body data-sandcastle-bucket-loaded="no">';
                $.ajax({
                    url : 'templates/' + bucketName,
                    dataType : 'text'
                }).done(function(value) {
                    var pos = value.indexOf('<body');
                    pos = value.indexOf('>', pos);
                    bucketTypes[bucketName] = value.substring(0, pos + 1);
                    if (local.bucketName === bucketName) {
                        local.headers = bucketTypes[bucketName];
                    }
                    applyBucketIfWaiting();
                });
            }
        }
    }

    function loadFromGallery(demo) {
        document.getElementById('saveAsFile').download = demo.name + '.html';
        $('#description').text(decodeHTML(demo.description).replace(/\\n/g, '\n'));
        $('#label').text(decodeHTML(demo.label).replace(/\\n/g, '\n'));

        //requestDemo is synchronous
        requestDemo(demo.name).then(function(value) {
            demo.code = value;
        });

        var parser = new DOMParser();
        var doc = parser.parseFromString(demo.code, 'text/html');

        var script = doc.querySelector('script[id="cesium_sandcastle_script"]');
        if (!script) {
            appendConsole('consoleError', 'Error reading source file: ' + demo.name, true);
            return;
        }

        var scriptMatch = scriptCodeRegex.exec(script.textContent);
        if (!scriptMatch) {
            appendConsole('consoleError', 'Error reading source file: ' + demo.name, true);
            return;
        }

        var scriptCode = scriptMatch[1];
        jsEditor.setValue(scriptCode);
        jsEditor.clearHistory();

        var htmlText = '';
        var childIndex = 0;
        var childNode = doc.body.childNodes[childIndex];
        while (childIndex < doc.body.childNodes.length && childNode !== script) {
            htmlText += childNode.nodeType === 1 ? childNode.outerHTML : childNode.nodeValue;
            childNode = doc.body.childNodes[++childIndex];
        }
        htmlText = htmlText.replace(/^\s+/, '');

        htmlEditor.setValue(htmlText);
        htmlEditor.clearHistory();

        if (typeof demo.bucket === 'string') {
            loadBucket(demo.bucket);
        }
        CodeMirror.commands.runCesium(jsEditor);
    }

    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.name && e.state.code) {
            loadFromGallery(e.state);
            document.title = e.state.name + ' - Cesium Sandcastle';
        }
    }, false);

    window.addEventListener('message', function(e) {
        var line;
        // The iframe (bucket.html) sends this message on load.
        // This triggers the code to be injected into the iframe.
        if (e.data === 'reload') {
            var bucketDoc = bucketFrame.contentDocument;
            if (!local.bucketName) {
                // Reload fired, bucket not specified yet.
                return;
            }
            if (bucketDoc.body.getAttribute('data-sandcastle-loaded') !== 'yes') {
                bucketDoc.body.setAttribute('data-sandcastle-loaded', 'yes');
                logOutput.innerHTML = '';
                numberOfNewConsoleMessages = 0;
                $('#bottomPanel a[href=#logContainer]').text('Console');
                // This happens after a Run (F8) reloads bucket.html, to inject the editor code
                // into the iframe, causing the demo to run there.
                applyBucket();
                if (docError) {
                    appendConsole('consoleError', 'Documentation not available.  Please run the "generateDocumentation" build script to generate Cesium documentation.', true);
                    showGallery();
                }
                if (galleryError) {
                    appendConsole('consoleError', 'Error loading gallery, please run the build script.', true);
                }
            }
        } else if (defined(e.data.log)) {
            // Console log messages from the iframe display in Sandcastle.
            appendConsole('consoleLog', e.data.log, false);
        } else if (defined(e.data.error)) {
            // Console error messages from the iframe display in Sandcastle
            var errorMsg = e.data.error;
            var lineNumber = e.data.lineNumber;
            if (defined(lineNumber)) {
                errorMsg += ' (on line ';

                if (e.data.url) {
                    errorMsg += lineNumber + ' of ' + e.data.url + ')';
                } else {
                    lineNumber = scriptLineToEditorLine(lineNumber);
                    errorMsg += (lineNumber + 1) + ')';
                    line = jsEditor.setGutterMarker(lineNumber, 'errorGutter', makeLineLabel(e.data.error, 'errorMarker'));
                    jsEditor.addLineClass(line, 'text', 'errorLine');
                    errorLines.push(line);
                    scrollToLine(lineNumber);
                }
            }
            appendConsole('consoleError', errorMsg, true);
        } else if (defined(e.data.warn)) {
            // Console warning messages from the iframe display in Sandcastle.
            appendConsole('consoleWarn', e.data.warn, true);
        } else if (defined(e.data.highlight)) {
            // Hovering objects in the embedded Cesium window.
            highlightLine(e.data.highlight);
        }
    }, true);

    $('#codeContainerTabs a[data-toggle="tab"]').on('shown.bs.tab', function(e){
        if($(e.target).attr("href") === "#htmlContainer")
        {
            htmlEditor.refresh();
            htmlEditor.focus();
        }
        else
        {
            jsEditor.refresh();
            jsEditor.focus();
        }
    });
    
    // registry.byId('jsContainer').on('show', function() {
    //     suggestButton.set('disabled', false);
    //     jsEditor.refresh();
    // });

    // registry.byId('htmlContainer').on('show', function() {
    //     suggestButton.set('disabled', true);
    //     htmlEditor.refresh();
    // });

    $('#search').keyup(function() {
        searchTerm = $('#search').val();
        searchRegExp = new RegExp(searchTerm, 'i');
        var numDemosShown = 0;
        if (searchTerm !== '') {
            showSearchContainer();
            for (var i = 0; i < gallery_demos.length; i++) {
                var demo = gallery_demos[i];
                var demoName = demo.name;
                if (searchRegExp.test(demoName) || searchRegExp.test(demo.code)) {
                    document.getElementById(demoName + 'searchDemo').style.display = 'inline-block';
                    ++numDemosShown;
                } else {
                    document.getElementById(demoName + 'searchDemo').style.display = 'none';
                }
            }
        } else {
            hideSearchContainer();
        }

        if (numDemosShown) {
            galleryErrorMsg.style.display = 'none';
        } else {
            galleryErrorMsg.style.display = 'inline-block';
        }

        showGallery();
        scheduleHintNoChange();
    });

    function hideSearchContainer() {
        if ($('#searchPill')) {
            searchPill.remove();
            searchTab.remove();
            $('#galleryPanel li:first a').tab('show');
        }
    }

    function showSearchContainer() {
        if(!$('#searchPill').length){
            $('#innerPanel .tab-content').append(searchPill);
            $('#innerPanel #galleryPanel').append(searchTab);
            registerScroll($('#searchDemos'));
            // $('#searchDemos [data-toggle="tooltip"]').tooltip();
        }
        $('li a[href=#searchPill]').tab('show');
    }
    
    $('#buttonNew').on('click', function(){
        loadFromGallery(newDemo);
        var demoSrc = newDemo.name + '.html';
        if (demoSrc !== window.location.search.substring(1)) {
           window.history.pushState(newDemo, newDemo.name, '?src=' + demoSrc + '&label=' + currentTab);
        }
        document.title = newDemo.name + ' - Cesium Sandcastle';
   });
    
    $('#buttonSuggest').on('click', function(){
        CodeMirror.commands.autocomplete(jsEditor);
    });

    function getDemoHtml() {
        return local.headers + '\n' +
               htmlEditor.getValue() +
               '<script id="cesium_sandcastle_script">\n' +
               getScriptFromEditor(false) +
               '</script>\n' +
               '</body>\n' +
               '</html>\n';
    }

    $('#dropDownSaveAs').on('click', function(){
        var query = window.location.search.substring(1).split('&');
        var currentDemoName = "";
        for(var i= 0; i<query.length; ++i){
            var tag = query[i].split('=');
            if(tag[0] === "src"){
                currentDemoName = tag[1];
                break;
            }
        }
        currentDemoName = currentDemoName.replace('.html', '');
        var description = encodeHTML($('#description').text().replace(/\n/g, '\\n')).replace(/\"/g, '&quot;');
        var label = encodeHTML($('#label').text().replace(/\n/g, '\\n')).replace(/\"/g, '&quot;');

        var html = getDemoHtml();
        html = html.replace('<title>', '<meta name="description" content="' + description + '">\n    <title>');
        html = html.replace('<title>', '<meta name="cesium-sandcastle-labels" content="' + label + '">\n    <title>');

        var octetBlob = new Blob([html], {
            'type' : 'application/octet-stream',
            'endings' : 'native'
        });
        var octetBlobURL = URL.createObjectURL(octetBlob);
        $('#saveAsFile').attr('href',octetBlobURL);
    });
    
    $('#buttonRun').on('click', function(){
        CodeMirror.commands.runCesium(jsEditor);
    });
    
    $('#buttonNewWindow').on('click', function(){
        var baseHref = window.location.href;
        var pos = baseHref.lastIndexOf('/');
        baseHref = baseHref.substring(0, pos) + '/gallery/';

        var html = getDemoHtml();
        html = html.replace('<head>', '<head>\n    <base href="' + baseHref + '">');
        var htmlBlob = new Blob([html], {
            'type' : 'text/html;charset=utf-8',
            'endings' : 'native'
        });
        var htmlBlobURL = URL.createObjectURL(htmlBlob);
        window.open(htmlBlobURL, '_blank');
        window.focus();
    });

    // registry.byId('buttonThumbnail').on('change', function(newValue) {
    //     if (newValue) {
    //         domClass.add('bucketFrame', 'makeThumbnail');
    //     } else {
    //         domClass.remove('bucketFrame', 'makeThumbnail');
    //     }
    // });

    var demoContainers = $('.demosContainer div.tab-pane div:first-child');
    $.each(demoContainers, function(i, val){
        registerScroll($(val));
    });

    // var galleryContainer = registry.byId('innerPanel');
    // galleryContainer.demoTileHeightRule = demoTileHeightRule;
    // galleryContainer.originalResize = galleryContainer.resize;
    // galleryContainer.resize = function(changeSize, resultSize) {
    //     var newSize = changeSize.h - 88;
    //     if (newSize < 20) {
    //         demoTileHeightRule.style.display = 'none';
    //     } else {
    //         demoTileHeightRule.style.display = 'inline';
    //         demoTileHeightRule.style.height = Math.min(newSize, 150) + 'px';
    //     }
    //     this.originalResize(changeSize, resultSize);
    // };

    var queryObject = {};
    if (window.location.search) {
        var query = window.location.search.substring(1).split('&');
        for(var i = 0; i < query.length; ++i){
            var tags = query[i].split('=');
            queryObject[tags[0]] = tags[1];
        }
    } else {
        queryObject.src = 'Hello World.html';
        queryObject.label = 'Showcases';
    }

    function requestDemo(name) {
        return $.ajax({
            url : 'gallery/' + name + '.html',
            handleAs : 'text',
            sync : true,
            error : function(error) {
                appendConsole('consoleError', error, true);
                galleryError = true;
            }
        });
    }

    function loadDemoFromFile(index) {
        var demo = gallery_demos[index];

        requestDemo(demo.name).then(function(value) {
            // Store the file contents for later searching.
            demo.code = value;

            var parser = new DOMParser();
            var doc = parser.parseFromString(value, 'text/html');

            var bucket = doc.body.getAttribute('data-sandcastle-bucket');
            demo.bucket = bucket ? bucket : 'bucket-requirejs.html';

            var descriptionMeta = doc.querySelector('meta[name="description"]');
            var description = descriptionMeta && descriptionMeta.getAttribute('content');
            demo.description = description ? description : '';

            var labelsMeta = doc.querySelector('meta[name="cesium-sandcastle-labels"]');
            var labels = labelsMeta && labelsMeta.getAttribute('content');
            demo.label = labels ? labels : '';

            // Select the demo to load upon opening based on the query parameter.
            if (defined(queryObject.src)) {
                if (demo.name === queryObject.src.replace('.html', '')) {
                    loadFromGallery(demo);
                    window.history.replaceState(demo, demo.name, '?src=' + demo.name + '.html&label=' + queryObject.label);
                    document.title = demo.name + ' - Cesium Sandcastle';
                }
            }

            addFileToTab(index);
        });
    }

    function setSubtab(tabName) {
        currentTab = defined(queryObject.label) ? queryObject.label : tabName;
        queryObject.label = undefined;
    }

    function addFileToGallery(index) {
        var searchDemos = $('#searchDemos');
        createGalleryButton(index, searchDemos, 'searchDemo');
        loadDemoFromFile(index);
    }

    function onShowCallback() {
        return function() {
            setSubtab(this.title);
        };
    }

    function addFileToTab(index) {
        var demo = gallery_demos[index];
        if (demo.label !== '') {
            var labels = demo.label.split(',');
            for (var j = 0; j < labels.length; j++) {
                var label = labels[j];
                label = label.trim();
                if (!$('#' + label + 'Demos').length) {
                    $('#innerPanel ul').append('<li role="presentation"><a href="#'+label+'Pill" aria-controls="'+label+'Pill" role="tab" data-toggle="pill">' + label + '</a></li>');
                    $('#innerPanel .tab-content').append('<div role="tabpanel" class="tab-pane" id="'+label+'Pill"><div class="demos" id="'+label+'Demos"></div></div>');
                    // subtabs[label] = cp;
                    registerScroll($('#'+label + 'Pill div:first-child'));
                }
                var tabName = label + 'Demos';
                var tab = $('#'+tabName);
                createGalleryButton(index, tab, tabName);
            }
        }
    }

    function createGalleryButton(index, tab, tabName) {
        var demo = gallery_demos[index];
        var imgSrc = 'templates/Gallery_tile.jpg';
        if (defined(demo.img)) {
            imgSrc = 'gallery/' + demo.img;
        }

        var demoLink = document.createElement('a');
        demoLink.id = demo.name + tabName;
        demoLink.className = 'linkButton';
        demoLink.href = 'gallery/' + encodeURIComponent(demo.name) + '.html';
        tab.append(demoLink);

        if(demo.name === "Hello World") {
            newDemo = demo;
        }
        demoLink.onclick = function(e) {
            if (e.which == 2) {
                window.open('gallery/' + demo.name + '.html');
            } else {
                loadFromGallery(demo);
                var demoSrc = demo.name + '.html';
                if (demoSrc !== window.location.search.substring(1)) {
                    window.history.pushState(demo, demo.name, '?src=' + demoSrc + '&label=' + currentTab);
                }
                document.title = demo.name + ' - Cesium Sandcastle';
            }
            e.preventDefault();
        };

        $(demoLink).append('<div class="demoTileTitle">' + demo.name + '</div><img src="' + imgSrc + '" class="demoTileThumbnail" alt="" onDragStart="return false;" />');

        setDemoTooltip(demoLink, demo.description);
        $('[data-toggle="tooltip"]').tooltip();
    }

    if (!defined(gallery_demos)) {
        galleryErrorMsg.textContent = 'No demos found, please run the build script.';
        galleryErrorMsg.style.display = 'inline-block';
    } else {
        var label = 'Showcases';
        $('#innerPanel ul').append('<li role="presentation" class="active"><a href="#showcasesPill" aria-controls="showcasesPill" role="tab" data-toggle="pill">Showcases</a></li>');
        $('#innerPanel .tab-content').append('<div role="tabpanel" class="tab-pane active" id="showcasesPill"><div class="demos" id="ShowcasesDemos"></div></div>');
        // subtabs[label] = cp;
        registerScroll($('#showcasesPill div:first-child'));

        var len = gallery_demos.length;

        var i;
        // Sort alphabetically.  This will eventually be a user option.
        gallery_demos.sort(function(a, b) {
            var aName = a.name.toUpperCase();
            var bName = b.name.toUpperCase();
            return bName < aName ? 1 : bName > aName ? -1 : 0;
        });

        var queryInGalleryIndex = false;
        var queryName = queryObject.src.replace('.html', '');
        for (i = 0; i < len; ++i) {
            addFileToGallery(i);
            if (gallery_demos[i].name === queryName) {
                queryInGalleryIndex = true;
            }
        }

        label = 'All';
        $('#innerPanel ul').append('<li role="presentation"><a href="#'+label+'Pill" aria-controls="'+label+'Pill" role="tab" data-toggle="pill">' + label + '</a></li>');
        $('#innerPanel .tab-content').append('<div role="tabpanel" class="tab-pane" id="'+label+'Pill"><div class="demos" id="'+label+'Demos"></div></div>');
        // subtabs[label] = cp;
        registerScroll($('#AllPill div:first-child'));

        var demos = $('#'+label+'Demos');
        for (i = 0; i < len; ++i) {
            if (!/Development/i.test(gallery_demos[i].label)) {
                createGalleryButton(i, demos, 'all');
            }
        }

        if (!queryInGalleryIndex) {
            gallery_demos.push({
                name : queryName,
                description : ''
            });
            addFileToGallery(gallery_demos.length - 1);
        }
    }

    $('#searchDemos').append(galleryErrorMsg);
    var searchPill = $('#searchPill');
    var searchTab = $('li a[href=#searchPill]').parent();
    hideSearchContainer();
    $('#innerPanel ul a[data-toggle=pill]').on('show.bs.tab', function(e){
        setSubtab(e.target.innerHTML);
    });
});
