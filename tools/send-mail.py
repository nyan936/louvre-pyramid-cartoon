#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
备用手动发信（当本机代理劫持 smtp.qq.com:465、把隐式 TLS 降级成明文时用）
走 587 + STARTTLS。授权码从 ~/.dsh/.credentials.yaml 的 refs.FOXMAIL_AUTH_CODE 读，不落地、不打印。

用法：
  python3 tools/send-mail.py <收件人> <主题> <正文txt> <正文html|-> [附件...]
"""
import sys, os, ssl, smtplib, mimetypes, pathlib
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

CRED = pathlib.Path.home() / ".dsh" / ".credentials.yaml"
SMTP_HOST, SMTP_PORT = "smtp.qq.com", 587
SENDER = "nyanspring@foxmail.com"


def read_auth_code():
    import yaml
    data = yaml.safe_load(CRED.read_text(encoding="utf-8"))
    code = (data.get("refs") or {}).get("FOXMAIL_AUTH_CODE")
    if not code:
        raise SystemExit("凭据里找不到 refs.FOXMAIL_AUTH_CODE")
    return code.strip()


def main():
    if len(sys.argv) < 5:
        raise SystemExit(__doc__)
    to = [a.strip() for a in sys.argv[1].split(",") if a.strip()]
    subject, txt_path, html_path = sys.argv[2], sys.argv[3], sys.argv[4]
    files = sys.argv[5:]

    msg = EmailMessage()
    msg["From"] = formataddr(("DSH Agent", SENDER))
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="foxmail.com")
    msg.set_content(pathlib.Path(txt_path).read_text(encoding="utf-8"))
    if html_path != "-" and pathlib.Path(html_path).exists():
        msg.add_alternative(pathlib.Path(html_path).read_text(encoding="utf-8"), subtype="html")

    for f in files:
        p = pathlib.Path(f)
        ctype, _ = mimetypes.guess_type(p.name)
        maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
        # 用 UTF-8 文件名（RFC2231），中文附件名也不会乱码
        msg.add_attachment(p.read_bytes(), maintype=maintype, subtype=subtype, filename=p.name)

    ctx = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=60) as s:
        s.ehlo()
        s.starttls(context=ctx)
        s.ehlo()
        s.login(SENDER, read_auth_code())
        refused = s.send_message(msg)
    print(f"sent to {', '.join(to)} | attachments {len(files)} | refused {refused or 'none'}")


if __name__ == "__main__":
    main()
