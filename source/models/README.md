# MediaPipe Pose Landmarker Lite

ملف `pose_landmarker_lite.task` هو نموذج Google الرسمي بنسخة Lite float16 v1، ويشغله التطبيق داخل المتصفح من خلال `@mediapipe/tasks-vision` بالإصدار المثبت 1.1.1. لا تُرسل الفيديوهات إلى Google أو إلى مزود تحليل آخر؛ يقرأ النموذج إطارات الفيديو في المتصفح، ويُحفظ التتبع في قاعدة بيانات المشروع الخاصة.

مصدر الأوزان: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

دليل التنفيذ الرسمي: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

مواصفات النموذج ومواقع النقاط الـ33: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

تستخرج الزوايا من إحداثيات الصورة بعد تصحيح نسب أبعاد الفيديو. تستبعد النقاط المحجوبة وخارج الإطار والمنخفضة الثقة. هذه زوايا تقديرية ثنائية الأبعاد، ولا تعادل قياسات تشريحية ثلاثية الأبعاد أو تشخيصًا طبيًا؛ سرعة الكرة والمسافات الفعلية والتقييم الرياضي العام غير محسوبة. تعرض الواجهة القياسات غير المتاحة بدل اختلاقها.

مقطع التحقق الداخلي المستخدم: فيديو قرفصاء خام للمصور Tima Miroshnichenko من Pexels: https://www.pexels.com/video/side-view-of-a-man-doing-barbell-squats-5319759/ . يجيز ترخيص https://www.pexels.com/license/ الاستخدام والتعديل، ولا يدل الفيديو على تأييد الشخص أو المصور للمشروع. اقتُطعت ست ثوانٍ من المصدر وأُعيد ترميزها إلى MP4/H.264 بحجم مناسب لاختبار الرفع والاستدلال؛ لا توجد عليه نتائج أو وصلات جسم مسبقة. بعض الجسم خارج إطار هذا المقطع، وهو مناسب للتحقق أيضًا من عدم اختلاق زوايا الأجزاء المحجوبة. ليس فيديو أداء خاصًا بالمستخدم، ولا تُنسخ نتائج مقطع آخر إلى المنصة. يحتفظ ملف التحقق خارج المستودع ولا يرفع إلى CDN عام.
