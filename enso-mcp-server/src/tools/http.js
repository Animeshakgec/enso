// src/tools/http.js
// Shared HTTP helper — token store + ensoRequest

import axios from "axios";

const BASE_URL = process.env.ENSO_BASE_URL;

// ─── Token Store ──────────────────────────────────────────────────────────────

export const tokenStore = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
};

export function setTokens(accessToken, refreshToken, expiresIn) {
    tokenStore.accessToken = accessToken;
    if (refreshToken) tokenStore.refreshToken = refreshToken;
    tokenStore.expiresAt = Date.now() + ((expiresIn || 3600) - 60) * 1000;
}

export function isTokenExpired() {
    if (!tokenStore.expiresAt) return true;
    return Date.now() >= tokenStore.expiresAt;
}

// ─── Standardized Error Response ─────────────────────────────────────────────

export function errorResponse(message, errors = []) {
    return {
        status: "error",
        message: message || "Error",
        errors: errors.length > 0 ? errors : ["Invalid parameters"],
        data: {},
    };
}

// ─── Main Request Helper ──────────────────────────────────────────────────────

export async function ensoRequest(method, path, data = null, formData = null) {

    if (!tokenStore.accessToken) {
        throw new Error("Not authenticated. Please call enso_login first.");
    }

    const headers = {
        Authorization: `Bearer ${tokenStore.accessToken}`,
    };

    if (formData) {
        Object.assign(headers, formData.getHeaders());
    } else {
        headers["Content-Type"] = "application/json";
    }

    const res = await axios({
        method,
        url: `${BASE_URL}${path}`,
        headers,
        data: formData || data || undefined,
    });

    return res.data;
}

// Public request (no auth — for login / refresh)
export async function ensoPublicRequest(method, path, data = null) {

    const res = await axios({
        method,
        url: `${BASE_URL}${path}`,
        headers: { "Content-Type": "application/json" },
        data: data || undefined,
    });

    return res.data;
}
