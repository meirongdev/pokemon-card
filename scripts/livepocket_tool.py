#!/usr/bin/env python3
"""
LivePocket Account Automation & Research Tool

此脚本通过 AppleScript 桥接已登录 LivePocket 的本地 Google Chrome 标签页，
实现动态提取 CSRF Token、发送个人信息更新请求并检查更新结果。

前提要求:
1. Google Chrome 处于运行状态，且已打开并登录 https://livepocket.jp/account 或 https://livepocket.jp/account/profile
2. Google Chrome 顶部菜单开启了: 显示 (View) > 开发者 (Developer) > 允许来自 Apple 事件的 JavaScript (Allow JavaScript from Apple Events)
"""

import sys
import json
import time
import urllib.parse
import subprocess
import argparse

def execute_js_in_tab(js_code: str) -> str:
    """在 Chrome 中包含 livepocket.jp 的活跃标签页中执行 JavaScript 并获取字符串返回值"""
    escaped_js = js_code.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
    as_script = f"""
    tell application "Google Chrome"
        repeat with w in windows
            repeat with t in tabs of w
                if URL of t contains "livepocket.jp" then
                    return execute t javascript "{escaped_js}"
                end if
            end repeat
        end repeat
        return "ERROR: No LivePocket tab found"
    end tell
    """
    res = subprocess.run(["osascript", "-e", as_script], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"AppleScript execution failed: {res.stderr}")
    return res.stdout.strip()

def get_current_info():
    """读取当前页面的 URL、CSRF Token 及账户信息"""
    js = """
    (() => {
        return JSON.stringify({
            url: window.location.href,
            title: document.title,
            csrfToken: document.querySelector('meta[name="csrf-token"]')?.content || null,
            formAuthToken: document.querySelector('input[name="authenticity_token"]')?.value || null,
            bodySnippet: document.body.innerText.slice(0, 1500)
        });
    })()
    """
    out = execute_js_in_tab(js)
    if out.startswith("ERROR:"):
        print(out)
        return None
    return json.loads(out)

def send_profile_patch(last_name: str, first_name: str = None, prefecture_id: str = "13", country_id: str = ""):
    """向 /account/profile 发送 PATCH 请求更新个人信息"""
    print(f"[*] 准备更新个人信息: last_name='{last_name}', first_name='{first_name}', prefecture_id={prefecture_id}")
    
    # 1. 确保在 profile 页面获取最新 token
    info = get_current_info()
    if not info:
        return False
    
    csrf = info.get("csrfToken")
    form_token = info.get("formAuthToken") or csrf
    if not csrf:
        print("[-] 未在当前页面找到 CSRF Token")
        return False

    # 2. 构造查询参数
    params = [
        ("_method", "patch"),
        ("authenticity_token", form_token),
        ("user[last_name]", last_name),
    ]
    if first_name is not None:
        params.append(("user[first_name]", first_name))
    params.extend([
        ("user[prefecture_id]", prefecture_id),
        ("user[country_id]", country_id),
        ("button", "")
    ])
    body_str = urllib.parse.urlencode(params)

    # 3. 构造并在浏览器中注入执行 fetch
    js_fetch = f"""
    (() => {{
        window.__agy_res = null;
        fetch("https://livepocket.jp/account/profile", {{
            headers: {{
                "accept": "text/vnd.turbo-stream.html, text/html, application/xhtml+xml",
                "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                "x-csrf-token": "{csrf}"
            }},
            referrer: window.location.href,
            body: "{body_str}",
            method: "POST",
            mode: "cors",
            credentials: "include"
        }}).then(async r => {{
            const t = await r.text();
            window.__agy_res = JSON.stringify({{
                status: r.status,
                ok: r.ok,
                url: r.url,
                redirected: r.redirected,
                length: t.length
            }});
        }}).catch(e => {{
            window.__agy_res = JSON.stringify({{ error: e.toString() }});
        }});
    }})()
    """
    execute_js_in_tab(js_fetch)
    print("[*] 请求已发送，等待响应...")
    
    # 4. 轮询获取响应
    for _ in range(30):
        time.sleep(0.2)
        res = execute_js_in_tab("window.__agy_res || ''")
        if res and res != "ERROR: No LivePocket tab found":
            data = json.loads(res)
            print(f"[+] 响应结果: Status={data.get('status')}, OK={data.get('ok')}, Length={data.get('length')}")
            return data
    print("[-] 等待响应超时")
    return None

def verify_account_name():
    """刷新 /account 页面并验证最新展示的姓名"""
    print("[*] 正在导航至 https://livepocket.jp/account 验证姓名...")
    execute_js_in_tab("window.location.href = 'https://livepocket.jp/account';")
    time.sleep(2.5)
    text = execute_js_in_tab("document.body.innerText")
    found_lines = []
    for line in text.splitlines():
        if any(keyword in line for keyword in ["Name", "氏名", "氏", "名", "姓"]):
            found_lines.append(line.strip())
    print("[+] 页面当前相关字段:")
    for l in found_lines:
        print(f"    - {l}")

def main():
    parser = argparse.ArgumentParser(description="LivePocket Profile API Testing Tool")
    subparsers = parser.add_subparsers(dest="command", help="子命令")
    
    # check
    subparsers.add_parser("check", help="检查 LivePocket 标签页与 Token 状态")
    
    # update
    update_cmd = subparsers.add_parser("update", help="更新个人信息")
    update_cmd.add_argument("--last-name", required=True, help="姓 (Family name)")
    update_cmd.add_argument("--first-name", default=None, help="名 (First name，仅用于测试越权过滤)")
    update_cmd.add_argument("--prefecture", default="13", help="都道府县代码 (默认 13 为东京)")
    
    # verify
    subparsers.add_parser("verify", help="验证账户页面当前显示的姓名")

    args = parser.parse_args()
    if args.command == "check":
        info = get_current_info()
        if info:
            print(f"[+] 标签页标题: {info['title']}")
            print(f"[+] 当前 URL: {info['url']}")
            print(f"[+] CSRF Token: {info['csrfToken']}")
            print(f"[+] Form Token: {info['formAuthToken']}")
    elif args.command == "update":
        res = send_profile_patch(args.last_name, args.first_name, args.prefecture)
        if res:
            verify_account_name()
    elif args.command == "verify":
        verify_account_name()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
