// src/tools/invoice.tools.js

import { z } from "zod";
import { ensoRequest, errorResponse } from "./http.js";

export function registerInvoiceTools(server) {

    // -------------------------
    // CREATE MANUAL INVOICE
    // -------------------------
    server.tool(
        "enso_create_manual_invoice",
        "Create a single manual invoice for a contract plan with line items.",
        {
            contractPlanId: z.string().describe("Contract plan ID"),
            date:           z.string().describe("Invoice date YYYY-MM-DD"),
            fromDate:       z.string().describe("Billing period start YYYY-MM-DD"),
            toDate:         z.string().describe("Billing period end YYYY-MM-DD"),
            invoiceItems:   z.array(z.object({
                title:       z.string(),
                description: z.string().optional(),
                price:       z.number(),
                quantity:    z.number(),
                fromDate:    z.string().optional(),
                toDate:      z.string().optional(),
            })).describe("Line items for the invoice"),
        },
        async ({ contractPlanId, date, fromDate, toDate, invoiceItems }) => {

            try {
                const invoice = await ensoRequest("POST", "/invoices/", {
                    contractPlanId,
                    invoiceData: { date, fromDate, toDate },
                    invoiceItems,
                });

                return {
                    content: [{
                        type: "text",
                        text: `✅ Invoice created\n${JSON.stringify(invoice, null, 2)}`,
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
    // CREATE MULTIPLE INVOICES
    // -------------------------
    server.tool(
        "enso_create_multiple_invoices",
        "Create multiple invoices in a single batch request.",
        {
            invoices: z.array(z.object({
                contractPlanId:     z.string(),
                date:               z.string(),
                fromDate:           z.string(),
                toDate:             z.string(),
                customerIdentifier: z.string().optional(),
                invoiceItems:       z.array(z.object({
                    title:       z.string(),
                    description: z.string().optional(),
                    price:       z.number(),
                    quantity:    z.number(),
                })),
            })).describe("Array of invoice objects"),
        },
        async ({ invoices }) => {

            try {
                const payload = invoices.map(({ contractPlanId, date, fromDate, toDate, invoiceItems, customerIdentifier }) => ({
                    contractPlanId,
                    invoiceData: { date, fromDate, toDate },
                    invoiceItems,
                    customerIdentifier,
                }));

                const data = await ensoRequest("POST", "/invoices/batch", { invoices: payload });

                return {
                    content: [{
                        type: "text",
                        text: `✅ Batch invoices created\n${JSON.stringify(data, null, 2)}`,
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
    // GET INVOICES
    // -------------------------
    server.tool(
        "enso_get_invoices",
        "Retrieve a paginated list of all invoices.",
        {
            page:  z.number().optional().describe("Page number (default: 1)"),
            limit: z.number().optional().describe("Items per page (default: 10)"),
        },
        async ({ page = 1, limit = 10 }) => {

            try {
                const data = await ensoRequest("GET", `/invoices/?page=${page}&limit=${limit}`);

                const rows  = data?.data?.rows  || [];
                const count = data?.data?.count || 0;

                const text = rows.length
                    ? rows.map(inv =>
                        `• ${inv.number || inv.id} | Status: ${inv.status} | Date: ${inv.date?.split("T")[0] || "N/A"}`
                    ).join("\n")
                    : "No invoices found.";

                return {
                    content: [{
                        type: "text",
                        text: `Invoices (${count} total)\n${text}`,
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
    // RAISE INVOICE
    // -------------------------
    server.tool(
        "enso_raise_invoice",
        "Raise (finalize) an invoice by its ID, making it ready to send.",
        {
            id: z.string().describe("Invoice ID to raise"),
        },
        async ({ id }) => {

            try {
                const data = await ensoRequest("POST", `/invoices/${id}/raise`);

                return {
                    content: [{
                        type: "text",
                        text:
                            `✅ Invoice raised
ID:     ${data?.data?.id || id}
Number: ${data?.data?.number || "N/A"}
Status: ${data?.data?.status || "N/A"}`,
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
    // SEND INVOICE
    // -------------------------
    server.tool(
        "enso_send_invoice",
        "Send a raised invoice to the customer by its ID.",
        {
            id: z.string().describe("Invoice ID to send"),
        },
        async ({ id }) => {

            try {
                const data = await ensoRequest("POST", `/invoices/${id}/send`);

                return {
                    content: [{
                        type: "text",
                        text:
                            `✅ Invoice sent
ID:     ${data?.data?.id || id}
Number: ${data?.data?.number || "N/A"}
Status: ${data?.data?.status || "N/A"}`,
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
    // UPDATE INVOICE
    // -------------------------
    server.tool(
        "enso_update_invoice",
        "Update an invoice status — e.g. cancel it with a reason.",
        {
            id:       z.string().describe("Invoice ID"),
            status:   z.string().describe("New status e.g. cancelled"),
            comments: z.string().optional().describe("Reason or comments for the update"),
        },
        async ({ id, status, comments }) => {

            try {
                const data = await ensoRequest("PUT", `/invoices/${id}`, { status, comments });

                return {
                    content: [{
                        type: "text",
                        text:
                            `✅ Invoice updated
ID:     ${data?.data?.id || id}
Status: ${data?.data?.status || status}`,
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
