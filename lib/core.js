var config = require('config');
var {promisify} = require('util');
var redis = require('redis');
var dbClient = redis.createClient(config.redis);
var express = require('express');
var bodyParser = require('body-parser');
var formData = require('express-form-data');
var to = require('await-to-js').default;
const tencentcloud = require('tencentcloud-sdk-nodejs');
const SmsClient = tencentcloud.sms.v20190711.Client;
const models = tencentcloud.sms.v20190711.Models;
const Credential = tencentcloud.common.Credential;

var client;
var app;
var db = {
    setex: promisify(dbClient.setex).bind(dbClient),
    keys: promisify(dbClient.keys).bind(dbClient),
    get: promisify(dbClient.get).bind(dbClient),
    del: promisify(dbClient.del).bind(dbClient),
};

function start(callback) {
    client = initSmsClient();
    app = initApp();
    app.listen(config.port, callback);
}

function initSmsClient() {
    let cred = new Credential(config.sms.secretId, config.sms.secretKey);
    return new SmsClient(cred);
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
    if(!validSign(req.query.sign)) {
        return res.send({
            status: 19000,
            message: '签名错误',
        });
    }
    if(!mobile) {
        return res.send({
            status: 10001,
            message: '参数错误',
            data: {
                mobile: '请填写手机号'
            }
        });
    }

    var rateOverflow = await checkRate(mobile);
    if(!rateOverflow) {
        var message = '操作过于频繁，请稍后重试';
        return res.send({
            status: 20000,
            message,
            data: {
                mobile: message 
            }
        });
    }
    var [error] = await to(sendMessage(mobile));
    if(error) {
        console.error('sendMessage Error', error);
        return res.send({
            status: 10002,
            message: error.message
        }); 
    }
    res.send({
        status: 0,
    });
}

async function checkRate(mobile) {
    var pattern = `rate-${mobile}-*`;
    var [error, keys] = await to(db.keys(pattern)); // eslint-disable-line no-unused-vars
    return (keys || []).length <= config.maxCountInOneMinute;
}

async function sendMessage(mobile) {
    var options = config.sms;
    var expire = config.expireMinutes;
    var req = new models.SendSmsRequest();
    req.SmsSdkAppid = '1400096974';
    req.Sign = options.sign;
    req.PhoneNumberSet = ['+86' + mobile];
    req.TemplateID = options.templateId;
    req.TemplateParamSet = [
        await createCode(mobile, expire),
        expire, // expire after xxx minutes
    ];
    var sendSms = promisify(client.SendSms).bind(client); 
    await sendSms(req);
}

async function createCode(mobile, expire) {
    // 同一个手机在同一时间段内可以有多个有效的验证码
    var code = Math.random().toString().slice(2, 6).padStart(4, '0');
    var key = `${mobile}-${code}`;
    db.setex(key, expire * 60, 1);
    db.setex(`rate-${key}`, 60, 1);
    return code;
}

async function check(req, res) {
    var {sign, mobile, code} = req.body;
    if(!validSign(sign)) {
        return res.send({
            status: 19000,
            message: '签名错误',
        });
    }
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

function validSign(sign) {
    return sign === config.sign;
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
    var expire = config.expireMinutes * 60;
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
