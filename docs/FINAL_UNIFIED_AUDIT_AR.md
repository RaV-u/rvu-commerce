# RVU Commerce — مراجعة قبول المتجر الموحد

**التاريخ:** 10 أكتوبر 2026  
**النطاق:** نسخة Docker المحلية المتصلة بـPostgreSQL، وليست أي موقع منشور للإنترنت.

## الهدف المعتمد

الطالب يتعامل مع متجر واحد يبدو طبيعيًا، يبحث في المنتجات والحسابات والشركات والشراء، ويكتشف قصور Business Logic وRace Conditions بنفسه. لا توجد لوحة مدرب منشورة أو اختيار لاب في واجهة الطالب. أسماء B/R معرفات تطوير داخلية فقط.

## نتيجة التحقق

- **18/18 عائلة ثغرات** لها مسار تنفيذ واختبار رجعي منفصل في الكود.
- **40/40** اختبار Backend على PostgreSQL أصلي، و**4/4** اختبار React في آخر تشغيل تمت مراجعته.
- Smoke تشغيل Docker موحد يثبت **10** سيناريوهات معًا: B01 وB02 وB03 وB05 وB06 وB09 وB11 وR02 وR03 وR06.
- **الثمانية غير المبرهن عليها في نفس Smoke الموحد:** B04 وB07 وB08 وB10 وB12 وR01 وR04 وR05. لديها اختبارات متخصصة، لكن النجاح المنفصل لا يُثبت انعدام كل التداخلات.
- Smoke إضافي: **3 عملاء مستقلين، 93 طلب HTTP، شراء وRefund ناجح لكل حساب**. P95 لطلبات ذلك التشغيل 238ms على GitHub runner، وليس على جهاز WSL الخاص بالمدرب.
- اختبارات Chrome للتخطيط ومنع Overflow عند 360 و420 بكسل ناجحة. لا يُعتبر ذلك بديلًا عن تجربة بشرية كاملة لكل واجهات الموقع.

## تقييم العائلات

| المجموعة | المعرفات | ما يتعلمه الطالب |
|---|---|---|
| تسعير وسلة | B01, B02, B05 | عدم الثقة بالسعر والكمية والحسابات العددية القادمة من العميل |
| هوية وحسابات | B03, B06, B07, B12 | حدود الثقة في البريد، التحقق، تعديل الحساب، اختلاف الـParser |
| خصومات وCheckout | B04, B08, B10 | تطبيق قواعد العروض والتحقق من انتقالات الدفع والقيمة المخزنة |
| حالة وصلاحيات | B09, B11 | حالة الـRole غير المكتملة، وإعادة استخدام التشفير لأغراض مختلفة |
| تزامن وتوقيت | R01–R06 | حد الإنفاق الواحد، حد محاولات الدخول، السلة المتغيرة، تغيير البريد، رموز الوقت، وPartial Construction |

## فجوات يجب عدم إخفائها

1. **التشابه مع PortSwigger في الفكرة، لا التطابق في كل خطوات الحل.** B06 وB12 يشرحان اختلاف تحليل البريد عبر adapters بدلاً من SMTP حقيقي. B11 يشرح Encryption Oracle في خدمة محلية، لكن «admin» الناتج ليس جلسة إدارة موقع كاملة. R02 يستخدم حسابًا وهميًا معلومًا بدل رحلة تخمين كلمات المرور كاملة.
2. **أثر بعض الثغرات مبسّط:** الوصول إلى بيانات الشركات في عدد من العمليات يرجع سجلًا تجريبيًا، وبعض صلاحيات الشركة تظهر كنتيجة API أو حالة داخلية، لا لوحة إدارة أعمال كاملة. هذا يقلل واقعية Bug Bounty مقارنة بموقع كبير.
3. **تجارب متعددة على نفس البيئة:** المستخدم `target@learner.rvu.test` وحد محاولاته مشتركان على مستوى الـRun. B07 وR05 قد يغيران كلمة مرور ذلك الحساب، وR02 يستهلك عداد محاولاته. لا تفترض أن الحسابات الجديدة تعزل هذه التغييرات. وفّر نسخة مستقلة لكل طالب أو Reset للـRun عند الحاجة.
4. **R06 يحتاج Discoverability أفضل:** اختبار Partial Construction يعتمد على `registrationId` معلوم قبل اكتمال التسجيل. واجهة التسجيل العادية لا تضع هذا الحقل أمام الطالب بوضوح، لذا لا تساوِ صعوبته بصعوبة اكتشاف الثغرة نفسها.
5. **الأداء:** لا يمكن ضمان «صفر Lag» من CI. يجب قياس CPU/RAM وزمن الطلبات على Windows/WSL الفعلي أثناء Race وعمليات الشراء المتزامنة.
6. **المستودع العام:** المستودع يحتوي الاختبارات والشروح الداخلية، وبالتالي يمكن لأي طالب رؤية حلول عديدة إذا حصل على الرابط. يفضّل جعله Private وتوزيع نسخة تشغيل فقط.
7. لا تفتح Docker على الإنترنت: هذا برنامج مقصود الضعف للتدريب المحلي.

## معايير القبول العملية قبل جلسة الكامب

- شراء عادي وRefund على حسابين مستقلين دون تداخل الأرصدة.
- تجربة إصلاح بريد جديد، والتحقق من Inbox، وجلسات الدخول والخروج.
- التأكد من Footer: «RVU Mentorship Camp» يسارًا، و«By: Ramez Medhat» وسطًا، و«rv-u.tech» يمينًا.
- عدم فتح أي Instructor UI على 8081، وعدم إظهار أسماء العيوب/الـProfile في واجهة الطالب.
- تجربة الثمانية غير المغطاة بنفس Smoke الموحّد جنبًا إلى جنب على نسخة Docker محلية.
- بعد Race Condition، اختبار شراء عادي آخر والتأكد من سلامة الـWallet والـLedger.
- تشغيل الاختبارات الأصلية ثم فحص لابتوب المدرب بـ`docker stats --no-stream`.
- إبقاء الـPort `8080` مربوطًا بـ`127.0.0.1` فقط.

## الحكم

**صالح كبداية قوية لتدريب عملي محلي على التفكير في Business Logic وRace Conditions، مع 18 مفهومًا متاحًا في متجر موحد.** لكنه **ليس بعدُ مطابقًا تمامًا لكل PortSwigger Lab ولا مثبتًا بأنه بلا تداخلات على كل الأزواج أو بلا Lag على كل أجهزة الطلاب**. قبل تسليمه كهدف Bug Bounty واقعي مكتمل، الأولوية لتحسين الأثر الدائم لثغرات الصلاحيات، Discoverability، والعزل عند مشاركة بيئة واحدة.

## Update: Single learner login and company-team isolation (10 October 2026)

- Published login only: `rvu` / `rvucamp` on loopback. Each sign-in creates an individual practice wallet, inbox and fictional colleague.
- The live account-services form prepopulates the student's actual mailbox and shows their colleague in the directory; this prevents a legitimate self-service flow from accidentally targeting the obsolete common Alex account.
- R02's quota and verified target are scoped to that colleague for the unified storefront, while older per-profile regression tests retain their historical seeded target.
- A company-registration reference is generated before submission, allowing the normal registration-confirmation flow to be tested during the provisioning window.
- Tests must establish these properties in both PGlite and native PostgreSQL, plus the Docker/browser workflow, before instructor use.
