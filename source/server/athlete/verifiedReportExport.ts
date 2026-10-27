import type { Report } from "../../shared/athlete";
import {
  evaluateSession,
  summarizePlayerEvaluation,
} from "../../shared/evaluation";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const csv = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
};
const sessions = (report: Report) =>
  report.analyses.filter(a => a.pose && !a.isDemo);

export function exportVerifiedReportCsv(report: Report): string {
  const actual = sessions(report);
  const evaluation = summarizePlayerEvaluation(actual);
  const rows: unknown[][] = [
    [
      "ATHLETE AI",
      "قياسات جلسات محفوظة ثنائية الأبعاد — لا معيار أداء أو درجة عامة مفترضة",
    ],
    ["اللاعب", report.player.name],
    ["الفترة", report.from, report.to],
    ["التقييم العام", "لم يُقيّم", evaluation.overall.reason],
    ["الجلسات الفعلية", actual.length],
    ["المهارات المختبرة", evaluation.testedSkills.join(" / ")],
    [],
    [
      "الجلسة",
      "الفيديو",
      "التاريخ",
      "المهارة",
      "القدم المصرح بها",
      "المؤشر",
      "القيمة",
      "الوحدة",
      "الحالة",
      "السبب",
      "بداية العينات ث",
      "نهاية العينات ث",
      "الطريقة",
      "المرحلة",
      "إصدار النموذج",
    ],
  ];
  for (const a of actual) {
    const e = a.evaluation ?? evaluateSession(a);
    for (const m of e.measurements)
      rows.push([
        a.id,
        a.videoId,
        a.createdAt,
        a.skill,
        e.context.usedFoot,
        m.indicatorCode,
        m.value ?? "غير متوفر",
        m.unit,
        m.assessment === "measurement_only" ? "قياس دون حكم" : "لم يُقيّم",
        m.reason,
        m.timeStart ?? "غير متوفر",
        m.timeEnd ?? "غير متوفر",
        m.method,
        m.phase,
        a.pose?.modelVersion,
      ]);
  }
  rows.push(
    [],
    [
      "الفيديو",
      "الاسم",
      "المهارة",
      "التاريخ",
      "المصدر",
      "الترخيص",
      "النسبة",
      "الوصف",
    ]
  );
  for (const v of report.videos)
    rows.push([
      v.id,
      v.title,
      v.skill,
      v.recordedAt,
      v.source?.url ?? "فيديو خاص رفعه المستخدم",
      v.source?.license ?? "غير مرفق",
      v.source?.credit ?? "غير مرفق",
      v.source?.description ?? "",
    ]);
  rows.push(
    [],
    [
      "الملاحظة",
      "المصدر",
      "المؤلف",
      "الجلسة",
      "التاريخ",
      "الإجراء المطلوب",
      "آخر تعديل",
    ]
  );
  for (const n of report.notes)
    rows.push([
      n.text,
      n.source === "automatic" ? "تحليل آلي" : "مدرب",
      n.authorName ?? "غير متوفر",
      n.analysisId ?? "عامة",
      n.createdAt,
      n.requiredAction ?? "غير محدد",
      n.updatedAt ?? n.createdAt,
    ]);
  return (
    "\ufeff" + rows.map(row => row.map(csv).join(",")).join("\r\n") + "\r\n"
  );
}

