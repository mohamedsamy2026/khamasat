# ATHLETE AI — تقرير تنفيذ الرياضات والبيانات الحساسة

**الفرع:** `arena/e5c7087f-khamasat` (مبني على `main` عند `eba9143`) · **التاريخ:** 2026-10-27
**نطاق العمل:** تنفيذ المتطلبات الوظيفية داخل المستودع القائم `source/` (React 19 + Vite + Express + Drizzle/MySQL).

---

## 1) ملخص ما نُفّذ

| المتطلب                   | الحالة                 | ما نُفّذ فعليًا                                                                                                                                                                                             |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. المؤسسات والرياضات     | منفّذ                  | عمود `organizations.sports` (json) يحدد رياضات كل مؤسسة، وتحقق خادمي يمنع إسناد رياضة غير مفعّلة، وربط كل لاعب برياضة وفئة، وفلترة حسب الرياضة في القوائم، وتبديل الرياضة من الإعدادات وواجهة إنشاء المساحة |
| B. إعداد لكل رياضة        | منفّذ                  | `shared/sports/{types,football,gymnastics,index}.ts` كمصدر وحيد للمصطلحات والمجموعات والمهارات والأجهزة والفئات والمؤشرات؛ لا ثوابت خاصة برياضة داخل مكوّنات مشتركة                                         |
| C. قسم الجمباز            | منفّذ                  | صفحة `/gymnastics` + `GET /gymnastics/context`، ترتيب أجهزة الفئة، منع أجهزة الفئة الأخرى خادميًا، تقييم لكل جهاز                                                                                           |
| D. الملف الصحي            | منفّذ                  | جدول `player_health_profiles` + تحقق + `GET/PUT /players/:id/health` + تبويب «الصحة والطوارئ» + صلاحية `health` مستقلة                                                                                      |
| E. جهة الاتصال في الطوارئ | منفّذ                  | جدول `player_emergency_contacts` + تحقق + `GET/PUT /players/:id/emergency-contact` + صلاحية `emergency` مستقلة                                                                                              |
| F. تقييم بدني موحّد       | منفّذ                  | 20 مؤشرًا لكل رياضة برمز ثابت، جدول `player_physical_assessments`، إدخال من قائمة مغلقة بدل النص الحر، إبقاء السجلات القديمة مقروءة                                                                         |
| G. قابلية القراءة         | منفّذ                  | تمرير CSS على `.session-note-*` و`.exercise-plan-*` (أحجام، تباعد، تسلسل، جوال/سطح مكتب) دون تغيير الهوية البصرية                                                                                           |
| H. نسبة ملاحظات المدرب    | منفّذ                  | حقول المنقّح + سجل مراجعات موقّع + تدقيق، مع الحفاظ على الكاتب الأصلي والنص الأصلي، ومنع تعديل الرصد الآلي المشترك                                                                                          |
| I. منع الارتداد           | منفّذ + مغطى باختبارات | خطط التمارين لا تُربط إلا بجانب تطوير موثق؛ المؤشرات ذات `rule: null` تبقى `measurement_only` ولا تتحول إلى قوة/تطوير                                                                                       |

لم تُعدّل أي ملفات محمية، ولم تُنفّذ هجرات على قاعدة إنتاج، ولم يُحذف أي سجل.

---

## 2) الملفات المضافة/المعدّلة حسب الميزة

### الرياضات والإعدادات

- **جديد:** `shared/sports/types.ts`، `shared/sports/football.ts`، `shared/sports/gymnastics.ts`، `shared/sports/index.ts`، `shared/sports.test.ts`
- **معدّل:** `shared/athlete.ts` (`sport`, `gymnasticsCategory`, `sports` في العضوية)، `shared/evaluation-types.ts` (حقول المنقّح في المراجعة)، `server/athlete/validation.ts` (مخططات الرياضة)، `server/athlete/sport-rules.ts` (**جديد**)، `server/athlete/actor.ts`، `server/athlete/serializers.ts`، `server/athlete/seed.ts`

### الجمباز والتقييم البدني

