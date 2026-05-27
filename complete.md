# POST /api/v3/chunk/complete 接口文档

## POST /api/v3/chunk/complete

完成分块上传。客户端调用 `/api/v3/chunk/init` 创建上传会话，并通过 `/api/v3/chunk/upload` 上传全部分块后，调用本接口触发文件合并、MD5 校验和异步 IPFS 上传。

**认证**：PinMe JWT

```HTTP
authentication-tokens: <pinme-jwt>
token-address: <firebase-uid>

```

**Content\-Type**：`application/json`

---

### 请求

```JSON
{
  "session_id": "4f2e...",
  "uid": "firebase-uid",
  "project_name": "my-project",
  "import_as_car": false,
  "action": "project_deploy"
}

```

|字段|类型|必填|说明|
|---|---|---|---|
|`session\_id`|string|是|`/api/v3/chunk/init` 返回的上传会话 ID|
|`uid`|string|否|兼容旧客户端字段。服务端以 `token\-address` 请求头中的 UID 为准，并会覆盖请求体里的 `uid`|
|`project\_name`|string|否|关联的项目名。传入时要求项目属于当前登录用户，上传结果使用该项目上下文，扣费规则同 `/api/v3/add`|
|`import\_as\_car`|bool|否|是否按 CAR 文件导入，默认 `false`。为 `true` 时不支持目录上传|
|`action`|string|否|前端调用场景标识，仅用于服务端日志和 trace 属性，不参与鉴权、扣费、上传结果生成|

`action` 也可以通过 query 参数传入：

```HTTP
POST /api/v3/chunk/complete?action=project_deploy

```

若请求体和 query 同时传入 `action`，以请求体字段为准。

---

### 响应

#### 成功 `200`

接口立即返回异步上传的 `trace\_id`。客户端随后调用 `GET /api/v3/up\_status` 轮询上传结果。

```JSON
{
  "code": 200,
  "msg": "ok",
  "data": {
    "trace_id": "4f2e..."
  }
}

```

同一个 `session\_id` 已经开始 complete 时，再次调用会返回同一个 `trace\_id`，便于客户端重试。

#### 错误响应

|HTTP 状态码|code|场景|
|---|---|---|
|400|400|缺少 `authentication\-tokens` 或 `token\-address`|
|400|400|JSON 参数格式错误、缺少 `session\_id`、缺少有效 UID|
|400|400|`uid` 与上传会话不匹配|
|400|400|分块未全部上传完成|
|400|400|MD5 校验失败|
|400|400|`import\_as\_car=true` 但上传会话是目录|
|400|40001|钱包余额不足|
|401|20001|JWT 无效或过期|
|403|500|`project\_name` 不属于当前用户|
|404|500|`session\_id` 对应的上传会话不存在|
|500|500|合并文件、解压目录、检查钱包余额或上传失败|

错误响应体示例：

```JSON
{
  "code": 400,
  "msg": "invalid param",
  "data": {
    "error": "Missing blocks, uploaded: 1/3"
  }
}

```

---

### 示例

```Bash
curl -X POST "https://pinme.benny1996.win/api/v3/chunk/complete" \
  -H "authentication-tokens: <pinme-jwt>" \
  -H "token-address: <firebase-uid>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "4f2e...",
    "project_name": "my-project",
    "action": "project_deploy"
  }'

```

---
