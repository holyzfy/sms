# 短信验证码服务 

基于腾讯云短信的手机验证码服务

## 安装

1. 运行 `npm install`
2. 编辑`config/default.js`并另存为`config/local.js`

## 如何使用

运行 `node index.js` 启动http服务，推荐使用[pm2](https://www.npmjs.com/package/pm2)

## 接口文档

### POST `/sms`

发送验证码

参数

- mobile: 手机号（必填）

响应

```js
{
    status: 0, // 0表示发送成功，其他值表示发送失败
    message: ""
}
```

### POST `/check`

校验验证码

参数

- mobile: 手机号（必填）
- code: 验证码（必填）
- sign: 签名（必填），请看配置文件

响应

```js
{
    status: 0, // 0表示验证码正确，其他值表示验证码错误或已过期
    message: ""
}
```
