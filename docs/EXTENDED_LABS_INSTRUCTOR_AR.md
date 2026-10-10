# RVU Commerce — دليل المدرب للـ13 لاب الإضافية

> Internal instructor reference — intentionally vulnerable, fictional, **local-loopback-only** test application. لا تنشر نسخة اللابات على سيرفر عام. جميع المبالغ افتراضية، ولا تستخدم بيانات مستخدمين حقيقية.

## التشغيل والمراجعة

- المتجر: `http://localhost:8080` — صفحة الخدمات: `http://localhost:8080/services`.
- لوحة التحكم المنفصلة: `http://127.0.0.1:8081`. اختر Profile واحدًا ثم `RESET`، لا تجمع عيوب عدة Profiles في نفس الـRun.
- بعد كل Reset، ادخل بحساب Alex: `alex@learner.rvu.test` وكلمة المرور `Studio-Local-2026!`.
- الـBackend API: `POST /api/lab/action` مع `action` المناسب. الـRace endpoints تحت `/api/lab/race/*`.
- يمكن تنفيذ الخطوات بالـServices UI أو Burp، مع Cookies وOrigin وCSRF صالحين.
- المدرب يرى `/api/instructor/evidence`، والقيم محكومة بالـRun النشط. `/api/lab/status` لا يكشف Profile أو Tokens أو Evidence للطالب.
- اختبارات كل لاب في `tests/extended-labs.test.ts`. الـRace وDatabase-role checks لا تُعتمد من PGlite؛ شغّل native PostgreSQL.

## V1 Advanced

**B02 — Negative cart quantity:** `cart.reconcile` يقبل `lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:-1}]` في B02. الـDelivered value = 680000 قرش، والمدفوع = 540000، ويُثبت في `store.lab_sales` مع Ledger transfer. Secure baseline يرفض السالب.

**R03 — Moving-cart checkout:** ضع Arc Task Light في السلة. أرسل `POST /api/lab/race/checkout` مع `{"delayMs":220}`، وأضف `vista-27` قبل انتهاء الطلب. يحاسب على Snapshot قديم، ويسجل المنتجات الحالية بقيمة أكبر. في Baseline يتم التحقق من `cart.version` قبل خصم الرصيد.

**R04 — Concurrent email-change delivery:** أرسل طلب تغيير إلى البريد المملوك `alex@learner.rvu.test` بمهلة أطول، وخلالها طلبًا إلى `buyer@corp.rvu.test` بمهلة أقصر. Worker الأول يحتفظ بالمستلم القديم لكنه يقرأ Pending code الحالي، فتصل رسالة لصندوق Alex تثبت البريد الجديد. أكمل `email.confirm` ثم `corporate.orders`. كل البريد fictional ومسارات التوصيل مملوكة للـRun.

## V2 Advanced

**B03 — Verified identity reuse:** `email.update` يتعامل مع تغيير البريد مع إبقاء Verified قديم؛ `corporate.orders` يمنح وصولًا إذا انتهت الهوية الجديدة بـ`@corp.rvu.test`. في Baseline يتطلب التغيير إعادة تحقق.

**B05 — Signed 32-bit bulk invoice:** `bulk.invoice` مع `quantity:85900` وسعر وحدة 50000 قرش. الحساب الصحيح = 4,295,000,000 قرش، بينما `Math.imul` في Legacy adapter ينتج 32704. Ledger يُخصم منه السعر الملفوف، و`lab_sales` يخزن القيمتين. هذا **adapter صريح**، وليس overflow افتراضيًا في JS BigInt أو PostgreSQL.

**B06 — Legacy storage truncation:** `legacy.register` يستقبل عنوانًا طويلًا في adapter قديم. الجزء المحفوظ 255 حرفًا ينتهي بـ`@corp.rvu.test` بينما التوصيل التدريبي موجه لصندوق Alex. بعد `legacy.verify` تصبح بيانات Corporate متاحة. **تنبيه دقة:** هذا محاكي توافق Legacy routing يوضح mismatch التخزين/التوصيل، وليس ادعاءً بأن SMTP القياسي يقبل طول العنوان أو تركيبته.

**B07 — Shared password maintenance:** `password.maintain` يطلب `targetEmail`, `newPassword` و`currentPassword`. في B07 حذف `currentPassword` يفعل خطأً فرع Support على `target@learner.rvu.test`. يتم تغيير Hash **الحساب الحقيقي الوهمي** ويمكن تسجيل الدخول بكلمة المرور الجديدة. Baseline يتطلب كلمة المرور الحالية وتطابق هدف التغيير مع actor.

