# Pokemon Card / LivePocket 接口研究

本项目归档了针对 LivePocket（`livepocket.jp`）账户个人信息接口的抓包数据、逆向测试流程及安全机制研究成果。

## 目录结构

* [request.md](request.md)：原始请求的完整 fetch 结构（已去除多余字符并修正参数）。
* [RESEARCH.md](RESEARCH.md)：**详细测试与研究报告**，包含系统架构、安全机制（WAF/Reauth/CSRF/Strong Parameters）、两组测试用例执行流程及官方风控规则分析。
* [scripts/livepocket_tool.py](scripts/livepocket_tool.py)：用于与 Chrome 交互、提取 CSRF Token、发送请求与验证结果的自动化测试脚本。
* [userscripts/livepocket-name-emoji.user.js](userscripts/livepocket-name-emoji.user.js)：**本机显示定制**用户脚本，仅在自己浏览器里把页面显示的姓/名替换成自定义文字或 emoji（不改服务器数据）。
* [userscripts/手机使用指南.md](userscripts/手机使用指南.md)：面向零基础用户的**手机保姆级操作指南**（苹果 / 安卓分别图文步骤）。

## 快速使用

确保 Google Chrome 处于运行状态，且已打开 LivePocket 页面并开启了 `View > Developer > Allow JavaScript from Apple Events`。

```bash
# 检查 Chrome 标签页连接状态及当前 CSRF Token
python3 scripts/livepocket_tool.py check

# 验证账户当前显示的姓名信息
python3 scripts/livepocket_tool.py verify

# 发送个人信息更新请求
python3 scripts/livepocket_tool.py update --last-name "山田"
```
