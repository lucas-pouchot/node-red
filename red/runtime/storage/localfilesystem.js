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

var fs = require('fs-extra');
var path = require("path");
var when = require('when');
var nodeFn = require('when/node/function');
var keys = require('when/keys');
var fspath = require("path");
var mkdirp = fs.mkdirs;

var log = require("../log");

var events = require("../events");

var promiseDir = nodeFn.lift(mkdirp);

var initialFlowLoadComplete = false;
var settings;
var flowsFile;
var flowsFullPath;
var flowsFileBackup;
var credentialsFile;
var credentialsFileBackup;
var oldCredentialsFile;
var sessionsFile;
var libDir;
var libFlowsDir;
var globalSettingsFile;

var flowsFileList = {};

function addFlowFile(file){
    var p = fspath.resolve(file);
    if(!flowsFileList[p]) {
        flowsFileList[p] = [];
    }
}

events.on("node-flows-file",function(f) {
    addFlowFile(f);
});

var tabFileList = {};
function addTabFile(tab,src) {
    if(!tabFileList[tab]) {
        tabFileList[tab] = src;
    }
}

function getFileMeta(root,path) {
    var fn = fspath.join(root,path);
    var fd = fs.openSync(fn,"r");
    var size = fs.fstatSync(fd).size;
    var meta = {};
    var read = 0;
    var length = 10;
    var remaining = "";
    var buffer = Buffer(length);
    while(read < size) {
        read+=fs.readSync(fd,buffer,0,length);
        var data = remaining+buffer.toString();
        var parts = data.split("\n");
        remaining = parts.splice(-1);
        for (var i=0;i<parts.length;i+=1) {
            var match = /^\/\/ (\w+): (.*)/.exec(parts[i]);
            if (match) {
                meta[match[1]] = match[2];
            } else {
                read = size;
                break;
            }
        }
    }
    fs.closeSync(fd);
    return meta;
}

function getFileBody(root,path) {
    var body = "";
    var fn = fspath.join(root,path);
    var fd = fs.openSync(fn,"r");
    var size = fs.fstatSync(fd).size;
    var scanning = true;
    var read = 0;
    var length = 50;
    var remaining = "";
    var buffer = Buffer(length);
    while(read < size) {
        var thisRead = fs.readSync(fd,buffer,0,length);
        read += thisRead;
        if (scanning) {
            var data = remaining+buffer.slice(0,thisRead).toString();
            var parts = data.split("\n");
            remaining = parts.splice(-1)[0];
            for (var i=0;i<parts.length;i+=1) {
                if (! /^\/\/ \w+: /.test(parts[i])) {
                    scanning = false;
                    body += parts[i]+"\n";
                }
            }
            if (! /^\/\/ \w+: /.test(remaining)) {
                scanning = false;
            }
            if (!scanning) {
                body += remaining;
            }
        } else {
            body += buffer.slice(0,thisRead).toString();
        }
    }
    fs.closeSync(fd);
    return body;
}

/**
 * Write content to a file using UTF8 encoding.
 * This forces a fsync before completing to ensure
 * the write hits disk.
 */
function writeFile(path,content) {
    return when.promise(function(resolve,reject) {
        var stream = fs.createWriteStream(path);
        stream.on('open',function(fd) {
            stream.end(content,'utf8',function() {
                fs.fsync(fd,resolve);
            });
        });
        stream.on('error',function(err) {
            reject(err);
        });
    });
}

function parseJSON(data) {
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1)
    }
    return JSON.parse(data);
}