export function exportVerifiedReportHtml(report: Report): string {
  const actual = sessions(report);
  const evaluation = summarizePlayerEvaluation(actual);
  const blocks = actual
    .map(a => {
      const e = a.evaluation ?? evaluateSession(a);
      const rows = e.measurements
        .map(
          m =>
            `<tr><td>${escapeHtml(m.name)}<br><small>${escapeHtml(m.indicatorCode)}</small></td><td>${escapeHtml(m.value ?? "غير متوفر")}</td><td>${escapeHtml(m.unit)}</td><td>${escapeHtml(m.timeStart ?? "غير متوفر")}–${escapeHtml(m.timeEnd ?? "غير متوفر")} ث</td><td>${escapeHtml(m.assessment === "measurement_only" ? "قياس دون حكم" : "لم يُقيّم")}<br>${escapeHtml(m.reason)}</td></tr>`
        )
        .join("");
      return `<section><h2>الجلسة #${escapeHtml(a.id)} — ${escapeHtml(a.skill)}</h2><p>الفيديو #${escapeHtml(a.videoId)} · ${escapeHtml(a.createdAt)} · القدم المصرّح بها: ${escapeHtml(e.context.usedFoot)} · ${escapeHtml(a.pose?.engine)} / ${escapeHtml(a.pose?.modelVersion)}</p><p>المرحلة: المقطع كاملًا غير مقسم آليًا. ${escapeHtml(e.overall.reason)}</p><table><thead><tr><th>المؤشر</th><th>القيمة</th><th>الوحدة</th><th>زمن العينات</th><th>الحالة والسبب</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join("");
  const notes = report.notes
    .map(
      n =>
        `<li><strong>${escapeHtml(n.source === "automatic" ? "تحليل آلي" : "مدرب")} · ${escapeHtml(n.authorName ?? "غير متوفر")}</strong><p>${escapeHtml(n.text)}</p><p>الجلسة ${escapeHtml(n.analysisId ?? "عامة")} · ${escapeHtml(n.createdAt)} · الإجراء: ${escapeHtml(n.requiredAction ?? "غير محدد")}</p></li>`
    )
    .join("");
  const videos = report.videos
    .map(
      v =>
        `<tr><td>${escapeHtml(v.title)}</td><td>${escapeHtml(v.source?.url ?? "فيديو خاص رفعه المستخدم")}</td><td>${escapeHtml(v.source?.license ?? "غير مرفق")}</td><td>${escapeHtml(v.source?.credit ?? "غير مرفق")}</td><td>${escapeHtml(v.source?.description ?? "")}</td></tr>`
    )
    .join("");
  const sourceSection = `<h2>مصادر الفيديوهات</h2><table><tr><th>الاسم</th><th>المصدر</th><th>الترخيص</th><th>النسبة</th><th>الوصف</th></tr>${videos}</table><h2>ملخص الوضعية والسلسلة الزمنية المحفوظة</h2><p>إطارات التتبع والزوايا مرتبطة بزمن الفيديو داخل ملف اللاعب. هذا ليس اتجاهًا لتقييم رياضي عام.</p>`;
  const notice = report.player.isDemo
    ? "بيانات تجريبية لملف العرض؛ قياسات الجلسات الفعلية منفصلة ولا تُستبدل بأمثلة جاهزة."
    : "قياسات الجلسات الفعلية فقط، دون أمثلة أو درجات افتراضية.";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ATHLETE AI — تقرير ${escapeHtml(report.player.name)}</title><style>body{font:16px/1.8 Tahoma,Arial,sans-serif;color:#193a2b;max-width:1100px;margin:24px auto;padding:20px}h1,h2{color:#086541}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #b9d0c2;padding:10px;text-align:right;vertical-align:top}th{background:#edf6f0}small{font-size:12px}section{margin-bottom:24px}@media print{body{margin:0;padding:8px}}</style></head><body><h1>ATHLETE AI — تقرير اللاعب</h1><h2>${escapeHtml(report.player.name)}</h2><p>${escapeHtml(notice)}</p><p>الفترة: ${escapeHtml(report.from)} إلى ${escapeHtml(report.to)}</p><p>التقييم العام: لم يُقيّم. ${escapeHtml(evaluation.overall.reason)}</p><p>الجلسات الفعلية: ${actual.length} · المهارات: ${escapeHtml(evaluation.testedSkills.join("، ") || "لم تُختبر")}</p><p>القياسات إسقاطات ثنائية الأبعاد؛ ليست قياسًا تشريحيًا ثلاثي الأبعاد أو تشخيصًا أو حكمًا رياضيًا عامًا. لا تستخدم أمثلة العرض القديمة ولا تعمم محاولة واحدة.</p>${blocks || "<p>لا توجد جلسات فعلية ضمن هذه الفترة.</p>"}${sourceSection}<h2>الملاحظات المصرح بها</h2><ul>${notes || "<li>لا توجد ملاحظات متاحة ضمن الفترة والصلاحية.</li>"}</ul><h2>التمارين</h2><p>لا توجد توصيات آلية عند غياب معيار مناسب. خطط المدرب المرتبطة بجانب تطوير موثق تحفظ وتراجع داخل ملف اللاعب.</p></body></html>`;
}
