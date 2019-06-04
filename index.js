var start = require('./lib/core.js');
start(() => console.log('服务已启动'));

process.on('unhandledRejection', (reason, p) => console.error('Unhandled Rejection:', reason));
