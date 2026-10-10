# RVU Commerce — التثبيت قبل السيشن

**المتطلبات:** Windows 10/11 أو Linux، وDocker Desktop شغال مع WSL2 (على Windows)، ومساحة فاضية كفاية لفك الحزمة وصور Docker. **لا تحتاج Node.js أو GitHub.**

1. فك ضغط ملف `RVU-Commerce-Student.tar.gz`.
2. افتح Ubuntu (WSL) وروح لمجلد `RVU-Commerce-Student` اللي اتفك.
3. نفّذ الأمر: `bash install.sh`.
4. استنى لحد ما تظهر رسالة `RVU Commerce is ready`.
5. افتح **http://localhost:8081**.

**الحساب الأول:** `rvu` / `rvucamp`  
**الحساب الثاني:** `rvu_2` / `rvucamp`

كل الحسابات وخدمات المتجر داخل نفس الموقع. جرب تسجيل الدخول والتصفح قبل السيشن، لكن سيب تجارب الـCheckout والـWallet للسيشن نفسها.

للإيقاف بدون حذف البيانات: `bash stop.sh`.  
لو Docker مش شغال، افتح Docker Desktop وجرب `bash install.sh` تاني.

**مهم:** شغّل المتجر على جهازك فقط، وما تنشرش البورت أو تفتحه للعامة.