function readFile(path, backupPath, emptyResponse, type, addToList) {
    return when.promise(function(resolve) {
        fs.readFile(path,'utf8',function(err,data) {
            if (!err) {
                if (data.length === 0) {
                    log.warn(log._("storage.localfilesystem.empty",{type:type}) + " : " + path);
                    try {
                        var backupStat = fs.statSync(backupPath);
                        if (backupStat.size === 0) {
                            // Empty flows, empty backup - return empty flow
                            return resolve(emptyResponse);
                        }
                        // Empty flows, restore backup
                        log.warn(log._("storage.localfilesystem.restore",{path:backupPath,type:type}));
                        fs.copy(backupPath,path,function(backupCopyErr) {
                            if (backupCopyErr) {
                                // Restore backup failed
                                log.warn(log._("storage.localfilesystem.restore-fail",{message:backupCopyErr.toString(),type:type}));
                                resolve([]);
                            } else {
                                // Loop back in to load the restored backup
                                resolve(readFile(path,backupPath,emptyResponse,type));
                            }
                        });
                        return;
                    } catch(backupStatErr) {
                        // Empty flow file, no back-up file
                        return resolve(emptyResponse);
                    }
                }
                try {
    	            var flow = parseJSON(data);
    	            if(addToList){
    	                for(var n in flow) {
    	                    if(flow[n].type === "tab") {
    	                        addTabFile(flow[n].id, path);
    	                    }
    	                    flow[n].origin = path;
    	                }
    	            }
    	            return resolve(flow);
                } catch(parseErr) {
                    log.warn(log._("storage.localfilesystem.invalid",{type:type}) + " : " + path);
                    return resolve(emptyResponse);
                }
            } else {
                if (type === 'flow') {
                    log.info(log._("storage.localfilesystem.create",{type:type}) + " : " + path);
                }
                resolve(emptyResponse);
            }
        });
    });
}

