// src/tools/entities.tools.js

import { ensoRequest, errorResponse } from "./http.js";

export function registerEntitiesTools(server) {

    // -------------------------
    // GET ENTITIES BY TYPE
    // -------------------------
    server.tool(
        "enso_get_entities",
        "Get all entities grouped by type (customer, seller, etc.) with addresses and organisation details.",
        {},
        async () => {

            try {
                const data = await ensoRequest("GET", "/entities/all");

                const entities = data?.data || [];

                const text = entities.length
                    ? entities.map(e =>
                        `• ${e.legalName} (${e.id}) - Type: ${e.entityFor} | Org: ${e.Organisation?.name || "N/A"}`
                    ).join("\n")
                    : "No entities found.";

                return {
                    content: [{
                        type: "text",
                        text: `Entities (${entities.length} total)\n${text}`,
                    }],
                };

            } catch (err) {
                const res = errorResponse(
                    err?.response?.data?.message || err.message || "Error",
                    err?.response?.data?.errors  || [err.message || "Invalid parameters"]
                );
                return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
            }
        }
    );
}
