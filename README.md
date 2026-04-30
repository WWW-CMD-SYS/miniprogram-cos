# 腾讯云COS文件管理器 - 微信小程序版

基于原生微信小程序开发的 COS 文件管理器。

## 功能特性

- ✅ 文件列表展示（支持分页）
- ✅ 文件上传（支持多文件）
- ✅ 文件预览（图片、PDF、Office、文本）
- ✅ 文件下载（支持保存到相册）
- ✅ 文件删除（支持批量删除）
- ✅ COS 配置管理
- ✅ 主题切换（深色/浅色模式）
- ✅ 存储类型标签显示

## 项目结构

```
miniprogram-3/
├── app.js              # 应用入口
├── app.json            # 应用配置
├── app.wxss            # 全局样式
├── pages/
│   ├── index/          # 主页面（文件列表）
│   ├── config/         # 配置页面
│   └── file-detail/    # 文件详情页
├── utils/
│   ├── config.js       # COS 配置管理
│   ├── cos.js          # COS API 请求
│   └── format.js       # 格式化工具
└── project.config.json # 项目配置
```

## 快速开始

### 1. 导入项目

1. 下载微信开发者工具
2. 点击"导入项目"
3. 选择 `~/miniprogram-3` 目录
4. AppID 填写 `touristappid`（测试号）或你的小程序 AppID

### 2. 配置后端 API

小程序需要配合后端服务使用。后端需要提供以下 API 接口：

#### GET /api/list
获取文件列表

响应：
```json
{
  "code": 0,
  "data": {
    "files": [
      {
        "key": "path/to/file.jpg",
        "name": "file.jpg",
        "size": 1024,
        "storageClass": "STANDARD",
        "lastModified": "2024-01-01T00:00:00Z",
        "url": "https://..."
      }
    ]
  }
}
```

#### POST /api/upload
上传文件

请求：`multipart/form-data`
- file: 文件

响应：
```json
{
  "code": 0,
  "data": {
    "url": "https://...",
    "id": "file-id"
  }
}
```

#### DELETE /api/delete
删除文件

请求：
```json
{
  "key": "path/to/file.jpg"
}
```

响应：
```json
{
  "code": 0,
  "message": "删除成功"
}
```

#### POST /api/content
获取文本文件内容

请求：
```json
{
  "key": "path/to/file.txt"
}
```

响应：
```json
{
  "code": 0,
  "data": {
    "content": "文件内容..."
  }
}
```

#### POST /api/validate
验证配置

响应：
```json
{
  "code": 0,
  "message": "配置有效"
}
```

### 3. 配置合法域名

在小程序后台配置：
- 服务器域名 → request 合法域名：你的 API 域名
- 服务器域名 → uploadFile 合法域名：你的上传域名
- 服务器域名 → downloadFile 合法域名：你的下载域名

## 配置说明

### 获取腾讯云 COS 凭证

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/cos)
2. 创建存储桶
3. 获取 SecretId、SecretKey

### 在小程序中填写配置

1. 首次使用会提示配置 COS 参数
2. 填写 SecretId、SecretKey、存储桶名称、地域
3. 点击保存

## 注意事项

1. **跨域问题**: 小程序 request 请求需配置合法域名
2. **文件上传**: 注意小程序对文件大小的限制
3. **图片预览**: 使用小程序原生预览功能
4. **数据安全**: SecretKey 存储在本地，请确保设备安全

## License

MIT
