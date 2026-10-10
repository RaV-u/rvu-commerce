# RVU Commerce — تجهيز نسخة الكامب

**موقع واحد:** http://localhost:8081 — كل الخدمات تحت **My Account → Services**.

**الحساب الأول:** `rvu` / `rvucamp`  
**الحساب الثاني:** `rvu_2` / `rvucamp`

## تحديث وتشغيل نسخة المدرب

```bash
cd ~/rvu-commerce
git pull origin main
bash scripts/start.sh
docker compose ps
```

## تجهيز ملف تبعته للطلاب

```bash
cd ~/rvu-commerce
bash scripts/export-student-package.sh
```

هتلاقي ملف `dist-packages/RVU-Commerce-Student.tar.gz`. **ابعت الملف ده بس** مع تعليمات التثبيت القصيرة، من غير GitHub أو سورس أو حلول أو ملفات اختبار. ملف الحزمة كبير نسبيًا لأنه يحتوي Docker Images جاهزة.

## إعادة التجربة من الأول

```bash
docker compose run --rm migrate node dist/server/reset-local.js RESET
```

ده بيبدأ بيئة جديدة من غير حذف الـDatabase Volume. ما تستخدمش `docker compose down -v`.

## التحقق السريع

```bash
docker compose ps
docker stats --no-stream
```

الموقع مخصص للتشغيل المحلي على `127.0.0.1:8081`، ما تفتحش البورت للإنترنت. خلي GitHub **Private** قبل السيشن لأن تاريخ الـRepository القديم ممكن يكشف تفاصيل لا نريد إظهارها للطالب.
