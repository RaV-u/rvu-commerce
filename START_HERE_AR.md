# RVU Commerce — نسخة M2 للتجربة المحلية

**الحالة الحالية (10 أكتوبر 2026):** اتضافت الـ13 سيناريوهات المتبقية، وبقى الإجمالي **18 من 18 Profile قابل للاختيار والتنفيذ**. فيه اختبارات Backend على PostgreSQL حقيقي (39 اختبارًا)، وواجهة React (4 اختبارات)، واختبارات PGlite، وتشغيل Docker Compose والـHTTP Proxy. تفاصيل الـ13 الجديدة في `docs/EXTENDED_LABS_INSTRUCTOR_AR.md`. الـB06/B12 وبعض الـSpecialist Labs بيستخدموا adapters تعليمية محددة، مش نسخ PortSwigger حرفية. لازم مراجعة تجربة الطالب داخل Chrome/Edge على جهازك قبل الكامب.

**مهم عند تحديث مشروع قائم:** احتفظ بملف `.env` القديم وبـDocker volume؛ لا تولد كلمات مرور قاعدة البيانات من جديد فوق نفس قاعدة البيانات. انسخ الملفات الجديدة فوق مجلد المشروع الحالي، ولا تنسخ `.env.example` باسم `.env`.

## تشغيل التحديث

```bash
cd ~/rvu-commerce
sh scripts/start.sh
docker compose ps
docker compose logs --tail=100 migrate store instructor edge
```

موقع الطلاب: **http://localhost:8080**، وصفحة خدمات الحساب والشركات: **http://localhost:8080/services**. لوحة المدرب: **http://127.0.0.1:8081**. الـHostname المختلف مقصود. سجل دخول كمدرب، وحدد Profile واحدًا، واكتب `RESET` لإنشاء run منفصل ببيانات جديدة. كل تغيير يمسح صلاحية جلسات الطلاب القديمة ويبدأ سيناريو نظيفًا. إعدادات السيناريو لا تظهر للطلاب.

الحساب التجريبي: `alex@learner.rvu.test` / `Studio-Local-2026!`، برصيد افتراضي EGP 15,000.

## سيناريوهات المصدر M2

| Profile | السلوك المستهدف | إثبات النجاح في لوحة المدرب |
| --- | --- | --- |
| Secure baseline | تسعير موثوق، تأكيد دفع مربوط بطلبه، كوبون/ڤاوتشر غير قابل للتكرار | العدادات تظل 0 |
| B01 | Custom workstation quote يأخذ السعر من الطلب بدل سعر السيرفر | Order line مدفوع بسعر أقل من authorized quote |
| B04 | التناوب بين كوبونين يكرر خصم الكوبون الأول | Duplicate promotion entries على طلب مدفوع |
| B08 | Confirm يستخدم إثبات دفع لطلب قديم بدل الطلب الحالي | Confirmed order بدون settled payment |
| B10 | خصم متكرر على Gift Card تسمح قيمته الاسمية بنمو الرصيد | Wallet أعلى من الـopening credit بسبب redeemed discounted gift card |
| R01 | متطلب صرف Voucher مرة واحدة يفشل تحت overlap حقيقي | أكثر من claim لنفس voucher/order |

## اختبارات قبل تقديم اللابات للطلاب

```bash
docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests
docker compose --profile test rm -sf tests test-postgres
```

**لا تقبل أي tests فاشلة أو skipped في اختبارات الـNative backend.** بعد الاختبارات راجع Browser على Desktop وMobile وجرّب الـQuote، تسجيل الدخول، الـCheckout، الـRefund، ولوحة المدرب، والـReset. اختبارات Race بالذات لا تعتمد على PGlite؛ يجب قياسها على PostgreSQL الأصلي.

لمدرب الكامب: يوجد دليل هندسي في `docs/M2_INSTRUCTOR_SCENARIOS_AR.md`، يحتوي خطوات اختبار كل ثغرة والـNegative Controls. لا تسلم الدليل نفسه للطلبة.

