import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Player, Report, Video } from "../../shared/athlete";
import {
  UNASSESSED_RATING_LABEL,
  type CoachAssessment,
} from "../../shared/coaching";
import {
  apparatusName,
  gymnasticsCategoryName,
  isGymnasticsCategoryId,
  sportDefinition,
} from "../../shared/sports";
import {
  evaluateSession,
  summarizePlayerEvaluation,
} from "../../shared/evaluation";
import { ACADEMY_TENURE_NOTE, calendarToday, formatAcademyTenure } from "../../shared/academy-tenure";

export const DEMO_ASSESSMENT_NOTICE =
  "بيانات وتقييمات تجريبية — ليست مستخرجة من تحليل ذكاء اصطناعي فعلي";

/** Escapes every value that originated in a saved report record before HTML use. */
export const escapeReportHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!
  );

/** Quotes CSV cells and neutralizes spreadsheet formula prefixes. */
export const escapeReportCsvCell = (value: unknown): string => {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
};

function toArabicNumerals(value: string): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/\d/g, digit => digits[Number(digit)]!)
    .replace(/,/g, "٬")
    .replace(/\./g, "٫");
}

export function formatArabicNumber(value: number, fractionDigits = 0): string {
  return toArabicNumerals(
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value)
  );
}

export function formatArabicPercent(value: number): string {
  return `${formatArabicNumber(value)}٪`;
}

const actualSessions = (report: Report) =>
  report.analyses.filter(analysis => analysis.pose && !analysis.isDemo);

const savedCoachAssessments = (report: Report): CoachAssessment[] =>
  (report as Report & { coachAssessments?: CoachAssessment[] })
    .coachAssessments ?? [];

const finiteSavedScore = (score: unknown): score is number =>
  typeof score === "number" &&
  Number.isFinite(score) &&
  score >= 0 &&
  score <= 100;

/** Preserve the server-derived full snapshot mean; a report skill filter must not change it. */
export function savedAssessmentOverall10(
  assessment: Pick<CoachAssessment, "skills"> & Partial<Pick<CoachAssessment, "overall">>
): number | null {
  if (assessment.overall !== undefined) {
    return finiteSavedScore(assessment.overall)
      ? Number((assessment.overall / 10).toFixed(2))
      : null;
  }
  // Read-only compatibility for callers that supply a legacy skill-only record.
  const scores = assessment.skills.flatMap(skill =>
    finiteSavedScore(skill.score) ? [skill.score] : []
  );
  if (!scores.length) return null;
  return Number(
    (scores.reduce((total, score) => total + score, 0) / scores.length / 10).toFixed(
      2
    )
  );
}

type AssessmentView = {
  latest: CoachAssessment | null;
  previousCompatible: CoachAssessment | null;
  compatibleTrend: CoachAssessment[];
};