- **جديد:** `client/src/pages/Gymnastics.tsx`، `client/src/components/athlete/PhysicalAssessments.tsx`، `client/src/components/athlete/sport-forms.css`، `server/athlete/gymnastics-request-boundary.test.ts`
- **معدّل:** `server/athlete/index.ts` (مسارات `GET /sports`, `GET /gymnastics/context`, `GET|POST|DELETE /physical-assessments`)، `client/src/pages/PlayerProfile.tsx`، `client/src/pages/Academies.tsx`، `client/src/pages/Clubs.tsx`، `client/src/pages/SupportPages.tsx`، `client/src/App.tsx`، `client/src/components/athlete/Layout.tsx`

### البيانات الحساسة

- **جديد:** `shared/health.ts`، `shared/physical-assessment.ts`، `server/athlete/sensitive.ts`، `client/src/components/athlete/HealthPanel.tsx`، `server/athlete/health-request-boundary.test.ts`، `server/athlete/sport-request-boundary.test.ts`
- **معدّل:** `server/athlete/index.ts` (مسارات الصحة/الطوارئ/الصلاحيات)، `drizzle/schema.ts` (جداول جديدة)

### الملاحظات وقابلية القراءة

- **معدّل:** `server/athlete/index.ts` (`PATCH /notes/:id`)، `client/src/components/athlete/SessionNotes.tsx`، `client/src/components/athlete/session-evaluation.css`، `server/athlete/notes-request-boundary.test.ts`

### قاعدة البيانات والتوثيق

- **جديد:** `drizzle/0005_calm_hardball.sql`، `drizzle/meta/0005_snapshot.json`، `server/athlete/migration-safety.test.ts`، `server/athlete/plans-request-boundary.test.ts`، `docs/sports-scientific-validation.md`، `docs/sensitive-athlete-data.md`، `docs/athlete-ai-implementation-report.md`، `TODO.md` (قسم أدلة)
- **معدّل:** `drizzle/meta/_journal.json`

---

## 3) الهجرات والإعدادات المطلوبة

### الهجرة `drizzle/0005_calm_hardball.sql` (إضافية فقط)

| العملية                                                                                                                      | الأثر على البيانات                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `CREATE TABLE player_health_profiles`, `player_emergency_contacts`, `player_sensitive_grants`, `player_physical_assessments` | جداول جديدة فقط                                              |
| `ALTER TABLE notes ADD lastEditedByName varchar(160) NOT NULL DEFAULT ''`, `ADD lastEditedByUserId int`                      | أعمدة جديدة بقيم افتراضية، لا تغيير على `authorName` أو النص |
| `ALTER TABLE organizations ADD sports json` (nullable) → `UPDATE ... JSON_ARRAY('football')` → `MODIFY ... NOT NULL`         | تعبئة كل المؤسسات القائمة بكرة القدم قبل فرض القيد           |
| `ALTER TABLE players ADD sport varchar(40) DEFAULT 'football' NOT NULL`                                                      | كل لاعب قائم يبقى كرة قدم                                    |
| `ALTER TABLE players ADD gymnasticsCategory varchar(40) DEFAULT '' NOT NULL`                                                 | فارغ للجميع                                                  |
| فهارس وقيود خارجية على الجداول الجديدة                                                                                       | لا تمس الجداول القديمة                                       |

- لا `DROP TABLE`، لا `DROP COLUMN`، لا `TRUNCATE`، لا `DELETE FROM`، لا `RENAME`.
- التراجع: الجداول الجديدة تُسقط بعد نسخة احتياطية؛ الأعمدة الجديدة يمكن إسقاطها (`ALTER TABLE ... DROP COLUMN`) دون فقد أي حقل قائم.
- تحقق محلي: كل عبارات الملف نُظّمت ووردت سليمة في فحص MySQL parser (25/25 عبارة)، لكن **لم تُطبَّق على قاعدة MySQL فعلية هنا** (لا خدمة قاعدة بيانات ولا Docker في بيئة التنفيذ).

### متغيرات البيئة

لا متغيرات جديدة. يلزم فقط ما هو موجود في `.env.example`: `DATABASE_URL`، `PORT`، `MANUS_JWT_SECRET`، وقيم تكامل Manus (يجب أن تأتي من البيئة المعتمدة). لم تُضف أي قيمة سرية إلى الشيفرة أو السجلات أو التقرير.

---

## 4) الاختبارات والفحوص التي نُفّذت فعليًا

