var config = require('config');
var {promisify} = require('util');
var redis = require('redis');
var dbClient = redis.createClient(config.redis);
var express = require('express');
var to = require('await-to-js').default;
var smsSDK = require('qcloudsms_js');

var app;
var setex = promisify(dbClient.setex).bind(dbClient);

function start(callback) {
    app = initApp();
    app.listen(config.port, callback);
}

function initApp() {
    var app = express();
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
        debug: {
            query: req.query
        },
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
    var code = (Math.random() * 10000).toFixed(0);
    var key = `${mobile}-${code}`;
    console.log(key);
    setex(key, expire * 60* 1000, 1);
    return code;
}

function check(req, res) {
    res.send({
        status: 0,
    });
}

module.exports = start;
