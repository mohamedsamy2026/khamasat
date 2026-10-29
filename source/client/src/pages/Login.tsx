
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  authPost,
  finishAuthentication,
} from "./authHelpers";

import "./Auth.css";

export default function Login() {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await authPost("login", {
        email: email.trim(),
        password,
      });

      await finishAuthentication(queryClient);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تسجيل الدخول."
      );

      setBusy(false);
    }
  }

  const registerUrl =
    `/register${window.location.search}`;

  return (
    <div className="auth-page" dir="rtl">
      <section
        className="auth-card"
        aria-labelledby="login-title"
      >
        <Link href="/" className="auth-brand">
          ATHLETE AI
        </Link>

        <h1 id="login-title">
          تسجيل الدخول
        </h1>

        <p className="auth-description">
          ادخل إلى مساحة مؤسستك لإدارة اللاعبين
          وتحليل الأداء.
        </p>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
        >
          <label className="auth-field">
            البريد الإلكتروني

            <input
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={event =>
                setEmail(event.target.value)
              }
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
              autoComplete="current-password"
              value={password}
              onChange={event =>
                setPassword(event.target.value)
              }
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
              ? "جارٍ تسجيل الدخول..."
              : "تسجيل الدخول"}
          </button>
        </form>

        <p className="auth-footer">
          ليس لديك حساب؟{" "}
          <Link href={registerUrl}>
            إنشاء حساب
          </Link>
        </p>

        <Link href="/" className="auth-back">
          العودة للرئيسية
        </Link>
      </section>
    </div>
  );
}
