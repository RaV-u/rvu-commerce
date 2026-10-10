# RVU Commerce — التثبيت الموحد لكل الناس

**نسخة تشغيل واحدة للمدرّب وكل الطلاب.** بتشتغل محليًا على Docker، وكل جهاز له قاعدة بيانات منفصلة.

## لو Windows + Docker Desktop
1. افتح **PowerShell as Administrator** واكتب:
```powershell
wsl --install -d Ubuntu
wsl --update
wsl -l -v
```
2. اعمل Restart لو Windows طلب. افتح Ubuntu من Start وأنشئ Username وPassword. لازم `wsl -l -v` يعرض Ubuntu بنوع **VERSION 2**. لو 1 شغّل `wsl --set-version Ubuntu 2` في PowerShell.
3. افتح Docker Desktop > **Settings > General** وفعّل **Use WSL 2 based engine** إن ظهر.
4. افتح **Settings > Resources > WSL Integration**، فعّل **Ubuntu** واضغط **Apply & Restart**. سيب Docker Desktop شغال.
5. افتح **Ubuntu Terminal**، وتأكد:
```bash
docker info
docker compose version
```
لو Docker شغال، متثبتش Docker Engine جوه Ubuntu WSL مرة تانية.

## لو Linux عادي
مش محتاج WSL. شغّل Docker Engine مع Docker Compose Plugin على Linux وتأكد:
```bash
docker info
docker compose version
```
لو Docker متوقف: `sudo systemctl start docker` (على توزيعات systemd). لو ظهر Permission denied، ظبط صلاحيات الـDocker daemon مع المدرّب؛ متشغّلش المثبّت بـsudo.

## تثبيت الموقع — نفس الأمر على WSL وLinux
افتح Ubuntu Terminal أو Linux Terminal وانسخ:

```bash
curl -fL https://github.com/RaV-u/rvu-commerce/releases/download/rvu-latest/setup.sh -o rvu-setup.sh
bash rvu-setup.sh
```

السكريبت بينزّل حزمة RVU Commerce من GitHub Releases ويثبتها في `~/RVU-Commerce` ويشغّلها.

**افتح:** http://localhost:8081

| الحساب | Username | Password |
|---|---|---|
| الأول | `rvu` | `rvucamp` |
| الثاني | `rvu_2` | `rvucamp` |

كل حساب يبدأ بـ15,000 جنيه افتراضي، والعمليات مش بفلوس حقيقية. `1` في الموقع معناه جنيه واحد، مش قرش.

## تحديث الموقع بعدين
```bash
cd ~/RVU-Commerce
bash update.sh
```
كل المدرّبين والطلاب هيشغّلوا **نفس أمر التحديث** ومن نفس GitHub Release.

للتشغيل: `bash install.sh`. للإيقاف بدون مسح البيانات: `bash stop.sh`. لبداية تدريب جديدة: `bash reset.sh` (مش مطلوب للتثبيت). التحديث بيحافظ على Docker Volume، مع إمكانية بدء Run جديد عند تغيير قاعدة البيانات في بعض الإصدارات.

## حل المشاكل
- `docker: command not found` على WSL: فعّل Ubuntu في Docker Desktop WSL Integration.
- `Cannot connect to Docker daemon`: شغّل Docker Desktop أو Docker Engine.
- `Port 8081 allocated`: اقفل أي موقع آخر شغال على 8081.
- لو WSL Integration مش ظاهر في Docker Desktop، تأكد إن Docker شغّال بوضع **Linux containers**.
- Burp Proxy ممكن يكون على 8080، والموقع نفسه على 8081.
- **ماتضغطش Code > Download ZIP من GitHub**، لأن ده السورس. استخدام الحزمة الجاهزة فقط.
- ما تعرضش اللاب على الإنترنت.

روابط رسمية: 
- https://github.com/RaV-u/rvu-commerce/releases/tag/rvu-latest
- https://learn.microsoft.com/en-us/windows/wsl/install
- https://docs.docker.com/desktop/features/wsl/
