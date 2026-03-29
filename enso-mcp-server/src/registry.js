import { registerAuthTools }
    from "./tools/auth.tools.js";

import { registerContractTools }
    from "./tools/contract.tools.js";

import { registerCustomerTools }
    from "./tools/customer.tools.js";

import { registerMeteringTools }
    from "./tools/metering.tools.js";

import { registerEntitiesTools }
    from "./tools/entities.tools.js";

import { registerInvoiceTools }
    from "./tools/invoice.tools.js";

export function registerTools(server) {

    // Auth
    registerAuthTools(server);

    // Contracts
    registerContractTools(server);

    // Customers
    registerCustomerTools(server);

    // Metering
    registerMeteringTools(server);

    // Entities
    registerEntitiesTools(server);

    // Invoices
    registerInvoiceTools(server);

}
