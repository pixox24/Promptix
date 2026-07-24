# 自动发布用户委托开关设计

## 目标

在 `/admin/autopublish` 自动发布控制台提供“启用用户委托一键发布”入口，让 owner/admin 能安全修改 `autopublish.delegatedEnabled`，解决智能入库一键自动发布返回 `AUTOPUBLISH_DELEGATED_DISABLED` 时缺少可操作入口的问题。

## 范围

- 增加用户委托开关的读取、展示与修改能力。
- 修改操作创建新的不可变治理规则版本并记录审计。
- 保持 `shadow/live`、总冻结、用户委托三项控制相互独立。
- 不暴露 `scheduledAgentEnabled`、质量阈值、安全规则、重复规则、预算或许可设置。
- 不改变数据库迁移中的安全默认值；默认仍为关闭且处于 `shadow`。

## 交互

控制台顶部新增一张“用户委托一键发布”控制卡：

- 开启：智能入库的一键自动发布可创建 delegated 运行。
- 关闭：请求继续以 `AUTOPUBLISH_DELEGATED_DISABLED` 被拒绝。
- 开启且 `shadow`：运行完整演练，但不执行真实发布。
- 开启且 `live`：允许运行真实发布链路。
- 开启和关闭均显示确认对话框。
- 修改成功后使用全局 Toast 提示，并重新读取服务端状态。
- owner/admin 可操作；只读角色只能查看状态。

## 后端

扩展自动发布运营服务：

- `overview()` 返回活动规则中的 `mode`、`frozen`、`delegatedEnabled` 和 `scheduledAgentEnabled`。
- 新增 `delegated(input)` 操作，只能写入布尔值 `delegatedEnabled`。
- 新增 `POST /api/admin/autopublish/delegated`，请求体仅接受：

```json
{
  "enabled": true,
  "reason": "operations console"
}
```

接口复用 owner/admin 权限中间件。服务端忽略或拒绝策略覆盖字段，创建新规则版本并写入 `autopublish.rules_changed` 审计事件。

## 前端

`AutopublishPage` 从 overview 初始化服务端状态，使用专用接口修改开关。界面清楚显示：

- 用户委托：已启用/已关闭。
- 当前执行模式：shadow/live。
- 对实际效果的组合说明。

操作期间禁用开关，失败时保留原状态并显示错误提示，不进行乐观状态伪装。

## 测试

- 运营服务测试：只修改 `delegatedEnabled`，保留其他规则并生成新版本和审计。
- 路由契约测试：专用 delegated 路由存在。
- Web 契约测试：控制台显示开关、组合说明、确认操作与服务端状态。
- Web 构建和 API/Web 全量测试通过。

## 非目标

- 不开放定时 Agent 自动发布开关。
- 不自动切换 `shadow/live`。
- 不解除总冻结。
- 不允许 Agent 自行开启用户委托。
- 不在智能入库页面直接修改全局规则。
