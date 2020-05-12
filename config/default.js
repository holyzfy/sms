module.exports = {
    port: 9181,
    redis: {
        // see: https://github.com/NodeRedis/node_redis#options-object-properties 
    },
    expireMinutes: 10,
    maxCountInOneMinute: 2,
    sms: {
        // see: https://cloud.tencent.com/document/product/382/43197
        sign: '',
        templateId: 0,
        secretId: '',
        secretKey: '',
        endpoint: '',
    },
    sign: '',
};
