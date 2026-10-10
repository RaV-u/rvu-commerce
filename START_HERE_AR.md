# RVU Commerce — نسخة واحدة للكل

**المدرّب والطلاب بيستخدموا نفس نسخة Docker ونفس التحديثات.**

## Windows
في PowerShell كمسؤول: `wsl --install -d Ubuntu`. افتح Docker Desktop > Settings > Resources > WSL Integration وفعل Ubuntu. افتح Ubuntu وتأكد إن `docker info` شغال.

## Linux
تأكد Docker Engine وCompose شغالين مع مستخدمك (`docker info`).

## التثبيت على Ubuntu WSL أو Linux
```bash
curl -fL https://github.com/RaV-u/rvu-commerce/releases/download/rvu-latest/setup.sh -o rvu-setup.sh
bash rvu-setup.sh
```

بعد التثبيت: **http://localhost:8081**.

## أي تحديث للجميع
```bash
cd ~/RVU-Commerce
bash update.sh
```

الحسابين: `rvu` / `rvucamp` و`rvu_2` / `rvucamp`، كل حساب 15,000 جنيه افتراضي. ما فيش أي نسخة Instructor أو Student منفصلة.

[الدليل الكامل خطوة بخطوة](student/README_AR.md) | [نسخة GitHub الرسمية](https://github.com/RaV-u/rvu-commerce/releases/tag/rvu-latest).