var localfilesystem = {
    init: function(_settings) {
        settings = _settings;

        var promises = [];

        if (!settings.userDir) {
            try {
                fs.statSync(fspath.join(process.env.NODE_RED_HOME,".config.json"));
                settings.userDir = process.env.NODE_RED_HOME;
            } catch(err) {
                try {
                    // Consider compatibility for older versions
                    if (process.env.HOMEPATH) {
                        fs.statSync(fspath.join(process.env.HOMEPATH,".node-red",".config.json"));
                        settings.userDir = fspath.join(process.env.HOMEPATH,".node-red");
                    }
                } catch(err) {
                }
                if (!settings.userDir) {
                    settings.userDir = fspath.join(process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || process.env.NODE_RED_HOME,".node-red");
                    if (!settings.readOnly) {
                        promises.push(promiseDir(fspath.join(settings.userDir,"node_modules")));
                    }
                }
            }
        }

        if (settings.flowFile) {
            flowsFile = settings.flowFile;
            // handle Unix and Windows "C:\"
            if ((flowsFile[0] == "/") || (flowsFile[1] == ":")) {
                // Absolute path
                flowsFullPath = flowsFile;
            } else if (flowsFile.substring(0,2) === "./") {
                // Relative to cwd
                flowsFullPath = fspath.join(process.cwd(),flowsFile);
            } else {
                try {
                    fs.statSync(fspath.join(process.cwd(),flowsFile));
                    // Found in cwd
                    flowsFullPath = fspath.join(process.cwd(),flowsFile);
                } catch(err) {
                    // Use userDir
                    flowsFullPath = fspath.join(settings.userDir,flowsFile);
                }
            }

        } else {
            flowsFile = 'flows_'+require('os').hostname()+'.json';
            flowsFullPath = fspath.join(settings.userDir,flowsFile);
        }
        var ffExt = fspath.extname(flowsFullPath);
        var ffName = fspath.basename(flowsFullPath);
        var ffBase = fspath.basename(flowsFullPath,ffExt);
        var ffDir = fspath.dirname(flowsFullPath);

        function getLocalFlowsFiles (dir){            
            var files = [];
            try {
                files = fs.readdirSync(dir);
            }
            catch(err) {
                return;
            }
            files.sort();
            files.forEach(function(fn) {
                var stats = fs.statSync(path.join(dir,fn));
                if (stats.isFile() && fn === "flows.json") {
                    addFlowFile(path.join(dir, fn));
                }else if (stats.isDirectory()) {
                    getLocalFlowsFiles(path.join(dir,fn));
                }
            });
        }

        if(settings.flowDir){
            getLocalFlowsFiles(settings.flowDir+"node_modules/");
        }
        if(settings.secondFlowDir){
            getLocalFlowsFiles(settings.secondFlowDir);        
        }

        credentialsFile = fspath.join(settings.userDir,ffBase+"_cred"+ffExt);
        credentialsFileBackup = fspath.join(settings.userDir,"."+ffBase+"_cred"+ffExt+".backup");

        oldCredentialsFile = fspath.join(settings.userDir,"credentials.json");

        flowsFileBackup = fspath.join(ffDir, ffName+".backup");

        sessionsFile = fspath.join(settings.userDir,".sessions.json");

        libDir = fspath.join(settings.userDir,"lib");
        libFlowsDir = fspath.join(libDir,"flows");

        globalSettingsFile = fspath.join(settings.userDir,".config.json");

        var packageFile = fspath.join(settings.userDir,"package.json");
        var packagePromise = when.resolve();
        if (!settings.readOnly) {
            promises.push(promiseDir(libFlowsDir));
            packagePromise = function() {
                try {
                    fs.statSync(packageFile);
                } catch(err) {
                    var defaultPackage = {
                        "name": "node-red-project",
                        "description": "A Node-RED Project",
                        "version": "0.0.1"
                    };
                    return writeFile(packageFile,JSON.stringify(defaultPackage,"",4));
                }
                return true;
            }
        }
        return when.all(promises).then(packagePromise);
    },

    getFlows: function() {
        return when.promise(function(resolve) {
            if (!initialFlowLoadComplete) {
                initialFlowLoadComplete = true;
                log.info(log._("storage.localfilesystem.user-dir",{path:settings.userDir}));
                log.info("Flows file : ");
                console.log("\t\t\t\t", flowsFullPath);		
                for(var i in flowsFileList) {
                    console.log("\t\t\t\t", i);
                }
            }
            var promises = [];
            var promise = readFile(flowsFullPath, flowsFileBackup, [], 'flow', false);
            promises.push(promise);
            for(var i in flowsFileList) {
                promise = readFile(i, i+".backup",[],'flow', true);
                promises.push(promise);
            }

            when.settle(promises).then(function(descriptors) {
                var flows = [];
                for(var i in descriptors) {
                    Array.prototype.push.apply(flows, descriptors[i].value);
                }
                resolve(flows);
            });
        });
    },

    saveFlows: function(flows) {
        if (settings.readOnly) {
            return when.resolve();
        }
        return when.promise(function(resolve, reject) {
            var promises = [];
            for(var i in flowsFileList) {
                flowsFileList[i] = [];
            }

            var userFlows = [];
            for(var j in flows) {
                var n = flows[j];
                if (n.hasOwnProperty("origin")) {
                    addFlowFile(n.origin);
                    flowsFileList[n.origin].push(n);
                } else if(n.hasOwnProperty("z") && tabFileList.hasOwnProperty(n.z) ){
                    addFlowFile(tabFileList[n.z]);
                    flowsFileList[tabFileList[n.z]].push(n);
                } else if(n.hasOwnProperty("type") && n.hasOwnProperty("id") && n.type === "tab" && tabFileList.hasOwnProperty(n.id) ){
                    flowsFileList[tabFileList[n.id]].push(n);
                }else {
                    userFlows.push(n);                    
                }
            }

            var flowData;

            for(var i in flowsFileList) {
                flowData = settings.flowFilePretty ? JSON.stringify(flowsFileList[i], null, 4) : JSON.stringify(flowsFileList[i]);
                if(localfilesystem.isValidFlowFile(i)) {
                    fs.renameSync(i, i + ".backup");
                }
                promises.push(writeFile(i, flowData));
            }

            if (localfilesystem.isValidFlowFile(flowsFullPath)) {
                fs.renameSync(flowsFullPath,flowsFileBackup);
            }
            flowData = settings.flowFilePretty ? JSON.stringify(userFlows, null, 4) : JSON.stringify(userFlows);

            promises.push(writeFile(flowsFullPath, flowData));
            when.settle(promises).then(function(descriptors) {
                return resolve();
            });
        });
    },

    getCredentials: function() {
        return readFile(credentialsFile,credentialsFileBackup,{},'credentials', false);
    },

    saveCredentials: function(credentials) {
        if (settings.readOnly) {
            return when.resolve();
        }

        try {
            fs.renameSync(credentialsFile,credentialsFileBackup);
        } catch(err) {
        }
        var credentialData;
        if (settings.flowFilePretty) {
            credentialData = JSON.stringify(credentials,null,4);
        } else {
            credentialData = JSON.stringify(credentials);
        }
        return writeFile(credentialsFile, credentialData);
    },

    getSettings: function() {
        return when.promise(function(resolve,reject) {
            fs.readFile(globalSettingsFile,'utf8',function(err,data) {
                if (!err) {
                    try {
                        return resolve(parseJSON(data));
                    } catch(err2) {
                        log.trace("Corrupted config detected - resetting");
                    }
                }
                return resolve({});
            })
        })
    },
    saveSettings: function(newSettings) {
        if (settings.readOnly) {
            return when.resolve();
        }
        return writeFile(globalSettingsFile,JSON.stringify(newSettings,null,1));
    },
    getSessions: function() {
        return when.promise(function(resolve,reject) {
            fs.readFile(sessionsFile,'utf8',function(err,data){
                if (!err) {
                    try {
                        return resolve(parseJSON(data));
                    } catch(err2) {
                        log.trace("Corrupted sessions file - resetting");
                    }
                }
                resolve({});
            })
        });
    },
    saveSessions: function(sessions) {
        if (settings.readOnly) {
            return when.resolve();
        }
        return writeFile(sessionsFile,JSON.stringify(sessions));
    },

    getLibraryEntry: function(type,path) {
        var root = fspath.join(libDir,type);
        var rootPath = fspath.join(libDir,type,path);

        // don't create the folder if it does not exist - we are only reading....
        return nodeFn.call(fs.lstat, rootPath).then(function(stats) {
            if (stats.isFile()) {
                return getFileBody(root,path);
            }
            if (path.substr(-1) == '/') {
                path = path.substr(0,path.length-1);
            }
            return nodeFn.call(fs.readdir, rootPath).then(function(fns) {
                var dirs = [];
                var files = [];
                fns.sort().filter(function(fn) {
                    var fullPath = fspath.join(path,fn);
                    var absoluteFullPath = fspath.join(root,fullPath);
                    if (fn[0] != ".") {
                        var stats = fs.lstatSync(absoluteFullPath);
                        if (stats.isDirectory()) {
                            dirs.push(fn);
                        } else {
                            var meta = getFileMeta(root,fullPath);
                            meta.fn = fn;
                            files.push(meta);
                        }
                    }
                });
                return dirs.concat(files);
            });
        }).otherwise(function(err) {
            // if path is empty, then assume it was a folder, return empty
            if (path === ""){
                return [];
            }

            // if path ends with slash, it was a folder
            // so return empty
            if (path.substr(-1) == '/') {
                return [];
            }

            // else path was specified, but did not exist,
            // check for path.json as an alternative if flows
            if (type === "flows" && !/\.json$/.test(path)) {
                return localfilesystem.getLibraryEntry(type,path+".json")
                .otherwise(function(e) {
                    throw err;
                });
            } else {
                throw err;
            }
        });
    },

    saveLibraryEntry: function(type,path,meta,body) {
        if (settings.readOnly) {
            return when.resolve();
        }
        if (type === "flows" && !path.endsWith(".json")) {
            path += ".json";
        }
        var fn = fspath.join(libDir, type, path);
        var headers = "";
        for (var i in meta) {
            if (meta.hasOwnProperty(i)) {
                headers += "// "+i+": "+meta[i]+"\n";
            }
        }
        if (type === "flows" && settings.flowFilePretty) {
            body = JSON.stringify(JSON.parse(body),null,4);
        }
        return promiseDir(fspath.dirname(fn)).then(function () {
            writeFile(fn,headers+body);
        });
    },
    
    isValidFlowFile:function(path){
        var bool = false;
        if (fs.existsSync(path)){
            var flow = fs.readFileSync(path,"utf8");
            try {
                if (flow.trim() != "[]") {
                    flow = parseJSON(flow);
                    bool = true;
                }
            } catch(e){ }
        }
        return bool;
    }
};

module.exports = localfilesystem;
