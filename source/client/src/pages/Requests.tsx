import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Clock3,
  FileText,
  ShieldCheck,
  Undo2,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { AccessRequest } from "@shared/athlete";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  Panel,
  StatusBadge,
  Tabs,
} from "@/components/athlete/UI";

type RequestTab = "pending" | "approved" | "all";
type RequestAction = "approve" | "reject" | "revoke";
type Decision = { request: AccessRequest; action: RequestAction };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function actionText(action: RequestAction) {
  if (action === "approve") return "الموافقة على الطلب";
  if (action === "reject") return "رفض الطلب";
  return "إلغاء صلاحية الوصول";
}

function actionIcon(action: RequestAction) {
  if (action === "approve") return CheckCircle2;
  if (action === "reject") return XCircle;
  return Undo2;
}

export default function Requests() {
  const { organization, orgId, invalidate } = useAthlete();
  const [, setLocation] = useLocation();
  const requestsQuery = useApi<AccessRequest[]>(
    "/requests",
    Boolean(organization)
  );
  const [tab, setTab] = useState<RequestTab>("pending");
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const isAcademy = organization?.type === "academy";
  const isOwner = organization?.role === "owner";
  const requests = requestsQuery.data ?? [];
  const counts = useMemo(
    () => ({
      pending: requests.filter(request => request.status === "pending").length,
      approved: requests.filter(request => request.status === "approved")
        .length,
      all: requests.length,
    }),
    [requests]
  );

  const visibleRequests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar-SA");
    return requests.filter(request => {
      const matchesTab = tab === "all" || request.status === tab;
      const haystack = isAcademy
        ? [
            request.playerName,
            request.clubName,
            request.message,
            request.reason ?? "",
          ]
        : [
            request.playerName,
            request.academyName,
            request.message,
            request.reason ?? "",
          ];
      const matchesSearch =
        !needle ||
        haystack.some(value =>
          value.toLocaleLowerCase("ar-SA").includes(needle)
        );
      return matchesTab && matchesSearch;
    });
  }, [isAcademy, requests, search, tab]);

  async function completeDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setSubmitting(true);
    setDecisionError("");
    try {
      await api<AccessRequest>(`/requests/${decision.request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: decision.action,
          reason: reason.trim() || undefined,
        }),
      });
      await invalidate();
      toast.success(
        decision.action === "approve"
          ? "تمت الموافقة على الطلب."
          : decision.action === "reject"
            ? "تم رفض الطلب."
            : "تم إلغاء صلاحية الوصول."
      );
      setDecision(null);
      setReason("");
    } catch (cause) {
      setDecisionError(
        cause instanceof Error ? cause.message : "تعذر تحديث حالة الطلب."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openDecision(request: AccessRequest, action: RequestAction) {
    setReason("");
    setDecisionError("");
    setDecision({ request, action });
  }

  if (!organization || !orgId)
    return <Loading label="جارٍ التحقق من مساحة العمل…" />;
  if (requestsQuery.isLoading) return <Loading label="جارٍ تحميل الطلبات…" />;
  if (requestsQuery.error)
    return (
      <ErrorState
        error={requestsQuery.error}
        retry={() => {
          void requestsQuery.refetch();
        }}
      />
    );

  const tabs = [
    { id: "pending", label: `قيد المراجعة (${counts.pending})` },
    { id: "approved", label: `المقبولة (${counts.approved})` },
    { id: "all", label: `الكل (${counts.all})` },
  ];

  return (
    <div className="section-stack">
      <PageHeading
        title={isAcademy ? "طلبات الاطلاع الواردة" : "طلبات الاطلاع المرسلة"}
        subtitle={
          isAcademy
            ? "راجع طلبات الأندية للاعبين التابعين لأكاديميتك."
            : "تابع حالة طلبات ناديك. لا يظهر الملف الكامل إلا بعد الموافقة."
        }
        icon={isAcademy ? UsersRound : FileText}
        actions={<DemoBadge />}
      />

      {!isAcademy ? (
        <Panel title="حدود الوصول" icon={ShieldCheck}>
          <p className="muted">
            تبقى البيانات الحساسة والفيديوهات والتقارير الكاملة غير متاحة إلى أن
            تعتمد الأكاديمية الطلب. لا تُرسل هذه الصفحة أي إشعارات بريدية أو
            خارجية.
          </p>
        </Panel>
      ) : !isOwner ? (
        <Panel title="صلاحية المراجعة" icon={ShieldCheck}>
          <p className="muted">
            يمكن للمالك فقط اعتماد الطلبات أو رفضها أو إلغاء الصلاحيات. تعرض هذه
            الصفحة الحالة الحالية دون محاكاة صلاحيات إضافية.
          </p>
        </Panel>
      ) : null}

      <Panel title="الطلبات" icon={Clock3}>
        <div className="section-stack">
          <Tabs
            items={tabs}
            value={tab}
            onChange={value => setTab(value as RequestTab)}
          />
          <label className="search-field">
            <FileText size={18} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={
                isAcademy
                  ? "ابحث باللاعب أو النادي"
                  : "ابحث باللاعب أو الأكاديمية"
              }
              aria-label="البحث في الطلبات"
            />
          </label>

          {visibleRequests.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات في هذه القائمة"
              description={
                tab === "pending"
                  ? "لا توجد طلبات قيد المراجعة حاليًا."
                  : "جرّب تبويبًا آخر أو غيّر عبارة البحث."
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>اللاعب</th>
                    <th>{isAcademy ? "النادي" : "الأكاديمية"}</th>
                    <th>التاريخ</th>
                    <th>الرسالة / ملاحظة القرار</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map(request => (
                    <tr key={request.id}>
                      <td>
                        <strong>{request.playerName}</strong>
                      </td>
                      <td>
                        {isAcademy ? request.clubName : request.academyName}
                      </td>
                      <td>
                        {formatDate(request.updatedAt || request.createdAt)}
                      </td>
                      <td>
                        <p>{request.message}</p>
                        {request.reason ? (
                          <p className="muted text-sm">{request.reason}</p>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={request.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {isAcademy &&
                          isOwner &&
                          request.status === "pending" ? (
                            <>
                              <button
                                className="btn btn-primary"
                                type="button"
                                onClick={() => openDecision(request, "approve")}
                              >
                                <CheckCircle2 size={16} /> قبول
                              </button>
                              <button
                                className="btn btn-outline"
                                type="button"
                                onClick={() => openDecision(request, "reject")}
                              >
                                <XCircle size={16} /> رفض
                              </button>
                            </>
                          ) : null}
                          {isAcademy &&
                          isOwner &&
                          request.status === "approved" ? (
                            <button
                              className="btn btn-outline"
                              type="button"
                              onClick={() => openDecision(request, "revoke")}
                            >
                              <Undo2 size={16} /> إلغاء الوصول
                            </button>
                          ) : null}
                          {!isAcademy && request.status === "approved" ? (
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() =>
                                setLocation(`/players/${request.playerId}`)
                              }
                            >
                              <FileText size={16} /> عرض الملف المصرح
                            </button>
                          ) : null}
                          {!isAcademy && request.status !== "approved" ? (
                            <span className="muted text-sm">
                              الملف غير متاح
                            </span>
                          ) : null}
                          {isAcademy && !isOwner ? (
                            <span className="muted text-sm">
                              يلزم مالك الأكاديمية
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {decision ? (
        <Modal
          title={actionText(decision.action)}
          onClose={() => setDecision(null)}
        >
          <form className="section-stack" onSubmit={completeDecision}>
            <p className="muted">
              الطلب متعلق باللاعب {decision.request.playerName} من نادي{" "}
              {decision.request.clubName}.
            </p>
            <label>
              <span>
                {decision.action === "approve"
                  ? "ملاحظة القرار (اختيارية)"
                  : "سبب القرار (اختياري)"}
              </span>
              <textarea
                className="field"
                rows={4}
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="اكتب ملاحظة واضحة للسجل داخل التطبيق…"
              />
            </label>
            {decisionError ? (
              <p className="text-sm text-red-600">{decisionError}</p>
            ) : null}
            <button
              className={`btn ${decision.action === "approve" ? "btn-primary" : "btn-outline"}`}
              type="submit"
              disabled={submitting}
            >
              {(() => {
                const Icon = actionIcon(decision.action);
                return <Icon size={16} />;
              })()}
              {submitting ? "جارٍ الحفظ…" : actionText(decision.action)}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