| الفحص                  | الأمر                                                | النتيجة                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript             | `pnpm check`                                         | **نجاح، 0 أخطاء**                                                                                                                                                      |
| Vitest                 | `pnpm test`                                          | **130 اختبارًا في 26 ملفًا — كلها ناجحة**                                                                                                                              |
| Build                  | `pnpm build`                                         | **نجاح** (Vite: 2371 وحدة، ثم esbuild للخادم)                                                                                                                          |
| Syntax check للهجرة    | `sqlglot` (MySQL dialect)                            | 25/25 عبارة صُرّفت                                                                                                                                                     |
| معاينة التطوير         | `GET` لكل صفحات/مكوّنات الواجهة على `127.0.0.1:3000` | 200 لكل من Home/Academies/Analysis/PlayerProfile/Clubs/Reports/Requests/SupportPages/Gymnastics/HealthPanel/PhysicalAssessments/SessionNotes/ExercisePlans/PoseResults |
| تطبيق الهجرة على MySQL | —                                                    | **لم يُنفّذ** (خدمة غير متوفرة)                                                                                                                                        |

ملفات اختبار جديدة في هذا العمل:

- `shared/sports.test.ts` (9): تسجيل الرياضات، ترتيب أجهزة السيدات/الرجال حرفيًا، منع الجهاز خارج الفئة، 20+ مؤشرًا برموز فريدة و`provisional` فقط، تقييد مؤشرات الجمباز بالأجهزة، تطابق أسماء الأجهزة مع مهارات الجمباز، اتحاد المهارات للتوافق الخلفي.
- `server/athlete/sport-rules.test.ts` (7): تطبيع الرياضة/الفئة/المركز، منع تبديل الرياضة مع سجلات، منع المهارة/الجهاز غير المطابق.
- `server/athlete/sport-request-boundary.test.ts` (7): رفض رياضة غير مفعّلة للمؤسسة، إنشاء لاعب جمباز متسق، رفض مركز كرة قدم للجمباز والعكس، فلترة `/players?sport=`، منع تغيير الرياضة بعد تسجيل جلسة، رفض قائمة رياضات فارغة/غير معروفة في `PATCH /organizations/current`.
- `server/athlete/gymnastics-request-boundary.test.ts` (11): ترتيب أجهزة السيدات من API، مؤشرات مقيدة بالجهاز، منع جهاز من فئة أخرى، رفض تسجيل/قراءة/حذف التقييم عبر مؤسسات أخرى، حذف بسياق تدقيق.
- `server/athlete/health-request-boundary.test.ts` (8): نادي باعتماد ملف كامل يُرفض للصحة والطوارئ، منح نطاق لا يفتح الآخر، منع مالك أكاديمية أخرى وموظف الأكاديمية من الكتابة/المنح، منع منح نادٍ غير معتمد، الإلغاء المتسلسل، التدقيق بلا محتوى.
- `server/athlete/notes-request-boundary.test.ts` (+3 = 6): مدرب يعدّل ملاحظة مدرب آخر مع بقاء الكاتب الأصلي والنص الأصلي، تسجيل المنقّح والوقت في المراجعة والتدقيق، منع تعديل الرصد الآلي المشترك، منع أكاديمية أخرى.
- `server/athlete/plans-request-boundary.test.ts` (3): رفض خطة على مؤشر بلا قاعدة، بقاء المؤشرات `measurement_only` و`rule: null`، رفض تحليل لاعب آخر.
- `server/athlete/migration-safety.test.ts` (5): لا حذف/إسقاط، ترتيب التعبئة قبل فرض NOT NULL، القيود الفريدة للصلاحيات، عدم المساس بحقول كاتب الملاحظة.

لم تُعدّل الاختبارات القائمة إلا لإضافة حقول الرياضة إلى الحالات (`validation.test.ts`) ولإضافة `sports` إلى بيانات العزل (`route-test-support.ts`).

---

## 5) القيود المعروفة والأسئلة المفتوحة

