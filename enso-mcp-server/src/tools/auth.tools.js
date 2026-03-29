// src/tools/auth.tools.js

import { z } from "zod";
import {
    ensoPublicRequest,
    tokenStore,
    setTokens,
    isTokenExpired,
    errorResponse,
} from "./http.js";

export function registerAuthTools(server) {

    // -------------------------
    // LOGIN
    // -------------------------
    server.tool(
        "enso_login",
        "Login to Enso using clientKey, clientSecret and username. Must be called before any other tool. Saves Bearer token automatically.",
        {
            clientKey: z.string().describe("Client key from Enso Settings → Users → Create API Keys"),
            clientSecret: z.string().describe("Client secret from Enso Settings → Users → Create API Keys"),
            username: z.string().describe("Your Enso account email / username"),
        },
        async ({ clientKey, clientSecret, username }) => {

            try {
                const data = await ensoPublicRequest("POST", "/auth/system-login", {
                    clientKey,
                    clientSecret,
                    username,
                });

                const access = data?.data?.accessToken || data?.accessToken || data?.token || null;
                const refresh = data?.data?.refreshToken || data?.refreshToken || null;
                const expiresIn = data?.data?.expiresIn || data?.expiresIn || null;

                if (!access) {
                    const err = errorResponse("Login failed", ["No access token received in response"]);
                    return { content: [{ type: "text", text: JSON.stringify(err, null, 2) }] };
                }

                setTokens(access, refresh, expiresIn);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Login successful\nToken expires at: ${new Date(tokenStore.expiresAt).toISOString()}`,
                    }],
                };

            } catch (err) {
                const res = errorResponse(
                    err?.response?.data?.message || err.message || "Login failed",
                    err?.response?.data?.errors || [err.message || "Invalid parameters"]
                );
                return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
            }
        }
    );

    // -------------------------
    // REFRESH TOKEN
    // -------------------------
    server.tool(
        "enso_refresh_token",
        "Refresh the Enso access token using the stored refresh token.",
        {},
        async () => {

            if (!tokenStore.refreshToken) {
                const err = errorResponse("No refresh token available", ["Please login again using enso_login"]);
                return { content: [{ type: "text", text: JSON.stringify(err, null, 2) }] };
            }

            try {
                const data = await ensoPublicRequest("POST", "/auth/refresh");

                const access = data?.data?.accessToken || data?.accessToken || data?.token || null;
                const refresh = data?.data?.refreshToken || data?.refreshToken || null;
                const expiresIn = data?.data?.expiresIn || data?.expiresIn || null;

                if (!access) {
                    const err = errorResponse("Token refresh failed", ["No access token received"]);
                    return { content: [{ type: "text", text: JSON.stringify(err, null, 2) }] };
                }

                setTokens(access, refresh, expiresIn);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Token refreshed\nExpires at: ${new Date(tokenStore.expiresAt).toISOString()}`,
                    }],
                };

            } catch (err) {
                const res = errorResponse(
                    err?.response?.data?.message || err.message || "Refresh failed",
                    err?.response?.data?.errors || [err.message || "Invalid parameters"]
                );
                return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
            }
        }
    );

    // -------------------------
    // AUTH STATUS
    // -------------------------
    //params
    server.tool(
        "enso_auth_status",
        "Check current authentication status and whether the token is still valid.",
        {},
        async () => {

            const status = {
                authenticated: !!tokenStore.accessToken,
                tokenExpired: isTokenExpired(),
                hasRefreshToken: !!tokenStore.refreshToken,
                expiresAt: tokenStore.expiresAt
                    ? new Date(tokenStore.expiresAt).toISOString()
                    : null,
            };

            return {
                content: [{
                    type: "text",
                    text:
                        `Auth Status
                        Authenticated:    ${status.authenticated}
                        Token Expired:    ${status.tokenExpired}
                        Has Refresh Token:${status.hasRefreshToken}
                        Expires At:       ${status.expiresAt || "N/A"}`,
                }],
            };
        }
    );
}