---

# RVU Commerce — ابدأ من هنا

دي أول نسخة وظيفية من المشروع، وفيها **Secure baseline فقط**. الثغرات والـ18 لاب لم تُضف بعد.

## التشغيل على جهازك

1. افتح Docker Desktop وتأكد أن WSL Integration مفعّل لـUbuntu.
2. فك المشروع داخل WSL، مثل `~/rvu-commerce`، وافتح Terminal في مجلده.
3. شغّل:

```bash
sh scripts/start.sh
```

أول تشغيل سيحمّل الصور والمكتبات، ثم يطبع بيانات المدرب. لا تحتاج تثبيت Node أو PostgreSQL على الجهاز؛ التشغيل داخل Docker.

- المتجر: **http://localhost:8080**
- المدرب: **http://127.0.0.1:8081**

استخدم نفس العناوين بالحروف؛ الفصل بين `localhost` و`127.0.0.1` مقصود لعزل Cookies المدرب عن المتجر.

حساب العميل التجريبي:

```text
Email: alex@learner.rvu.test
Password: Studio-Local-2026!
```

رصيده الافتراضي: **15,000 جنيه وهمي**. حساب المدرب اسمه `instructor` وكلمة مروره تُولَّد وقت التشغيل وتُحفظ في `.env`.

## جرّب الرحلة دي

1. سجّل بحساب العميل، وأضف Form 75 Keyboard للسلة.
2. استخدم `WELCOME10`؛ السعر يصبح **1,980 جنيه**.
3. أكمل Checkout بعنوان وهمي؛ الرصيد يصبح **13,020 جنيه**.
4. افتح الطلب، واعمل Refund؛ الرصيد يرجع **15,000 جنيه**.
5. اشترِ Gift Card بقيمة 500؛ افتح الطلب لنسخ الكود.
6. أنشئ حسابًا آخر ببريد `@learner.rvu.test`، ووثّقه من Inbox داخل الحساب.
7. استرد الكود من Wallet؛ المحاولة الثانية يجب أن تُرفض.
8. من لوحة المدرب، اكتب `RESET` لبدء Run جديد. جلسات وطلبات الـRun القديم تصبح غير متاحة للطلاب.

## ما الذي اختُبر؟

اختُبرت الـAPIs والمحاسبة وعزل الحسابات والـReset، واختُبرت تفاعلات React متصلة بالـBackend وقاعدة PostgreSQL/WASM. سجل الاختبارات موجود في `docs/verification/test-output.txt`.

**اختبارات الـConcurrency اجتازت PostgreSQL 17 الحقيقي في CI**، بما فيها R01. اختبار Windows/WSL2 على جهازك والشكل في متصفح حقيقي لسه غير مؤكدين. لتكرار الاختبارات على Docker عندك:

```bash
docker compose --profile test up --build --force-recreate --abort-on-container-exit --exit-code-from tests tests
docker compose --profile test rm -sf tests test-postgres
```

هذه الاختبارات تستخدم قاعدة منفصلة مؤقتة. عند التشغيل داخل Docker يجب أن تعمل اختبارات الـNative PostgreSQL بدل ظهورها `skipped`.

للاستكمال، ابدأ بملف **IMPLEMENTATION_PROGRESS.md**؛ يحتوي القرارات والناقص والخطوة التالية بالترتيب.

## الـ13 لاب الإضافيين

B01, B02, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12, R01, R02, R03, R04, R05, R06

كل Profile مستقل في لوحة المدرب. افتح `/services` من المتجر بعد تسجيل الدخول، أو استخدم Burp لطلبات `/api/lab/action` و`/api/lab/race/*`. الأدلة المحفوظة في قاعدة البيانات يراها المدرب فقط. راجع الدليل الجديد `docs/EXTENDED_LABS_INSTRUCTOR_AR.md` قبل عرض سيناريوهات Email/Crypto/Concurrency.
