// src/tools/metering.tools.js

import { z } from "zod";
import FormData from "form-data";
import fs from "fs";
import { ensoRequest, errorResponse } from "./http.js";

export function registerMeteringTools(server) {

    // -------------------------
    // CREATE EVENT
    // -------------------------
    server.tool(
        "enso_create_event",
        "Record a single metering/usage event for a customer entity.",
        {
            metric:           z.string().describe("Metric name e.g. api_calls, storage_gb"),
            value:            z.number().describe("Numeric value of the event"),
            timestamp:        z.string().describe("ISO 8601 timestamp e.g. 2024-01-15T10:30:00Z"),
            CustomerEntityId: z.string().describe("Customer entity ID (starts with ent_)"),
            metadata:         z.record(z.any()).optional().describe("Optional key-value metadata"),
            eventId:          z.string().optional().describe("Optional idempotency ID"),
        },
        async ({ metric, value, timestamp, CustomerEntityId, metadata, eventId }) => {

            try {
                const event = await ensoRequest("POST", "/events/", {
                    metric, value, timestamp, CustomerEntityId,
                    metadata: metadata || {},
                    eventId,
                });

                return {
                    content: [{
                        type: "text",
                        text:
                            `✅ Event recorded
Metric:   ${metric}
Value:    ${value}
Entity:   ${CustomerEntityId}
Time:     ${timestamp}`,
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

    // -------------------------
    // CREATE EVENTS BATCH
    // -------------------------
    server.tool(
        "enso_create_events_batch",
        "Send multiple metering events in a single batch request.",
        {
            events: z.array(z.object({
                CustomerEntityId: z.string(),
                metric:           z.string(),
                value:            z.number(),
                timestamp:        z.string(),
                metadata:         z.record(z.any()).optional(),
                eventId:          z.string().optional(),
                JobId:            z.string().optional(),
            })).describe("Array of event objects"),
        },
        async ({ events }) => {

            try {
                const data = await ensoRequest("POST", "/events/batch", { events });

                const summary = data?.data?.summary || {};

                return {
                    content: [{
                        type: "text",
                        text:
                            `Batch Events Result
Total:   ${summary.total ?? events.length}
Success: ${summary.success ?? 0}
Failed:  ${summary.failed ?? 0}`,
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

    // -------------------------
    // IMPORT EVENTS
    // -------------------------
    server.tool(
        "enso_import_events",
        "Import events from a CSV or JSON file with optional idempotency config.",
        {
            filePath:        z.string().describe("Absolute path to the import file"),
            idempotencyKeys: z.array(z.string()).optional().describe("Fields used for idempotency"),
        },
        async ({ filePath, idempotencyKeys = [] }) => {

            if (!fs.existsSync(filePath)) {
                const err = errorResponse("File not found", [`No file found at: ${filePath}`]);
                return { content: [{ type: "text", text: JSON.stringify(err, null, 2) }] };
            }

            try {
                const form = new FormData();
                form.append("config", JSON.stringify({ headers: {}, idempotency: idempotencyKeys }));
                form.append("file", fs.createReadStream(filePath));

                const data = await ensoRequest("POST", "/events/import", null, form);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Events imported\n${JSON.stringify(data, null, 2)}`,
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
