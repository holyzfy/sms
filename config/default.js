module.exports = {
    port: 9181,
    redis: {
        // see: https://github.com/NodeRedis/node_redis#options-object-properties 
    },
    expireMinutes: 10,
    maxCountInOneMinute: 2,
    sms: {
        // see: https://github.com/qcloudsms/qcloudsms_js#%E7%A4%BA%E4%BE%8B 
        appId: '',
        appKey: '',
        templateId: 0,
        smsSign: '',
    },
    sign: '',
};
