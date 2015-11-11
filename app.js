var fs = require('fs');
var request = require('request');
var xlsx = require('node-xlsx');
var ECT = require('ect');
var async = require('async');
var renderer = ECT({ root : __dirname + '/views' });

var _data = [];
var _mode = null;
var _filter = null;
var _counter = {};

var _packageCount = 0;
var _resourceCount = 1;

Array.prototype.divide = function(n){
    var ary = this;
    var idx = 0;
    var results = [];
    var length = ary.length;

    while (idx + n < length){
        var result = ary.slice(idx,idx+n)
        results.push(result);
        idx = idx + n
    }

    var rest = ary.slice(idx,length+1)
    results.push(rest)
    return results;
}

function readBinaryFromHttp(param) {
    return new Promise(function(resolve, reject) {
        var req = {
            uri: param.url,
            encoding: null
        };
        request(req, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                fs.writeFile('data/' + param.id + '.' + param.prefix, body , function (err) {
                    resolve();
                });
            } else {
                if (response) {
                    console.log('error : '+ response.statusCode);
                }
                reject(error)
            }
        });
    });
}

function excel2Json(param) {
    //console.log('excel2Json start ' + JSON.stringify(param));
    return new Promise(function(resolve, reject) {
        readBinaryFromHttp(param).then(function(d) {
            var workbook = null;
            try {
                workbook = xlsx.parse(__dirname + '/data/' + param.id + '.' + param.prefix);
            } catch(e) {
                resolve('');
                return;
            }
            if (workbook) {
                var jsonStr = JSON.stringify(workbook);
                resolve(jsonStr.substring(0,1000));
            } else {
                resolve('');
            }
        }).catch(function(reason) {
            resolve('error');
        });
    });
}

function readPackageDetail(packageID) {
    return new Promise(function(resolve, reject) {
        request('http://dataset.city.shizuoka.jp/api/action/package_show?id=' + packageID, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var json = JSON.parse(body).result;
                //console.log(packageID + ' / ' + json.result.title);
                _packageCount = _packageCount + 1;
                json.title = _packageCount + '. ' + json.title;
                _resourceCount = 1;
                resolve(json);
            } else {
                console.log('error '+ response.statusCode);
                reject(error)
            }
        });
    });    
}

function readPackageList() {
    return new Promise(function(resolve, reject) {
        request('http://dataset.city.shizuoka.jp/api/action/package_list', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var json = JSON.parse(body);
                var ar = json.result;
                resolve(ar);
            } else {
                console.log('error/ '+ response.statusCode);
                reject(error)
            }
        });
    });    
}

function readPackageList2() {
    return new Promise(function(resolve, reject) {
        resolve(['056-1']);
    });    
}

function readResources(packageDetail, callback) {
    if (!packageDetail) {
        callback(null, null);
        return;
    }
    async.forEachSeries(packageDetail.resources, function(resource, next){
        resource.name = _packageCount + '.' +  _resourceCount + ". " + resource.name;
        _resourceCount = _resourceCount + 1;
        var format = resource.format;
        console.log(resource.name);
        if ((_filter) && (format !== _filter)) {
            next(); 
        } else if (inlineList.indexOf(format) == -1) {
            next();
        } else {
            if ((_filter) && (format === _filter)) {
                request(resource.url, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log(body);
                        resource.data = body;
                    } else {
                        console.log('error '+ response.statusCode);
                    }
                    next();
                });
            } else if ((resource.format === 'XLS') || (resource.format === 'XLSX')) {
                excel2Json({
                    url:resource.url,
                    id:resource.id,
                    prefix:resource.format.toLowerCase()
                }).then(function(res) {
                    resource.data = res;
                    next();
                });
            } else {
                next();
            }
        }
    }, function(err) {
        callback(null, packageDetail);
    });
}

/**
 * フィルタ指定がある場合、そのリソースだけ別の配列にセットし直す。
 * パッケージ内に１つも存在しない場合は、そのパッケージをスキップするためnullをセット
 */
function filtering(packageDetail, callback) {
    if (!_filter) {
        callback(null, packageDetail);
        return;
    }
    var noHit = true;
    packageDetail.filteredData = [];
    for (var i=0;i<packageDetail.resources.length;i++) {
        var format = packageDetail.resources[i].format;
        if (format === _filter) {
            noHit = false;
            packageDetail.filteredData.push(packageDetail.resources[i]);
        }
    }
    if (noHit) {
        callback(null, null);
    } else {
        callback(null, packageDetail);
    }
}

/**
 * モードが「count」の場合だけ、各フォーマット毎に数を集計する。
 * 集計以外を行わないように、次のwaterfallではじけるように、nullをセットする
 */
function count(packageDetail, callback) {
    if (_mode !== 'count') {
        callback(null, packageDetail);
        return;
    }
    for (var i=0;i<packageDetail.resources.length;i++) {
        var format = packageDetail.resources[i].format;
        if (format in _counter) {
            _counter[format] = _counter[format] + 1;
        } else {
            _counter[format] = 0;
        }
    }
    callback(null, null);
}


function make() {
    readPackageList().then(function(list) {
        console.log('list.length : ' + list.length)
        async.forEachSeries(list, function(packageName, next){
            console.log('packageName : ' + packageName);
            async.waterfall([
                function(next) {
                    readPackageDetail(packageName).then(function(data) {
                        next(null, data);
                    });
                },
                count,
                filtering,
                readResources,
                function(result, next2) {
                    if (result) { 
                        _data.push(result);
                    }
                    next2(null);
                } 
            ],function() {
                next();
            });
        }, function(err) {
            console.log('------------------------------- : ' + _data.length);
            //console.log(_data);
            if (_mode === 'count') {
                console.log(_counter);
                return;
            }
            var ar = _data;
            if (_mode === 'excel') {
                ar = ar.divide(50);
            } else {
                ar = [ar];
            }
            var pageCount = 0;
            async.each(ar, function(subData, next2){
                pageCount = pageCount + 1;
                var md = renderer.render('out.ect',{
                    'mode': _mode,
                    'data': subData
                });
                fs.writeFile('shizu-' + _mode + '-' + pageCount + '.md', md , function (err) {
                    if (err) {
                        console.log(err);
                    }
                    next2();
                });
            });    
        });
    });
}


var filterList = [
    "XLS",
    "PDF",
    "CSV",
    "XLSX",
    "HTML",
    "ZIP",
    "DOCX",
    "DOC",
    "JSON",
    "RDF",
    "JPEG",
    "dBase",
    "SHP",
    "shx",
    "prj",
    "sbn",
    "sbx",
    "XML"
];

var inlineList = [
    "CSV",
    "HTML",
    "JSON",
    "RDF",
    "XML"
];

// mode 必要？
var _mode = process.argv[2];
if (filterList.indexOf(_mode) != -1) {
     _filter = _mode;
} else {
    switch(_mode) {
    case 'all':
    case 'count':
        break;
    default:
        _mode = null;        
    } 
}
if (_mode) {
    make();
}