**B09 — Incomplete workspace context:** `workspace.admin` يكتب اعتماد عملية Corporate في State دائم قبل اختيار `workspace.select`. بمجرد اختيار Buyer Context، يمنع الفرع نفسه. Baseline لا يفترض Admin عند Session ناقصة.

**R02 — Login attempt quota:** `POST /api/lab/race/login` بخمس طلبات متوازية `{"password":"Target-Only-2026!","delayMs":120}`. Bypass يحدث لأن التحقق من العدد يسبق التسجيل؛ `lab_attempts` يحفظ كل عملية Password Verification. `auth.target` يتحقق من اعتماد Target الفعلي داخل الـLab. هذا تحدي Native concurrency؛ لا يُستنتج من تزامن PGlite.

## Specialist / Expert

**B11 — Encryption purpose confusion:** `notification.encrypt` يستخدم AES-128-ECB (تدريبي فقط)، و`remember.login` يقبل Clipboard blocks كهوية. يمكن اختيار Notification body يبدأ بعد محاذاة كتل ثم استخراج كتل Ciphertext لتشكيل `kind=remember&user=store-admin`. لا يستخدم مسار Production أي AES-ECB لهذا الغرض.

**B12 — Encoded corporate email parser:** `parser.register` يفحص النص الخام وينتهي الدومين corporate، بينما adapter يفك RFC-2047 Encoded-word Base64 ويستخرج عنوانًا يُسلّم لصندوق الطالب. بعد `parser.verify` و`corporate.orders` يظهر الأثر. **محاكاة Parser A/Parser B بمسارين واضحين**، وليس إثبات اختلاف Nodemailer أو Mailpit القياسي أو تسليم SMTP حقيقي لعنوان RFC غير قياسي.

**R05 — Time-derived password recovery:** `reset.request` لحساب Alex والهدف قرب نفس الثانية يولّد Hash زمن متكرر، مع فصل صندوق الهدف. `reset.complete` يقبل الرمز الذي وصل لصندوق Alex لإعادة كلمة مرور الهدف ثم يمكن الدخول إليه. ليست Race Condition تقليدية؛ إنها Timestamp Token Collision. Baseline يولّد رموز CSPRNG مستقلة.

**R06 — Partial account provisioning:** `/api/lab/race/registration` ينشر تسجيلًا Token=null ثم يكمّل تهيئته لاحقًا في Transaction مختلفة. أثناء النافذة، `registration.confirm` يقبل `code:[""]` بسبب Null/type coercion في adapter. يتم حفظ Verified قبل اكتمال التهيئة، وبعد الاكتمال ينجح `corporate.orders`. تحتاج تجربتين متزامنتين و`registrationId` UUID معلومًا للطرفين؛ التأكيد بعد اكتمال الصف لا يمثل الحل.

## تقييم التدريب

1. سلّم الطلاب متطلبات الـBusiness Policy، مش Payload الحل.
2. اجعل الطالب يشرح الـInvariant والـTrust Boundary والـImpact بالأدلة (Order / Ledger / User / Verified / Evidence).
3. لكل لاب اختبر Secure baseline أولًا، ثم Profile الضعيف، ثم Reset، وتأكد إن الـEvidence القديمة لا تنتقل للـRun الجديد.
4. ملفات `tests/extended-labs.test.ts` هي Regression Gate للآليات، وليست شهادة إن كل خطوات النسخة الأصلية من PortSwigger مستنسخة حرفيًا.
5. **قبل السيشن:** شغّل GitHub Actions كاملًا وDocker على WSL وراجع الواجهة في Chrome/Edge، مع التأكد من عدم فتح 8080/8081 على أي Public IP.

## حدود الاختبارات

المنظومة تتحقق من أصناف ثغرات متنوعة ببيانات افتراضية. الـMail/Parser adapters الخاصة بـB06 وB12 مبسطة عن SMTP الحقيقي؛ B11 يستخدم CBC-free ECB تدريبيًا لإظهار خطر purpose reuse، وR05 يتطلب نفس tick زمني. هؤلاء لابات **مكافئة في المفهوم**، وليست نسخ PortSwigger حرفية. تجارب المستخدم البصرية الكاملة والأداء على كل جهاز طالب غير مثبتة باختبارات CI.
