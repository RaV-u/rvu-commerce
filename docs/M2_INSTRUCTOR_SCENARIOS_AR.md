# RVU Commerce M2 — Instructor-only test cases

> **تنبيه: مرجع قديم فقط.** النص أدناه يخص نسخة M2 المبنية على Instructor Profiles. نسخة المتجر الحالية لا تنشر Instructor Console على 8081، وتشغّل الـ18 مفهومًا معًا. بعض السيناريوهات أصبحت ضمن سلة المتجر الطبيعية بدل الـEndpoints الموضحة هنا. استخدم [FINAL_UNIFIED_AUDIT_AR.md](FINAL_UNIFIED_AUDIT_AR.md) و[README](../README.md) للمراجعة الحالية؛ لا تعتبر أرقام اللابات الناقصة أو خطوات الـReset القديمة وصفًا لحالة المشروع.


> لا ترسل الملف للطلاب: يحتوي Expected behaviors وطرق التحقق. الاختبارات مكتوبة في `tests/commerce.test.ts`، ونجحت الـ21 Backend tests (ومنها سيناريوهات M2) على PostgreSQL حقيقي في GitHub Actions بتاريخ 10 أكتوبر 2026. ما زال لازم تتأكد من التشغيل على Docker/WSL قبل السيشن.

## قاعدة البداية

- كل Profile = Run جديد في Console (`127.0.0.1:8081`)، و`RESET` يبطل sessions القديمة.
- واجهة Target نفسها لا تحتوي Labs أو Flags؛ الطالب يرى متجرًا طبيعيًا.
- افتح الحساب التجريبي `alex@learner.rvu.test` (EGP 15,000 virtual). سجّل الفرق في الرصيد والطلب النهائي؛ تعديل السلة وحده ليس إثبات أثر.
- استعرض `Instructor evidence` بعد إتمام الطلب؛ الـCounter يعتمد على DB وليس Snackbar.
- اختبر الـSecure Baseline قبل كل سيناريو كـNegative Control.

## B01 — Excessive Trust in Client-side Controls

1. من المتجر اختر `Build your own workstation` مع Pro dock + Studio care: السيرفر يحسب EGP 18,300.
2. مع الـSecure Baseline، `POST /api/quotes/:id/accept` بقيمة `quotedTotal:90000` (cents) يجب أن يرجع `409`. السعر المعتمد `1830000` (cents).
3. حوّل الـProfile إلى B01 ثم ابدأ quote جديدًا، وغيّر `quotedTotal` إلى `90000` (EGP 900).
4. راجع bag ثم checkout. إثبات: order item `quote_id` مرتبط بquote authorized EGP18,300 لكن unit price EGP900 وledger دفع EGP900.
5. Counter B01 = 1. لا يكفي تعديل طلب `cart/items` وإرسال `price` إضافي؛ هذا المسار محمي.

## B04 — Flawed Enforcement of Business Rules

1. B04 / Add Vista 27 (EGP 6,800).
2. Apply WELCOME10 => EGP680 saving؛ إعادة WELCOME10 مباشرة 409.
3. Apply STUDIO15 => EGP1,020 إضافية؛ Apply WELCOME10 مجددًا => EGP680 ثالثة.
4. يجب أن يظهر Total EGP 4,420 بدل الخصم المسموح. ادفع؛ Counter B04 يقيس duplicate code على order واحد.
5. Negative Control: الـSecure Baseline لا يسمح بالتراكم أصلًا.

## B08 — Insufficient Workflow Validation

1. B08 / اشترِ Arc Task Light (EGP1,400) بدفع صحيح عبر `/api/checkout` أو رحلة الـUI.
2. ضع 3× Vista 27 (EGP20,400)، أنشئ review intent من `/api/checkout/prepare`؛ لا تدفع الطلب الثاني.
3. `POST /api/checkout/confirm` بالـintentId الجديد وبـ`Idempotency-Key` UUID.
4. الـConfirmation الخاطئ يعيد استخدام وجود settled payment قديم، فينشئ order مؤكدًا دون payment للطلب الجديد ودون خصم 20,400 من wallet.
5. Counter B08 = 1، والـRefund لا يسمح بصرف رصيد لطلب غير مدفوع. Secure Baseline يرفض الدفع فوق الرصيد ولا يؤكد الطلب.

## B10 — Infinite Money Logic Flaw

1. B10 / Add Gift Card EGP500، apply GIFT20.
2. EGP400 payment ينتج gift card face value EGP500؛ Redeem منه 500 => +EGP100 net wallet.
3. كرر الشراء بكود هدية جديد، وأثبت wallet انتقل من EGP15,000 إلى EGP15,200.
4. Redeem ثاني لنفس code يجب أن يفشل؛ التجربة هنا ليست double redemption بل Feature composition.
5. Counter B10 = 1. Secure Baseline يعيد `404` على GIFT20 ويستبعد Gift Card من WELCOME10.

## R01 — Limit Overrun Race Conditions

1. R01 / Add Vista 27 EGP6,800 / Use store voucher STUDIO300. `POST /api/cart/voucher`.
2. نفس الطلب مرتين Sequential => الأولى 200 والثانية 409.
3. RESET/نفس Profile / Add Vista. في Burp Repeater group أرسل 4 POST متزامنة مع نفس Cookie وCSRF وvoucher. لا تغيّر اسم الكود أو الحساب. أداة API تفصل check عن commit في R01 بنافذة 80 ms لعرض الـTiming race.
4. عند نجاح أكثر من Claim، راجع Total: خصم >=EGP600 لنفس voucher، ثم ادفع. Evidence R01 = 1 بعد purchase.
5. Secure Baseline claim/commit ذرية؛ الطلبات المتزامنة لا تحقق أكثر من claim واحد.
6. Native PostgreSQL test مطلوب؛ PGlite لا يثبت وجود جلسات DB متزامنة مستقلة.

## 13 سيناريو لم تُبنَ بعد

B02 وB03 وB05 وB06 وB07 وB09 وB11 وB12 وR02 وR03 وR04 وR05 وR06. تصميمها التفصيلي موجود في `RVU_Commerce_Research_and_Architecture.md` وليس في Runtime أو Instructor profile select. لا تعلنها للطلاب كأنها متاحة.
