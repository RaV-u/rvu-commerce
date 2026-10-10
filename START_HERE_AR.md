# RVU Commerce — تجهيز الكامب

## نسخة الطالب من GitHub

**التحميل المباشر:** https://github.com/RaV-u/rvu-commerce/releases/latest/download/RVU-Commerce-Student.tar.gz

الطلاب ينزّلوا `RVU-Commerce-Student.tar.gz` من GitHub Releases (مش Download ZIP بتاع السورس)، ويتبعوا [دليل التثبيت بالعربي](student/README_AR.md). وبعد التثبيت، أي تحديث من نفس المجلد بأمر واحد: `bash update.sh`.

موقع واحد: **http://localhost:8081**، والحسابين `rvu` و`rvu_2` بكلمة المرور `rvucamp`، وكل حساب يبدأ بـ **15,000 جنيه افتراضي**. الحسابات محفوظة ومنفصلة.

## تحديث وتشغيل نسخة المدرّب

```bash
cd ~/rvu-commerce
git pull origin main
bash scripts/start.sh
docker compose ps
```

## فحص الموقع

```bash
curl -fsS http://localhost:8081/api/health
docker compose ps
docker stats --no-stream
```

## تصدير حزمة يدوية لو احتجت

```bash
bash scripts/export-student-package.sh
```

بعد نجاح GitHub Actions، Release بيتحدث تلقائيًا بنفس رابط التحميل. **متشاركش سورس الـRepository في سيشن Blind Hunting**: السورس والـGit history فيهما تفاصيل اللابات والاختبارات. نسخة الطالب اللي في Release جاهزة للتشغيل بدون سورس.

## إعادة ضبط تجربة المدرّب

```bash
docker compose run --rm migrate node dist/server/reset-local.js RESET
```

الـReset يبدأ Run جديد من غير حذف Docker Volume. الموقع مربوط بـ `127.0.0.1:8081` فقط.
