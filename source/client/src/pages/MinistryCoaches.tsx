
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";

type AuthorityRole = "admin" | "reviewer" | "viewer";
type CoachStatus = "active" | "inactive";

type Academy = {
  academyId: number;
  academyName: string;
  isDemo: boolean;
  status: string;
};

type Coach = {
  id: number;
  academyId: number;
  name: string;
  email: string;
  phone: string | null;
  specialization: string;
  status: CoachStatus;
};

type Props = {
  authorityId: number;
  role: AuthorityRole;
  onChanged?: () => void;
};

type FormData = {
  name: string;
  email: string;
  phone: string;
  specialization: string;
  status: CoachStatus;
};

type AcademyResponse = {
  academies: Academy[];
};

type CoachesResponse = {
  coaches: Coach[];
};

const initialForm: FormData = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  status: "active",
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getError(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

export default function MinistryCoaches({
  authorityId,
  role,
  onChanged,
}: Props) {
  const canManage = role === "admin";

  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const [academyId, setAcademyId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | CoachStatus>("all");

  const [loading, setLoading] = useState(true);
  const [coachesLoading, setCoachesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(
    null
  );
  const [form, setForm] = useState<FormData>(initialForm);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    setReloadKey(value => value + 1);
  };

  // Load approved, non-demo academies.
  useEffect(() => {
    const controller = new AbortController();

    async function loadAcademies() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academies`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(result, "تعذر تحميل الأكاديميات")
          );
        }

        const data = result as AcademyResponse;

        if (!Array.isArray(data.academies)) {
          throw new Error("بيانات الأكاديميات غير صالحة");
        }

        const approved = data.academies.filter(
          item => item.status === "approved" && !item.isDemo
        );

        if (controller.signal.aborted) return;

        setAcademies(approved);

        setAcademyId(previous => {
          if (
            previous &&
            approved.some(item => String(item.academyId) === previous)
          ) {
            return previous;
          }

          return approved.length
            ? String(approved[0].academyId)
            : "";
        });
      } catch (cause) {
        if (controller.signal.aborted) return;

        setAcademies([]);
        setAcademyId("");
        setError(
          cause instanceof Error
            ? cause.message
            : "حدث خطأ أثناء تحميل الأكاديميات"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAcademies();

    return () => controller.abort();
  }, [authorityId, reloadKey]);

  // Load coaches for the selected academy.
  useEffect(() => {
    if (!academyId || loading) {
      setCoaches([]);
      return;
    }

    const controller = new AbortController();

    async function loadCoaches() {
      setCoachesLoading(true);
      setError(null);
      setCoaches([]);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academies/${academyId}/coaches`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(result, "تعذر تحميل المدربين")
          );
        }

        const data = result as CoachesResponse;

        if (!Array.isArray(data.coaches)) {
          throw new Error("بيانات المدربين غير صالحة");
        }

        if (!controller.signal.aborted) {
          setCoaches(data.coaches);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "حدث خطأ أثناء تحميل المدربين"
        );
      } finally {
        if (!controller.signal.aborted) {
          setCoachesLoading(false);
        }
      }
    }

    void loadCoaches();

    return () => controller.abort();
  }, [authorityId, academyId, loading, reloadKey]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return coaches.filter(coach => {
      if (
        statusFilter !== "all" &&
        coach.status !== statusFilter
      ) {
        return false;
      }

      return (
        !term ||
        coach.name.toLocaleLowerCase().includes(term) ||
        coach.email.toLocaleLowerCase().includes(term) ||
        coach.specialization.toLocaleLowerCase().includes(term) ||
        String(coach.id).includes(term)
      );
    });
  }, [coaches, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: coaches.length,
      active: coaches.filter(
        coach => coach.status === "active"
      ).length,
      inactive: coaches.filter(
        coach => coach.status === "inactive"
      ).length,
    }),
    [coaches]
  );

  function openCreate() {
    if (!canManage || !academyId) return;

    setEditingCoach(null);
    setForm({ ...initialForm });
    setNotice(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(coach: Coach) {
    if (!canManage) return;

    setEditingCoach(coach);
    setForm({
      name: coach.name,
      email: coach.email,
      phone: coach.phone ?? "",
      specialization: coach.specialization,
      status: coach.status,
    });

    setNotice(null);
    setError(null);
    setShowForm(true);
  }

  async function submitCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || saving || !academyId) return;

    const name = form.name.trim();
    const email = form.email.trim();
    const specialization = form.specialization.trim();
    const phone = form.phone.trim();

    if (name.length < 2 || specialization.length < 2) {
      setError("الاسم والتخصص يجب أن يحتوي كل منهما على حرفين على الأقل.");
      return;
    }

    const url = editingCoach
      ? `/api/regulatory/authorities/${authorityId}/coaches/${editingCoach.id}`
      : `/api/regulatory/authorities/${authorityId}/academies/${academyId}/coaches`;

    const body = editingCoach
      ? {
          name,
          email,
          phone: phone || null,
          specialization,
          status: form.status,
        }
      : {
          name,
          email,
          phone: phone || null,
          specialization,
        };

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: editingCoach ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(
            result,
            `تعذر حفظ المدرب (${response.status})`
          )
        );
      }

      setShowForm(false);
      setEditingCoach(null);
      setForm({ ...initialForm });
      setNotice(
        editingCoach
          ? "تم تحديث بيانات المدرب بنجاح."
          : "تمت إضافة المدرب بنجاح."
      );

      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "فشل حفظ بيانات المدرب"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(coach: Coach) {
    if (!canManage || saving) return;

    const nextStatus: CoachStatus =
      coach.status === "active" ? "inactive" : "active";

    const action =
      nextStatus === "inactive" ? "إيقاف" : "تفعيل";

    if (!window.confirm(`هل تريد ${action} المدرب "${coach.name}"؟`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/coaches/${coach.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        }
      );

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(result, "تعذر تعديل حالة المدرب")
        );
      }

      setNotice("تم تحديث حالة المدرب بنجاح.");
      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "فشلت عملية التحديث"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            إدارة المدربين
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            المدربون المسجلون في الأكاديميات الرسمية المعتمدة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading || coachesLoading || saving}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading || coachesLoading ? "animate-spin" : ""}
            />
            تحديث
          </button>

          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              disabled={!academyId || loading || saving}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={17} />
              إضافة مدرب
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "إجمالي المدربين",
            value: stats.total,
            icon: Users,
          },
          {
            label: "المدربون النشطون",
            value: stats.active,
            icon: CheckCircle2,
          },
          {
            label: "غير النشطين",
            value: stats.inactive,
            icon: UserRound,
          },
        ].map(item => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {item.label}
                </span>

                <Icon size={19} className="text-slate-400" />
              </div>

              <p className="mt-5 text-3xl font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <label className="flex min-w-52 flex-1 items-center gap-2">
            <Building2 size={18} className="shrink-0 text-slate-400" />

            <select
              aria-label="اختيار الأكاديمية"
              value={academyId}
              onChange={event => {
                setAcademyId(event.target.value);
                setSearch("");
              }}
              disabled={loading || saving}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {academies.length === 0 && (
                <option value="">لا توجد أكاديميات معتمدة</option>
              )}

              {academies.map(academy => (
                <option
                  key={academy.academyId}
                  value={academy.academyId}
                >
                  {academy.academyName}
                </option>
              ))}
            </select>
          </label>

          <div className="relative min-w-52 flex-1">
            <Search
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث عن مدرب..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            aria-label="تصفية حسب حالة المدرب"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(
                event.target.value as "all" | CoachStatus
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
        </div>

        {loading || coachesLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            جارٍ تحميل البيانات...
          </div>
        ) : academies.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center">
            <Building2 size={30} className="text-slate-300" />

            <p className="text-sm text-slate-500">
              لا توجد أكاديميات حقيقية معتمدة حاليًا.
            </p>

            <p className="text-xs text-slate-400">
              الأكاديميات التجريبية مستبعدة من إدارة المدربين الرسمية.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <Users size={30} className="text-slate-300" />

            <p className="text-sm text-slate-500">
              {coaches.length === 0
                ? "لا يوجد مدربون مسجلون في هذه الأكاديمية."
                : "لا توجد نتائج مطابقة."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">
                    المدرب
                  </th>
                  <th className="px-5 py-4 font-medium">
                    البريد الإلكتروني
                  </th>
                  <th className="px-5 py-4 font-medium">
                    الهاتف
                  </th>
                  <th className="px-5 py-4 font-medium">
                    التخصص
                  </th>
                  <th className="px-5 py-4 font-medium">
                    الحالة
                  </th>
                  <th className="px-5 py-4 font-medium">
                    الإجراءات
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map(coach => (
                  <tr key={coach.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {coach.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        ID: {coach.id}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {coach.email}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {coach.phone || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {coach.specialization}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs ${
                          coach.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {coach.status === "active"
                          ? "نشط"
                          : "غير نشط"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {canManage ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(coach)}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
                          >
                            <Pencil size={14} />
                            تعديل
                          </button>

                          <button
                            type="button"
                            onClick={() => void toggleStatus(coach)}
                            disabled={saving}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
                          >
                            {coach.status === "active"
                              ? "إيقاف"
                              : "تفعيل"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          عرض فقط
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-dialog-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3
                id="coach-dialog-title"
                className="text-lg font-semibold text-slate-900"
              >
                {editingCoach
                  ? "تعديل بيانات المدرب"
                  : "إضافة مدرب جديد"}
              </h3>

              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={event => void submitCoach(event)}>
              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  اسم المدرب
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={form.name}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  البريد الإلكتروني
                  <input
                    required
                    type="email"
                    maxLength={255}
                    value={form.email}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  رقم الهاتف
                  <input
                    type="tel"
                    maxLength={30}
                    value={form.phone}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        phone: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  التخصص
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={form.specialization}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        specialization: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                {editingCoach && (
                  <label className="block text-sm text-slate-700">
                    حالة المدرب
                    <select
                      value={form.status}
                      onChange={event =>
                        setForm(previous => ({
                          ...previous,
                          status: event.target.value as CoachStatus,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <option value="active">نشط</option>
                      <option value="inactive">غير نشط</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "جارٍ الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