function assessmentTimestamp(assessment: CoachAssessment): number {
  const timestamp = Date.parse(assessment.assessedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareAssessments(left: CoachAssessment, right: CoachAssessment): number {
  const byDate = assessmentTimestamp(left) - assessmentTimestamp(right);
  if (byDate !== 0) return byDate;
  return left.id - right.id;
}

function assessmentView(report: Report): AssessmentView {
  const ordered = savedCoachAssessments(report)
    .slice()
    .sort(compareAssessments);
  const latest = ordered.at(-1) ?? null;
  if (!latest)
    return { latest: null, previousCompatible: null, compatibleTrend: [] };

  // Preserve the full measured-set signature even after selecting a report skill.
  const signature = (assessment: CoachAssessment) => assessment.measuredSignature ??
    assessment.skills.filter(skill => skill.score !== null).map(skill => skill.name).sort().join("|");
  const compatibleTrend = ordered.filter(
    assessment => assessment.protocol === latest.protocol && signature(assessment) === signature(latest)
  );
  return {
    latest,
    previousCompatible:
      compatibleTrend.length > 1
        ? compatibleTrend[compatibleTrend.length - 2]!
        : null,
    compatibleTrend,
  };
}

function formatOverall10(assessment: CoachAssessment | null): string {
  const mean = assessment ? savedAssessmentOverall10(assessment) : null;
  return mean === null
    ? UNASSESSED_RATING_LABEL
    : `${formatArabicNumber(mean, 1)} / ١٠`;
}

function playerSportDetails(player: Player): string[] {
  const definition = sportDefinition(player.sport);
  const details = [definition.name];
  if (player.position)
    details.push(`${definition.terminology.position}: ${player.position}`);
  if (isGymnasticsCategoryId(player.gymnasticsCategory))
    details.push(`الفئة: ${gymnasticsCategoryName(player.gymnasticsCategory)}`);
  if (player.primaryApparatus)
    details.push(`الجهاز: ${apparatusName(player.primaryApparatus)}`);
  return details;
}

export function reportTenureRows(report: Report) {
  return [
    ...savedCoachAssessments(report).map(assessment => ({
      kind: "تقييم مهارات محفوظ",
      date: assessment.assessedAt.slice(0, 10),
      score: formatOverall10(assessment),
      tenure: formatAcademyTenure(report.player.academyJoinDate, assessment.assessedAt.slice(0, 10)),
    })),
    ...actualSessions(report).map(analysis => ({
      kind: `تحليل حركي #${analysis.id}`,
      date: analysis.createdAt.slice(0, 10),
      score: "قياس حركي، وليس درجة مهارة",
      tenure: formatAcademyTenure(report.player.academyJoinDate, analysis.createdAt.slice(0, 10)),
    })),
  ].sort((left, right) => left.date.localeCompare(right.date));
}

function tenureTimelineHtml(report: Report): string {
  const asOf = report.to.slice(0, 10) > calendarToday() ? calendarToday() : report.to.slice(0, 10);
  const rows = reportTenureRows(report);
  return `<section class="card"><h2>مدة الانضمام وتطور الأداء</h2><p>تاريخ الانضمام للأكاديمية: ${escapeReportHtml(report.player.academyJoinDate || "غير محدد")} · مدة الانضمام حتى نهاية الفترة: ${escapeReportHtml(formatAcademyTenure(report.player.academyJoinDate, asOf))}</p><p class="chart-caption">${escapeReportHtml(ACADEMY_TENURE_NOTE)}</p>${rows.length ? `<table><thead><tr><th>السجل</th><th>التاريخ</th><th>التقييم</th><th>مدة الانضمام في ذلك التاريخ</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeReportHtml(row.kind)}</td><td>${escapeReportHtml(row.date)}</td><td>${escapeReportHtml(row.score)}</td><td>${escapeReportHtml(row.tenure)}</td></tr>`).join("")}</tbody></table>` : "<p>لا توجد سجلات ضمن الفترة لربط المدة بالأداء.</p>"}</section>`;
}

function safeHttpsLink(value: unknown, fallback = "غير مرفق"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return escapeReportHtml(fallback);
  try {
    const url = new URL(text);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname
    ) {
      const href = escapeReportHtml(url.toString());
      return `<a href="${href}" rel="noreferrer noopener nofollow" target="_blank">${escapeReportHtml(
        url.hostname
      )}</a>`;
    }
  } catch {
    // An untrusted value remains escaped text, never an HTML attribute or link.
  }
  return escapeReportHtml(text);
}

function localBrandPhotoDataUri(photoKey: unknown): string | undefined {
  if (
    typeof photoKey !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.(?:jpe?g|png|webp)$/i.test(photoKey)
  )
    return undefined;

  const extension = path.extname(photoKey).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";
  const candidateRoots = [
    path.resolve(process.cwd(), "client", "public", "brand"),
    path.resolve(process.cwd(), "dist", "public", "brand"),
  ];

  for (const candidateRoot of candidateRoots) {
    try {
      const root = realpathSync(candidateRoot);
      const file = path.resolve(root, photoKey);
      if (!file.startsWith(root + path.sep)) continue;
      const resolvedFile = realpathSync(file);
      if (!resolvedFile.startsWith(root + path.sep)) continue;
      const metadata = statSync(resolvedFile);
      if (!metadata.isFile() || metadata.size > 1_000_000) continue;
      return `data:${mime};base64,${readFileSync(resolvedFile).toString("base64")}`;
    } catch {
      // Optional photograph: a missing or non-local file is deliberately omitted.
    }
  }
  return undefined;
}

function assessmentNotice(assessment: CoachAssessment): string {
  return assessment.isDemo
    ? `<p class="demo-record">${DEMO_ASSESSMENT_NOTICE}</p>`
    : "";
}

function assessmentIdentity(assessment: CoachAssessment): string {
  return assessment.isDemo
    ? "سجل تقييم تجريبي محفوظ"
    : `المدرب: ${escapeReportHtml(assessment.coachName || "غير مرفق")}`;
}

function skillBars(
  current: CoachAssessment,
  previous: CoachAssessment | null
): string {
  const previousScores = new Map(
    (previous?.skills ?? []).map(skill => [skill.name, skill.score])
  );
  const rows = current.skills.length
    ? current.skills
        .map(skill => {
          const score = finiteSavedScore(skill.score) ? skill.score : null;
          const prior = previousScores.get(skill.name);
          const priorScore = finiteSavedScore(prior) ? prior : null;
          const bar =
            score === null
              ? `<span class="unassessed">${UNASSESSED_RATING_LABEL}</span>`
              : `<div class="bar-row"><span class="bar-label">${formatArabicPercent(
                  score
                )}</span><span class="bar-track"><span class="bar current" style="width:${score}%"></span></span></div>`;
          const previousBar =
            previous && priorScore !== null
              ? `<div class="bar-row previous"><span class="bar-label">السابق ${formatArabicPercent(
                  priorScore
                )}</span><span class="bar-track"><span class="bar" style="width:${priorScore}%"></span></span></div>`
              : "";
          return `<li><strong>${escapeReportHtml(skill.name)}</strong>${bar}${previousBar}</li>`;
        })
        .join("")
    : `<li class="unassessed">${UNASSESSED_RATING_LABEL}</li>`;
  const comparisonCaption = previous
    ? "الحالي ثم السابق — كلاهما من البروتوكول نفسه"
    : "درجات أحدث تقييم محفوظ (/١٠٠)";
  return `<p class="chart-caption">${comparisonCaption}</p><ul class="skill-bars">${rows}</ul>`;
}

function overallTrendSvg(assessments: CoachAssessment[]): string {
  const points = assessments
    .map(assessment => ({ assessment, score: savedAssessmentOverall10(assessment) }))
    .filter(
      (item): item is { assessment: CoachAssessment; score: number } =>
        item.score !== null
    );
  if (!points.length)
    return `<p class="unassessed">لا توجد درجات مهارات محفوظة لرسم الاتجاه.</p>`;

  const width = 620;
  const height = 190;
  const inset = 28;
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : inset + (index * (width - inset * 2)) / (points.length - 1);
  const y = (score: number) => height - inset - (score / 10) * (height - inset * 2);
  const polyline = points
    .map((point, index) => `${x(index).toFixed(1)},${y(point.score).toFixed(1)}`)
    .join(" ");
  const labels = points
    .map(
      (point, index) =>
        `<text x="${x(index).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeReportHtml(
          point.assessment.assessedAt.slice(0, 10)
        )}</text>`
    )
    .join("");
  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${x(index).toFixed(1)}" cy="${y(point.score).toFixed(1)}" r="4"></circle><text class="trend-value" x="${x(
          index
        ).toFixed(1)}" y="${(y(point.score) - 9).toFixed(1)}" text-anchor="middle">${formatArabicNumber(
          point.score,
          1
        )}</text>`
    )
    .join("");
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="اتجاه المتوسط العام من تقييمات البروتوكول نفسه"><line x1="${inset}" y1="${height - inset}" x2="${width - inset}" y2="${height - inset}"></line><line x1="${inset}" y1="${inset}" x2="${inset}" y2="${height - inset}"></line><polyline points="${polyline}"></polyline>${dots}${labels}</svg>`;
}

function renderedAssessmentDetails(assessment: CoachAssessment): string {
  const strengths = assessment.strengths.length
    ? assessment.strengths.map(item => `<li>${escapeReportHtml(item)}</li>`).join("")
    : "<li>غير مرفق</li>";
  const development = assessment.development.length
    ? assessment.development
        .map(item => `<li>${escapeReportHtml(item)}</li>`)
        .join("")
    : "<li>غير مرفق</li>";
  const exercises = assessment.exercises.length
    ? assessment.exercises
        .map(
          exercise =>
            `<li><strong>${escapeReportHtml(exercise.title)}</strong><br>${escapeReportHtml(exercise.description)}</li>`
        )
        .join("")
    : "<li>لا توجد تمارين محفوظة في هذا التقييم.</li>";
  return `<article class="assessment-card">${assessmentNotice(assessment)}<div class="assessment-meta"><span>${escapeReportHtml(
    assessment.assessedAt
  )}</span><span>${escapeReportHtml(assessment.protocol || "بروتوكول غير مرفق")}</span><span>${assessmentIdentity(
    assessment
  )}</span></div><h3>المتوسط المحسوب: ${formatOverall10(assessment)}</h3><h4>درجات المهارات</h4>${skillBars(
    assessment,
    null
  )}<div class="assessment-notes"><h4>ملاحظة التقييم المحفوظة</h4><p>${escapeReportHtml(
    assessment.notes || "غير مرفق"
  )}</p></div><div class="two-columns"><div><h4>نقاط قوة موثقة</h4><ul>${strengths}</ul></div><div><h4>جانب تطوير موثق</h4><ul>${development}</ul></div></div><h4>تمارين محفوظة بواسطة المقيّم</h4><ul>${exercises}</ul></article>`;
}

function sourceRow(video: Video): string {
  const source = video.source;
  return `<tr><td>${escapeReportHtml(video.title)}</td><td>${escapeReportHtml(
    video.skill
  )}</td><td>${safeHttpsLink(source?.url, "فيديو خاص رفعه المستخدم")}</td><td>${escapeReportHtml(
    source?.license || "غير مرفق"
  )}</td><td>${escapeReportHtml(source?.credit || "غير مرفق")}</td><td>${escapeReportHtml(
    source?.description || ""
  )}</td></tr>`;
}

function actualSessionBlocks(report: Report): string {
  return actualSessions(report)
    .map(analysis => {
      const evaluation = analysis.evaluation ?? evaluateSession(analysis);
      const measurements = evaluation.measurements
        .map(
          measurement =>
            `<tr><td>${escapeReportHtml(measurement.name)}<br><small>${escapeReportHtml(
              measurement.indicatorCode
            )}</small></td><td>${escapeReportHtml(
              measurement.value ?? "غير متوفر"
            )}</td><td>${escapeReportHtml(
              measurement.unit
            )}</td><td>${escapeReportHtml(
              measurement.timeStart ?? "غير متوفر"
            )}–${escapeReportHtml(
              measurement.timeEnd ?? "غير متوفر"
            )} ث</td><td>${escapeReportHtml(
              measurement.assessment === "measurement_only"
                ? "قياس دون حكم"
                : "لم يُقيّم"
            )}<br>${escapeReportHtml(measurement.reason)}</td></tr>`
        )
        .join("");
      const observations = analysis.observations.length
        ? `<h3>ملاحظات الحركة المسجلة</h3><ul class="observations">${analysis.observations
            .map(
              observation =>
                `<li><strong>${escapeReportHtml(observation.title)}</strong><br>${escapeReportHtml(observation.detail)}</li>`
            )
            .join("")}</ul>`
        : "";
      return `<section class="session"><h2>جلسة قياس محفوظة #${escapeReportHtml(
        analysis.id
      )} — ${escapeReportHtml(analysis.skill)}</h2><p>الفيديو #${escapeReportHtml(
        analysis.videoId ?? "غير مرفق"
      )} · ${escapeReportHtml(analysis.createdAt)} · القدم المصرّح بها: ${escapeReportHtml(
        evaluation.context.usedFoot
      )}</p><p>محرك الوضعية: ${escapeReportHtml(
        analysis.pose?.engine
      )} / ${escapeReportHtml(analysis.pose?.modelVersion)}. ${escapeReportHtml(
        evaluation.overall.reason
      )}</p><table><thead><tr><th>المؤشر</th><th>القيمة</th><th>الوحدة</th><th>زمن العينات</th><th>الحالة والسبب</th></tr></thead><tbody>${measurements}</tbody></table>${observations}</section>`;
    })
    .join("");
}

function renderedNotes(report: Report): string {
  return report.notes.length
    ? report.notes
        .map(
          note =>
            `<li><strong>${escapeReportHtml(
              note.source === "automatic" ? "تحليل آلي محفوظ" : "مدرب"
            )} · ${escapeReportHtml(note.authorName ?? "غير متوفر")}</strong><p>${escapeReportHtml(
              note.text
            )}</p><p>الجلسة ${escapeReportHtml(
              note.analysisId ?? "عامة"
            )} · ${escapeReportHtml(note.createdAt)} · الإجراء: ${escapeReportHtml(
              note.requiredAction ?? "غير محدد"
            )}</p></li>`
        )
        .join("")
    : "<li>لا توجد ملاحظات متاحة ضمن الفترة والصلاحية.</li>";
}

export type ReportHtmlOptions = {
  /** Trusted CSS created by the PDF adapter for local base64 Cairo font faces. */
  embeddedFontCss?: string;
  printMode?: boolean;
};

export function renderVerifiedReportHtml(
  report: Report,
  options: ReportHtmlOptions = {}
): string {
  const actual = actualSessions(report);
  const evaluation = summarizePlayerEvaluation(actual);
  const view = assessmentView(report);
  const photo = localBrandPhotoDataUri(report.player.photoKey);
  const isDemoReport = Boolean(report.isDemo || report.player.isDemo);
  const assessmentSummary = view.latest
    ? `<div class="overall-score"><strong>${formatOverall10(
        view.latest
      )}</strong><span>متوسط أحدث تقييم محفوظ للمهارات</span></div><p>هذا المتوسط محسوب من درجات المهارات (/١٠٠) في السجل الأحدث فقط، وليس نتيجة تحليل حركة أو ذكاء اصطناعي.</p>`
    : `<div class="overall-score unassessed"><strong>${UNASSESSED_RATING_LABEL}</strong><span>لا يوجد تقييم مهارات محفوظ ضمن الفترة المختارة</span></div>`;
  const assessmentRecords = savedCoachAssessments(report)
    .slice()
    .sort(compareAssessments)
    .reverse()
    .map(renderedAssessmentDetails)
    .join("");
  const comparison =
    view.latest && view.previousCompatible
      ? `<section class="card comparison"><h2>مقارنة محفوظة ضمن البروتوكول نفسه</h2><p>الحالي: ${escapeReportHtml(
          view.latest.assessedAt
        )} · السابق: ${escapeReportHtml(
          view.previousCompatible.assessedAt
        )} · البروتوكول: ${escapeReportHtml(view.latest.protocol)}</p>${skillBars(
          view.latest,
          view.previousCompatible
        )}</section>`
      : "";
  const trend = view.latest
    ? `<section class="card"><h2>اتجاه المتوسط العام (/١٠)</h2><p class="chart-caption">يعرض فقط السجلات التي تحمل البروتوكول نفسه: ${escapeReportHtml(
        view.latest.protocol || "غير مرفق"
      )}</p>${overallTrendSvg(view.compatibleTrend)}</section>`
    : "";
  const demoNotice = isDemoReport
    ? `<p class="demo-record prominent">${DEMO_ASSESSMENT_NOTICE}</p><p>لا تستخدم أمثلة العرض القديمة بدل قياسات جلسة فعلية أو تقييم محفوظ.</p>`
    : `<p>القياسات والتقييمات المعروضة أدناه من السجلات المحفوظة ضمن الفترة المحددة فقط.</p>`;
  const fontCss = options.embeddedFontCss ?? "";
  const printClass = options.printMode ? " print-report" : "";

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ATHLETE AI — تقرير ${escapeReportHtml(
    report.player.name
  )}</title><style>${fontCss}
:root{--ink:#153c2c;--green:#087047;--green-dark:#055b39;--green-soft:#e9f5ed;--line:#b9d8c5;--muted:#5e7468;--paper:#fff;--warning:#9a5a00}*{box-sizing:border-box}html{background:#f2f7f3}body{background:var(--paper);color:var(--ink);font:15px/1.85 "Cairo Export Arabic","Cairo",Tahoma,Arial,sans-serif;margin:0 auto;max-width:1120px;padding:28px}h1,h2,h3,h4{color:var(--green-dark);line-height:1.45;margin:0 0 10px}h1{font-size:28px}h2{font-size:21px;margin-top:0}h3{font-size:17px}h4{font-size:15px}p{margin:0 0 10px}.report-header{border-bottom:4px solid var(--green);padding-bottom:18px;margin-bottom:18px}.brand-line{color:var(--green);font-weight:700;letter-spacing:.08em}.player-heading{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.player-photo{width:76px;height:76px;border:2px solid var(--line);border-radius:50%;object-fit:cover;background:var(--green-soft)}.player-meta{color:var(--muted);margin:5px 0 0}.card,.session,.assessment-card{border:1px solid var(--line);border-radius:10px;background:#fff;padding:18px;margin:16px 0;break-inside:avoid}.summary{background:linear-gradient(135deg,#fff 0%,var(--green-soft) 100%)}.overall-score{border-right:5px solid var(--green);padding:8px 14px;margin:13px 0;background:#fff}.overall-score strong{display:block;font-size:29px;color:var(--green-dark)}.overall-score span{color:var(--muted);font-size:13px}.unassessed{color:var(--muted)}.demo-record{background:#fff5df;border-right:4px solid #c98012;color:#704200;padding:9px 12px;font-weight:700}.prominent{margin:12px 0}.assessment-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13px}.assessment-meta span{border-left:1px solid var(--line);padding-left:8px}.assessment-meta span:last-child{border-left:0}.two-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.two-columns ul,.assessment-card>ul,.observations{margin:0;padding-right:22px}.skill-bars{list-style:none;margin:0;padding:0}.skill-bars li{padding:10px 0;border-bottom:1px solid #e0ece4}.skill-bars li:last-child{border-bottom:0}.bar-row{display:flex;align-items:center;gap:10px;margin-top:6px}.bar-label{width:74px;color:var(--muted);font-size:13px}.bar-track{height:10px;flex:1;background:#e1eee6;border-radius:99px;overflow:hidden;direction:ltr}.bar{display:block;height:100%;background:#7cae91;border-radius:99px}.bar.current{background:var(--green)}.bar-row.previous .bar-track{opacity:.72}.chart-caption{font-size:13px;color:var(--muted)}.trend{width:100%;height:auto;display:block;direction:ltr;background:#fbfdfb;border:1px solid #e0ece4;border-radius:8px}.trend line{stroke:#b9d8c5;stroke-width:1}.trend polyline{fill:none;stroke:#087047;stroke-width:3}.trend circle{fill:#087047}.trend text{fill:#5e7468;font:11px "Cairo Export Arabic",Arial,sans-serif}.trend .trend-value{fill:#055b39;font-weight:700}table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}th,td{border:1px solid var(--line);padding:9px;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{background:var(--green-soft);color:var(--green-dark)}small{font-size:11px;color:var(--muted)}a{color:#075f3d;text-decoration:underline}section{break-inside:avoid}.source-table{font-size:13px}.footer-note{font-size:13px;color:var(--muted);border-top:1px solid var(--line);margin-top:20px;padding-top:12px}@media(max-width:650px){body{padding:16px;font-size:14px}h1{font-size:23px}.two-columns{grid-template-columns:1fr}.card,.session,.assessment-card{padding:13px}.source-table{font-size:12px}.player-photo{width:60px;height:60px}}@page{size:A4;margin:12mm}@media print{html{background:#fff}body{max-width:none;padding:0;font-size:11pt}.card,.session,.assessment-card{padding:11px;margin:9px 0;box-shadow:none}.trend{max-height:62mm}table{font-size:9.2pt}th,td{padding:6px}.print-report .report-header{margin-bottom:9px}}
</style></head><body class="${printClass}"><header class="report-header"><p class="brand-line">ATHLETE AI · تقرير محفوظ</p><div class="player-heading">${
    photo
      ? `<img class="player-photo" src="${photo}" alt="صورة اللاعب">`
      : ""
  }<div><h1>تقرير اللاعب: ${escapeReportHtml(report.player.name)}</h1><p class="player-meta">${playerSportDetails(
    report.player
  )
    .map(escapeReportHtml)
    .join(" · ")}</p><p class="player-meta">الفترة: ${escapeReportHtml(
    report.from
  )} إلى ${escapeReportHtml(report.to)}</p></div></div>${demoNotice}</header><main><section class="card summary"><h2>ملخص التقييم المحفوظ</h2>${assessmentSummary}<p>الجلسات الفعلية ذات بيانات الوضعية: ${formatArabicNumber(
    actual.length
  )} · المهارات ذات القياسات: ${escapeReportHtml(
    evaluation.testedSkills.join("، ") || "لم تُختبر"
  )}</p></section>${tenureTimelineHtml(report)}${trend}${comparison}<section><h2>تقييمات المهارات المحفوظة</h2><p>المهارة غير المسجلة تعرض «${UNASSESSED_RATING_LABEL}» ولا تستبدل بدرجة افتراضية.</p>${
    assessmentRecords || "<p class=\"card unassessed\">لا توجد تقييمات مهارات محفوظة ضمن الفترة.</p>"
  }</section><section><h2>ملخص الوضعية والسلسلة الزمنية المحفوظة للجلسات الفعلية</h2><p>لا تعرض هذه الصفحة إلا الجلسات التي تحوي بيانات وضعية محفوظة وليست تجريبية. القياسات إسقاطات ثنائية الأبعاد وليست قياسًا تشريحيًا ثلاثي الأبعاد أو تشخيصًا أو حكمًا رياضيًا عامًا. لا تستخدم أمثلة العرض القديمة بدل قياسات الجلسة الفعلية.</p>${
    actualSessionBlocks(report) || "<p class=\"card unassessed\">لا توجد جلسات فعلية ضمن هذه الفترة.</p>"
  }</section><section class="card"><h2>مصادر الفيديوهات وتراخيصها</h2><table class="source-table"><thead><tr><th>الاسم</th><th>المهارة</th><th>المصدر</th><th>الترخيص</th><th>النسبة</th><th>الوصف</th></tr></thead><tbody>${
    report.videos.map(sourceRow).join("") ||
    "<tr><td colspan=\"6\">لا توجد فيديوهات ضمن الفترة.</td></tr>"
  }</tbody></table></section><section class="card"><h2>الملاحظات المصرّح بها</h2><ul>${renderedNotes(
    report
  )}</ul></section></main><footer class="footer-note">المصدر: سجلات اللاعب المحفوظة. لا يستنتج هذا التصدير درجة علمية أو درجة ذكاء اصطناعي من الحركة، ولا يعيد تصنيف قياسات الجلسة كتقييم مهارة.</footer></body></html>`;
}

