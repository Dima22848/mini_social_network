import type {
  AuthResponse,
  ForgotPasswordResponse,
  MeResponse,
  SessionsResponse,
  SuccessResponse,
} from "../types/auth.types";
import {
  apiRequestWithAuth,
  apiUploadRequestWithAuth,
} from '../lib/auth-refresh-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type ApiErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = "Request failed";

    try {
      const errorBody = (await response.json()) as ApiErrorBody;

      if (Array.isArray(errorBody.message)) {
        errorMessage = errorBody.message.join(", ");
      } else if (errorBody.message) {
        errorMessage = errorBody.message;
      } else if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      errorMessage = response.statusText;
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export const authApi = {
  register(data: { email: string; username: string; password: string }) {
    return apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  login(data: { email: string; password: string; rememberMe: boolean }) {
    return apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  refresh(options: { signal?: AbortSignal } = {}) {
    return apiRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      signal: options.signal,
    });
  },

  me(accessToken: string) {
    return apiRequestWithAuth<MeResponse>("/auth/me", accessToken, {
      method: "GET",
    });
  },

  logout() {
    return apiRequest<SuccessResponse>("/auth/logout", {
      method: "POST",
    });
  },

  forgotPassword(data: { email: string }) {
    return apiRequest<ForgotPasswordResponse>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  resetPassword(data: { token: string; password: string }) {
    return apiRequest<SuccessResponse>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateMe(
    accessToken: string,
    data: {
      username?: string;
      bio?: string;
      age?: number;
      city?: string;
      country?: string;
      email?: string;
      avatarUrl?: string | null;
    },
  ) {
    return apiRequestWithAuth<MeResponse>("/auth/me", accessToken, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },





  changePassword(accessToken: string, data: { oldPassword: string; newPassword: string }) {
    return apiRequestWithAuth<SuccessResponse>("/auth/change-password", accessToken, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  requestEmailVerification(accessToken: string) {
    return apiRequestWithAuth<SuccessResponse & { message?: string; verifyLink?: string }>("/auth/email-verification", accessToken, {
      method: "POST",
    });
  },

  verifyEmail(data: { token: string }) {
    return apiRequest<MeResponse & SuccessResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  uploadAvatar(accessToken: string, file: File) {
    const formData = new FormData();
    formData.set("file", file);

    return apiUploadRequestWithAuth<{ url: string; filename: string; mimeType: string; sizeBytes: number | null }>(
      "/auth/avatar-upload",
      accessToken,
      formData,
    );
  },

  getSessions(accessToken: string) {
    return apiRequestWithAuth<SessionsResponse>("/auth/sessions", accessToken, {
      method: "GET",
    });
  },

  logoutAll(accessToken: string) {
    return apiRequestWithAuth<SuccessResponse>("/auth/logout-all", accessToken, {
      method: "POST",
    });
  },

  logoutAllExceptCurrent(accessToken: string) {
    return apiRequestWithAuth<SuccessResponse>("/auth/logout-all-except-current", accessToken, {
      method: "POST",
    });
  },

  logoutSession(accessToken: string, sessionId: string) {
    return apiRequestWithAuth<SuccessResponse>(`/auth/sessions/${sessionId}`, accessToken, {
      method: "DELETE",
    });
  },
};
