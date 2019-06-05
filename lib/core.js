var config = require('config');
var {promisify} = require('util');
var redis = require('redis');
var dbClient = redis.createClient(config.redis);
var express = require('express');
var bodyParser = require('body-parser');
var formData = require('express-form-data');
var to = require('await-to-js').default;
var smsSDK = require('qcloudsms_js');

var app;
var db = {
    setex: promisify(dbClient.setex).bind(dbClient),
    keys: promisify(dbClient.keys).bind(dbClient),
    get: promisify(dbClient.get).bind(dbClient),
    del: promisify(dbClient.del).bind(dbClient),
};

function start(callback) {
    app = initApp();
    app.listen(config.port, callback);
}

function initApp() {
    var app = express();
    app.use(bodyParser.urlencoded({extended: false}));
    app.use(formData.parse());
    app.get('/sms', sms);
    app.post('/check', check);
    return app;
}

async function sms(req, res) {
    var mobile = req.query.mobile;
    if(!mobile) {
        return res.send({
            status: 10001,
            message: '参数错误',
            data: {
                mobile: '请填写手机号'
            }
        });
    }
    var [error] = await to(sendMessage(mobile));
    if(error) {
        res.send({
            status: 10002,
            message: error.message
        }); 
    }
    res.send({
        status: 0,
    });
}

async function sendMessage(mobile) {
    var options = config.sms;
    var api = smsSDK(options.appId, options.appKey);
    var sender = api.SmsSingleSender();
    var sendWithParam = promisify(sender.sendWithParam).bind(sender);
    var expire = 2;
    var args = [
        86, // nation dialing code, e.g. China is 86
        mobile, 
        options.templateId, 
        [ // template parameters
            await createCode(mobile, expire),
            expire, // expire after 2 minutes
        ], 
        options.smsSign, 
        '', // extend field, default is empty string
        '', // ext field, content will be returned by server as it is
    ]; 
    await sendWithParam(...args);
}

async function createCode(mobile, expire) {
    // 同一个手机在同一时间段内可以有多个有效的验证码
    var code = (Math.random() * 10000).toFixed(0);
    var key = `${mobile}-${code}`;
    db.setex(key, expire * 60, 1);
    return code;
}

async function check(req, res) {
    var {mobile, code} = req.body;
    var key = `${mobile}-${code}`;
    var [error, existed] = await to(db.get(key));
    if(error) {
        return handleError(res, error); 
    }
    var result;
    if(existed) {
        result = {
            status: 0,
        };
        await to(cleanup(mobile));
    } else {
        result = {
            status: 10004,
            message: '验证码错误或已过期' 
        };
        await to(tooManyRetries(mobile));
    }
    res.send(result);
}

function handleError(res, error) {
    res.send({
        status: 10003,
        message: error.message
    });
}

async function cleanup(mobile) {
    var pattern = mobile + '*';
    var [error, list] = await to(db.keys(pattern));
    if(error) {
        return;
    }
    for(var key of list) {
        await to(db.del(key)); 
    }
    await to(db.del(`retry-${mobile}`));
}

// 同一个手机的验证码最多可被检查3次（不论是否匹配），防止暴力攻击
async function tooManyRetries(mobile) {
    var retryKey = `retry-${mobile}`;
    var expire = 2 * 60;
    var [error, count] = await to(db.get(retryKey));
    if(error) {
        return;
    }
    await to(db.setex(retryKey, expire, ++count));
    var MAX = 3;
    if(count >= MAX) {
        await cleanup(mobile);
    }
}

module.exports = start;
