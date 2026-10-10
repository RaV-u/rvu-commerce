# RVU Commerce — نزّل الموقع من GitHub

**رابط تحميل نسخة الطلاب مباشرة:**
https://github.com/RaV-u/rvu-commerce/releases/latest/download/RVU-Commerce-Student.tar.gz

**لا تضغط Source code (ZIP)**. نزّل ملف **RVU-Commerce-Student.tar.gz** من [Releases](https://github.com/RaV-u/rvu-commerce/releases/latest)؛ ده ملف Docker جاهز من غير السورس والاختبارات.

## المطلوب قبل السيشن

Windows 10/11 أو Linux. لو Windows: شغّل **Docker Desktop** وفعّل **WSL2 integration** مع Ubuntu. مش محتاج Git ولا Node.js. تأكد إن بورت **8081** فاضي.

## التثبيت من الصفر — Ubuntu WSL

انسخ الأوامر كلها داخل Ubuntu:

```bash
mkdir -p ~/rvu-commerce-student && cd ~/rvu-commerce-student
curl -fL "https://github.com/RaV-u/rvu-commerce/releases/latest/download/RVU-Commerce-Student.tar.gz" -o RVU-Commerce-Student.tar.gz
tar -xzf RVU-Commerce-Student.tar.gz
cd RVU-Commerce-Student
bash install.sh
```

بعد ظهور `RVU Commerce is ready` افتح **http://localhost:8081** من Firefox.

## حسابات التدريب

| الحساب | Username | Password | الرصيد |
| --- | --- | --- | --- |
| الأول | `rvu` | `rvucamp` | 15,000 جنيه |
| الثاني | `rvu_2` | `rvucamp` | 15,000 جنيه |

الحسابين مستقلين في Wallet وCart وOrders وSession. الأسعار **بالجنيه المصري، مش بالقرش**: `1` يعني 1 جنيه، و`100` يعني 100 جنيه. كل العمليات مالية افتراضية.

## أثناء التدريب

- كل أدوات الحساب من **My Account → Services**.
- لفتح الحسابين معًا استخدم متصفحين مختلفين، أو Firefox عادي ونافذة Private.
- لو بتستخدم Burp، خليه يسمع على `127.0.0.1:8080`، والموقع نفسه `localhost:8081`.
- للإيقاف بدون حذف بيانات: `bash stop.sh` من مجلد `RVU-Commerce-Student`.
- للتشغيل بعد الإيقاف: `bash install.sh`.
- **لتحديث الموقع كل مرة (أمر واحد فقط):** `bash update.sh`، من داخل مجلد `RVU-Commerce-Student`. بيجيب أحدث نسخة من GitHub ويعيد تشغيل الموقع بدون حذف Docker Volume.
- لإعادة ضبط اللاب وبداية تدريب جديدة: `bash reset.sh` (بيبدأ Run جديد وبيحتفظ بالسجلات القديمة داخل قاعدة البيانات).

لو حصل خطأ، تأكد إن Docker Desktop شغال والـWSL integration مفعّل، وإنك داخل المجلد الصحيح وبورت 8081 فاضي. الموقع محلي فقط وماينفعش يتعرض للإنترنت.

## لو ثبّت نسخة قديمة وما عندكش update.sh
نفّذ الأمرين دول **مرة واحدة بس** من داخل مجلد `RVU-Commerce-Student`:

```bash
curl -fL https://github.com/RaV-u/rvu-commerce/releases/download/student-latest/update.sh -o update.sh
bash update.sh
```

بعدها أي تحديث مستقبلي محتاج `bash update.sh` فقط. التحديث قد يبدأ Run جديد عند وجود تغيير في قاعدة البيانات؛ بيانات الـRuns القديمة مش بتتمسح.
