// src/tools/customer.tools.js

import { z } from "zod";
import { ensoRequest, errorResponse } from "./http.js";

export function registerCustomerTools(server) {

    // -------------------------
    // CREATE CUSTOMER
    // -------------------------
    server.tool(
        "enso_create_customer",
        "Create a new customer with entity details including contact info and address.",
        {
            name:        z.string().describe("Customer display name"),
            legalName:   z.string().describe("Legal / registered entity name"),
            alias:       z.string().optional().describe("Short alias or slug"),
            email:       z.string().email().describe("Primary billing email"),
            phoneNumber: z.string().optional().describe("Contact phone number"),
            cc:          z.string().optional().describe("CC email for invoices"),
            bcc:         z.string().optional().describe("BCC email for invoices"),
            address:     z.string().optional().describe("Street address"),
            city:        z.string().optional().describe("City"),
            zip:         z.string().optional().describe("ZIP or postal code"),
            StateId:     z.string().optional().describe("State ID from Enso"),
            taxId:       z.string().optional().describe("Tax identification number"),
        },
        async ({ name, legalName, alias, email, phoneNumber, cc, bcc, address, city, zip, StateId, taxId }) => {

            try {
                const body = {
                    name,
                    entity: {
                        legalName, alias, email, phoneNumber, cc, bcc,
                        address: address
                            ? { address, city: city || "", zip: zip || "", StateId: StateId || "", taxId }
                            : undefined,
                    },
                };

                const customer = await ensoRequest("POST", "/customers/", body);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Customer created\n${JSON.stringify(customer, null, 2)}`,
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
    // GET CUSTOMER ENTITIES
    // -------------------------
    server.tool(
        "enso_get_customer_entities",
        "Get a paginated list of customer entities with addresses and contract counts.",
        {
            page:  z.number().optional().describe("Page number (default: 1)"),
            limit: z.number().optional().describe("Items per page (default: 10)"),
        },
        async ({ page = 1, limit = 10 }) => {

            try {
                const data = await ensoRequest("GET", `/entities/list?page=${page}&limit=${limit}`);

                const rows = data?.data?.rows || [];
                const count = data?.data?.count || 0;

                const text = rows.length
                    ? rows.map(e =>
                        `• ${e.legalName} (${e.id}) - Contracts: ${e.contractCount ?? 0} | Email: ${e.email?.[0] || "N/A"}`
                    ).join("\n")
                    : "No customer entities found.";

                return {
                    content: [{
                        type: "text",
                        text: `Customer Entities (${count} total)\n${text}`,
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