export function exportVerifiedReportCsv(report: Report): string {
  const actual = actualSessions(report);
  const evaluation = summarizePlayerEvaluation(actual);
  const view = assessmentView(report);
  const rows: unknown[][] = [
    ["ATHLETE AI", "تقرير سجلات اللاعب المحفوظة"],
    ["اللاعب", report.player.name],
    ["الفترة", report.from, report.to],
    ["تاريخ الانضمام للأكاديمية", report.player.academyJoinDate || "غير محدد"],
    ["مدة الانضمام حتى نهاية الفترة", formatAcademyTenure(report.player.academyJoinDate, report.to.slice(0, 10) > calendarToday() ? calendarToday() : report.to.slice(0, 10))],
    [ACADEMY_TENURE_NOTE],
    ["مدة الانضمام وتطور الأداء", "التاريخ", "التقييم", "مدة الانضمام في تاريخ السجل"],
    ...reportTenureRows(report).map(row => [row.kind, row.date, row.score, row.tenure]),
    [],
    ["الرياضة/الفئة/الجهاز", playerSportDetails(report.player).join(" — ")],
    [
      "متوسط أحدث تقييم محفوظ (/10)",
      view.latest ? formatOverall10(view.latest) : UNASSESSED_RATING_LABEL,
    ],
    ["الجلسات الفعلية ذات الوضعية", actual.length],
    ["المهارات ذات القياسات", evaluation.testedSkills.join(" / ")],
    ...(report.isDemo || report.player.isDemo ? [[DEMO_ASSESSMENT_NOTICE]] : []),
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
  for (const analysis of actual) {
    const evaluationForAnalysis = analysis.evaluation ?? evaluateSession(analysis);
    for (const measurement of evaluationForAnalysis.measurements)
      rows.push([
        analysis.id,
        analysis.videoId,
        analysis.createdAt,
        analysis.skill,
        evaluationForAnalysis.context.usedFoot,
        measurement.indicatorCode,
        measurement.value ?? "غير متوفر",
        measurement.unit,
        measurement.assessment === "measurement_only" ? "قياس دون حكم" : "لم يُقيّم",
        measurement.reason,
        measurement.timeStart ?? "غير متوفر",
        measurement.timeEnd ?? "غير متوفر",
        measurement.method,
        measurement.phase,
        analysis.pose?.modelVersion,
      ]);
  }
  rows.push([], ["الجلسة", "الملاحظة الحركية", "التفاصيل", "التاريخ"]);
  for (const analysis of actual)
    for (const observation of analysis.observations)
      rows.push([analysis.id, observation.title, observation.detail, analysis.createdAt]);

  rows.push(
    [],
    ["الفيديو", "الاسم", "المهارة", "التاريخ", "المصدر", "الترخيص", "النسبة", "الوصف"]
  );
  for (const video of report.videos)
    rows.push([
      video.id,
      video.title,
      video.skill,
      video.recordedAt,
      video.source?.url ?? "فيديو خاص رفعه المستخدم",
      video.source?.license ?? "غير مرفق",
      video.source?.credit ?? "غير مرفق",
      video.source?.description ?? "",
    ]);

  rows.push(
    [],
    ["الملاحظة", "المصدر", "المؤلف", "الجلسة", "التاريخ", "الإجراء المطلوب", "آخر تعديل"]
  );
  for (const note of report.notes)
    rows.push([
      note.text,
      note.source === "automatic" ? "تحليل آلي محفوظ" : "مدرب",
      note.authorName ?? "غير متوفر",
      note.analysisId ?? "عامة",
      note.createdAt,
      note.requiredAction ?? "غير محدد",
      note.updatedAt ?? note.createdAt,
    ]);

  rows.push(
    [],
    [
      "تقييم محفوظ",
      "التاريخ",
      "المقيّم/نوع السجل",
      "البروتوكول",
      "المهارة",
      "درجة المهارة /100",
      "المتوسط المحسوب /10",
      "الملاحظة",
      "نقاط القوة",
      "جانب التطوير",
      "التمارين",
      "حالة البيانات",
    ]
  );
  for (const assessment of savedCoachAssessments(report)) {
    const skills = assessment.skills.length
      ? assessment.skills
      : [{ name: "", score: null }];
    const exercises = assessment.exercises
      .map(exercise => `${exercise.title}: ${exercise.description}`)
      .join(" | ");
    for (const skill of skills)
      rows.push([
        "تقييم مهارات محفوظ",
        assessment.assessedAt,
        assessment.isDemo
          ? "سجل تقييم تجريبي محفوظ"
          : assessment.coachName,
        assessment.protocol,
        skill.name,
        skill.score ?? UNASSESSED_RATING_LABEL,
        formatOverall10(assessment),
        assessment.notes,
        assessment.strengths.join(" | "),
        assessment.development.join(" | "),
        exercises || "لا توجد تمارين محفوظة",
        assessment.isDemo ? DEMO_ASSESSMENT_NOTICE : "سجل محفوظ",
      ]);
  }
  return "\ufeff" + rows.map(row => row.map(escapeReportCsvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportVerifiedReportHtml(report: Report): string {
  return renderVerifiedReportHtml(report);
}
