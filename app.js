var fs = require('fs');
var request = require('request');
var xlsx = require('node-xlsx');
var ECT = require('ect');

var _data = [];

var _packageCount = 0;
var _resourceCount = 0;

function readBinaryFromHttp(param) {
    return new Promise(function(resolve, reject) {
        var req = {
            uri: param.url,
            encoding: null    
        };
        request(req, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                fs.writeFile(param.id + '.' + param.prefix, body , function (err) {
                    resolve();
                });
            } else {
                console.log('error : '+ response.statusCode);
                reject(error)
            }
        });
    });
}

function excel2Json(param) {
    console.log('excel2Json start ' + JSON.stringify(param));
    return new Promise(function(resolve, reject) {
        readBinaryFromHttp(param).then(function(d) {
            var workbook = null;
            try {
                workbook = xlsx.parse(__dirname + '/' + param.id + '.' + param.prefix);
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
                var json = JSON.parse(body);
                console.log(packageID + '/' + json.result.title);
                resolve(json.result);
            } else {
                console.log('error '+ response.statusCode);
                reject(error)
            }
        });
    });    
}

function readPackageList(data) {
    return new Promise(function(resolve, reject) {
        request('http://dataset.city.shizuoka.jp/api/action/package_list', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var json = JSON.parse(body);
                resolve(json.result);
            } else {
                console.log('error/ '+ response.statusCode);
                reject(error)
            }
        });
    });    
}

function readResources(data) {
    console.log("readResources start");
    return new Promise(function(resolve, reject) {
        data.resources.reduce(function(prevValue, currentValue) {
            return prevValue.then(function() {
                return new Promise(function(resolve, reject) {
                    console.log(currentValue.name);
                    if (currentValue.format === 'XLS') {
                        excel2Json({
                            url:currentValue.url,
                            id:currentValue.id,
                            prefix:currentValue.format.toLowerCase()
                        }).then(function(res) {
                            currentValue.data = res;
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            })
        }, Promise.resolve()).then(function() {
            console.log('readResources end');
            resolve(data);
        });
    });    
}

function checkImage(data) {
    console.log("readResources start");
    data.images = [];
    return new Promise(function(resolve, reject) {
        var noImg = true;
        for (var i=0;i<data.resources.length;i++) {
            console.log(data.resources[i].format);
            if (data.resources[i].format === 'JPEG') {
                noImg = false;
                data.images.push(data.resources[i]);
            }
        }
        if (noImg) {
            console.log('no image');
            resolve(null);
        } else {
            console.log('image');
            resolve(data);
        }
    });    
}

function makeExcelList() {
    readPackageList().then(function(list) {
        return list.reduce(function(prevValue, currentValue) {
            return prevValue.then(function() {
                return readPackageDetail(currentValue);
            })
            .then(readResources)
            .then(function(data) {
                _data.push(data);
            });
        }, Promise.resolve());
    }).then(function() {
        console.log('--------------------------');
        var renderer = ECT({ root : __dirname + '/views' });
        var md = renderer.render('out.ect',{
            'data': _data
        });
        fs.writeFile('shizuoka-open-data.md', md , function (err) {
            if (err) {
                console.log(err);
            }
        });
    });
}

function makeImageList() {
    readPackageList().then(function(list) {
        return list.reduce(function(prevValue, currentValue) {
            return prevValue.then(function() {
                return readPackageDetail(currentValue);
            })
            .then(checkImage)
            .then(function(data) {
                if (data) {
                    _data.push(data);
                }
            });
        }, Promise.resolve());
    }).then(function() {
        console.log('--------------------------');
        console.log(JSON.stringify(_data));
        var renderer = ECT({ root : __dirname + '/views' });
        var md = renderer.render('img.ect',{
            'data': _data
        });
        fs.writeFile('shizuoka-open-data-image.md', md , function (err) {
            if (err) {
                console.log(err);
            }
        });
    });
    
}

var argValue = process.argv[2];
if (argValue === 'image') {
    makeImageList();
} else if (argValue === 'excel') {
    makeExcelList();   
}