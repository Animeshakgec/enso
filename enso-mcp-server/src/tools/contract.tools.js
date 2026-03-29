// src/tools/contract.tools.js

import { z } from "zod";
import FormData from "form-data";
import fs from "fs";
import { ensoRequest, errorResponse } from "./http.js";

export function registerContractTools(server) {

    // -------------------------
    // CREATE CONTRACT
    // -------------------------
    server.tool(
        "enso_create_contract",
        "Create a new contract between a seller entity and a purchaser entity with a billing plan.",
        {
            SellerEntityId:    z.string().describe("ID of the seller entity"),
            PurchaserEntityId: z.string().describe("ID of the purchaser entity"),
            InvoiceTemplateId: z.string().describe("ID of the invoice template"),
            planId:            z.string().describe("Plan ID to attach to the contract"),
            startDate:         z.string().describe("Plan start date YYYY-MM-DD"),
            endDate:           z.string().describe("Plan end date YYYY-MM-DD"),
            taxName:           z.string().optional().describe("Optional tax name e.g. GST, VAT"),
            taxPercentage:     z.number().optional().describe("Optional tax percentage e.g. 18"),
            filePath:          z.string().optional().describe("Optional absolute path to a contract document file"),
        },
        async ({ SellerEntityId, PurchaserEntityId, InvoiceTemplateId, planId, startDate, endDate, taxName, taxPercentage, filePath }) => {

            try {
                const form = new FormData();
                form.append("SellerEntityId",    SellerEntityId);
                form.append("PurchaserEntityId", PurchaserEntityId);
                form.append("InvoiceTemplateId", InvoiceTemplateId);
                form.append("Plans", JSON.stringify({ planId, startDate, endDate }));

                if (taxName && taxPercentage !== undefined) {
                    form.append("taxes", JSON.stringify({ name: taxName, percentage: taxPercentage }));
                }
                if (filePath && fs.existsSync(filePath)) {
                    form.append("file", fs.createReadStream(filePath));
                }

                const contract = await ensoRequest("POST", "/contracts/", null, form);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Contract created\n${JSON.stringify(contract, null, 2)}`,
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