1. **لا تحقق على قاعدة بيانات حقيقية في هذه البيئة:** لا MySQL/MariaDB ولا Docker. كل اختبارات المسارات تعمل على قاعدة وهمية داخلية. يلزم تطبيق `0005` محليًا على نسخة احتياطية قبل أي نشر.
2. **لا مراجعة علمية للمؤشرات:** كل المؤشرات `provisional_unvalidated` وقواعدها `null`. تفاصيل المصادر المطلوبة والأسئلة في `docs/sports-scientific-validation.md`. لم تُستورد مراجع خارجية لعدم توفر وصول شبكي.
3. **خطط التمارين:** لا يمكن إنشاء خطة إيجابية الآن لأن كل قواعد المؤشرات `null`، فلا يوجد «جانب تطوير موثق». هذا سلوك مقصود، ومغطى باختبار يثبت رفض الخطة بدل اختلاق تطوير.
4. **مهارات الفيديو في صفحة التحليل المحمية:** `Analysis.tsx` (محمي) يستخدم قائمة مهارات كرة القدم القديمة؛ لم أعدّله. ربط مهارات الفيديو برياضة اللاعب يحتاج تعديلًا في ذلك الملف، وهو خارج نطاق الحماية. الخادم يقبل أي مهارة مسجلة في اتحاد الرياضات للمحافظة على وظائف الصفحة الحالية.
5. **مقارنة أجهزة الجمباز داخل التحليل الحركي:** لم تُضف مقارنة بين أجهزة أو فئات مختلفة؛ التقييم البدني لكل جهاز مستقل.
6. **جلسة العرض:** لا توجد بيانات لاعب جمباز افتراضية (التزامًا بقاعدة «ميسي وحده»). لتجربة القسم: فعّل رياضة الجمباز ثم أضف لاعبًا وفئته.
7. **تناقض سابق غير مُصلح:** `Layout.tsx` يذكر خمسة لاعبين تجريبيين بينما `seed.ts` ينشئ لاعبًا واحدًا. لم أغيّر النص لأنه توثيق لحالة سابقة وليس خطأ ينشأ من هذا العمل (مذكور هنا للشفافية).
8. **قيود صحية على بيانات حقيقية:** لم تُخفَّض أي بيانات صحية؛ من يحمل صلاحية `health` يرى الملف كاملًا. إن احتجت حجب حقول بعينها (مثل الأدوية عن المدرب)، فهذا قرار سياسة جديد يحتاج تحديدًا منك.

---

## 6) تأكيد عدم تعديل الملفات المحمية

`git diff --name-only` لا يُظهر أيًا من:
`shared/pose.ts`, `shared/poseMath.ts`, `shared/poseTimeline.ts`, `shared/poseNormalization.ts`, `shared/poseEngine.ts`, `shared/evaluation.ts`, `client/src/pages/Analysis.tsx`, `client/src/components/athlete/PoseResults.tsx`.

لم يتغيّر أي منطق تحليل حركة أو تقييم أو حساب وضعية. التكامل تم عبر الواجهات القائمة فقط (`evaluateSession`، `comparison`، وقراءة `analysis.evaluation`).

---

## 7) الفرع والالتزام

الفرع: `arena/e5c7087f-khamasat`. الالتزامات في نهاية العمل موثقة في رسالة التسليم (hash الالتزام النهائي). لم يُكتب تاريخ مشترك ولم يُستخدم force-push، و`main` لم يُمس.

---

## 8) رابط العمل / التحقق

- المستودع: <https://github.com/mohamedsamy2026/khamasat> (الفرع أعلاه).
- التحقق الآلي في هذه البيئة موثق في القسم 4، مع أمر إعادة التشغيل نفسه.
- نسخة أرشيف محلية إن طُلبت: `git archive --format=zip --output=khamasat.zip <commit>` من المستودع.

---

## 9) خطوات التشغيل على Windows

> المتطلبات: Windows 10/11، Node.js 22 LTS (يتضمن npm)، pnpm 10، MySQL 8 محليًا.

### أ) تنزيل المشروع

```powershell
git clone https://github.com/mohamedsamy2026/khamasat.git
cd khamasat
git checkout arena/e5c7087f-khamasat
cd source
```

### ب) تثبيت الاعتماديات

```powershell
npm install -g pnpm@10.18.0
pnpm install --frozen-lockfile
```

### ج) متغيرات البيئة (بدون أسرار في المستودع)

```powershell
Copy-Item .env.example .env
notepad .env
```

