
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  authPost,
  finishAuthentication,
} from "./authHelpers";

import "./Auth.css";

export default function Register() {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setError("");

    if (password !== confirmPassword) {
      setError(
        "كلمتا المرور غير متطابقتين."
      );
      return;
    }

    if (password.length < 12) {
      setError(
        "كلمة المرور يجب أن تتكون من 12 حرفًا على الأقل."
      );
      return;
    }

    setBusy(true);

    try {
      await authPost("register", {
        name: name.trim(),
        email: email.trim(),
        password,
      });

      await finishAuthentication(queryClient);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر إنشاء الحساب."
      );

      setBusy(false);
    }
  }

  const loginUrl =
    `/login${window.location.search}`;

  return (
    <div className="auth-page" dir="rtl">
      <section
        className="auth-card"
        aria-labelledby="register-title"
      >
        <Link href="/" className="auth-brand">
          ATHLETE AI
        </Link>

        <h1 id="register-title">
          إنشاء حساب
        </h1>

        <p className="auth-description">
          أنشئ حسابك للبدء في استخدام منصة
          ATHLETE AI.
        </p>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
        >
          <label className="auth-field">
            الاسم

            <input
              type="text"
              name="name"
              value={name}
              onChange={event =>
                setName(event.target.value)
              }
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </label>

          <label className="auth-field">
            البريد الإلكتروني

            <input
              type="email"
              name="email"
              dir="ltr"
              value={email}
              onChange={event =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              maxLength={255}
              placeholder="example@email.com"
              required
            />
          </label>

          <label className="auth-field">
            كلمة المرور

            <input
              type="password"
              name="password"
              value={password}
              onChange={event =>
                setPassword(event.target.value)
              }
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />

            <span className="auth-hint">
              12 حرفًا على الأقل
            </span>
          </label>

          <label className="auth-field">
            تأكيد كلمة المرور

            <input
              type="password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={event =>
                setConfirmPassword(event.target.value)
              }
              autoComplete="new-password"
              required
            />
          </label>

          {error && (
            <div
              className="auth-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "جارٍ إنشاء الحساب..."
              : "إنشاء حساب"}
          </button>
        </form>

        <p className="auth-footer">
          لديك حساب؟{" "}
          <Link href={loginUrl}>
            تسجيل الدخول
          </Link>
        </p>

        <Link href="/" className="auth-back">
          العودة للرئيسية
        </Link>
      </section>
    </div>
  );
}