املأ:

- `DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/athlete_ai_local"`
- `MANUS_JWT_SECRET` = قيمة جديدة تُولَّد محليًا:
  ```powershell
  node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
  ```
- قيم Manus (`MANUS_*`, `OWNER_OPEN_ID`) من بيئة المشروع المعتمدة إن احتجت تسجيل الدخول. العرض التجريبي المجهول يعمل بدونها.

### د) قاعدة بيانات محلية وهجرة آمنة

1. أنشئ قاعدة جديدة (مثال) عبر MySQL Workbench أو:
   ```powershell
   mysql -u root -p -e "CREATE DATABASE athlete_ai_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```
2. **خذ نسخة احتياطية قبل أي هجرة على قاعدة فيها بيانات:**
   ```powershell
   mysqldump -u root -p athlete_ai_local > backup-before-0005.sql
   ```
3. طبّق الهجرات:
   ```powershell
   pnpm db:migrate
   ```
   إذا فشلت خطوة، أوقف ولا تُعد المحاولة بالقوة؛ الهجرة إضافية ويمكن تفتيشها في `drizzle/0005_calm_hardball.sql`.
4. تحقق سريع:
   ```powershell
   mysql -u root -p athlete_ai_local -e "SHOW COLUMNS FROM players LIKE 'sport'; SHOW COLUMNS FROM organizations LIKE 'sports'; SELECT COUNT(*) FROM player_sensitive_grants;"
   ```

### هـ) الفحوص والتشغيل

```powershell
pnpm check
pnpm test
pnpm build
$env:NODE_ENV="development"; pnpm exec tsx watch server/_core/index.ts
```

ثم افتح <http://localhost:3000>.

> ملاحظة Windows: سكربت `pnpm dev` يستخدم صيغة `VAR=value` غير المدعومة في cmd/PowerShell، لذلك استخدم الأمر أعلاه أو شغّل من Git Bash.

### و) تشغيل الإنتاج محليًا

```powershell
pnpm build
$env:NODE_ENV="production"; node dist/index.js
```

---

## 10) خطوات الإعداد اليدوي

1. **فعّل رياضة الجمباز للمؤسسة:** الإعدادات ← الرياضات ← اختر «الجمباز» ← حفظ الإعدادات (مالك المؤسسة فقط).
2. **أضف لاعبًا برياضة وفئة:** لوحة الأكاديمية ← «إضافة لاعب جديد» ← الرياضة = الجمباز ← فئة الجمباز = سيدات/رجال ← اختر المجموعة (تتزامن مع الفئة) ← حفظ.
3. **افتح قسم الجمباز** من القائمة الجانبية (يظهر فقط عند تفعيل الرياضة)، اختر اللاعب ثم الجهاز، سجّل المؤشرات (قيمة + وحدة + ملاحظة اختيارية) واحفظ.
4. **المؤشرات البدنية لأي رياضة:** ملف اللاعب ← تبويب «التحليل البدني» ← «تسجيل تقييم» ← اختر المؤشرات من القائمة ← أدخل القيم ← حفظ.
5. **الملف الصحي:** ملف اللاعب ← تبويب «الصحة والطوارئ» ← املأ الملف الصحي ← حفظ (يمنح أكاديميتك صلاحية `health` وحدها). ثم املأ جهة الاتصال ← حفظ (يمنح `emergency` وحدها).
6. **منح نادٍ صلاحية حساسة:** نفس التبويب ← جدول «صلاحيات البيانات الحساسة» يظهر فقط لمالك الأكاديمية ← يلزم أن يكون النادي معتمدًا لملف اللاعب أولًا ← «منح» لكل نطاق على حدة.
7. **تعديل ملاحظة مدرب آخر:** ملف اللاعب ← تبويب «التحليل الحركي» ← الملاحظات المسجلة ← «تعديل الملاحظة»؛ سيبقى اسم الكاتب الأصلي ويظهر اسمك كمنقّح مع سجل المراجعات.
8. **التحقق من عدم وصول النادي للبيانات الحساسة:** بدّل المؤسسة إلى النادي من القائمة؛ يجب أن يظهر قسم مقفل لتبويب الصحة، وأن يبقى الملف الرياضي متاحًا حسب الاعتماد فقط.
